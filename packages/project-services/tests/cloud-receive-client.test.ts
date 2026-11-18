/**
 * The local half of a receive (technical design, "Receiving: revision set,
 * stage, check, apply", WP2.7): staging, the check against what the review
 * showed, the one-transaction commit, placement under the folder lock, and
 * resume from each state a crash leaves. The cloud is a fake transport that
 * holds documents and bytes in memory, so the local database holds only the
 * local side.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PauseGate } from "@nodetool-ai/config/testing/pause-harness";
import {
  Asset,
  createCloudLink,
  getCloudLinkDocumentByCloudId,
  getCloudLinkFile,
  getCloudReceive,
  initTestDb,
  listCloudReceives,
  listTransferPlacements,
  setWorkflowFileSync,
  Workflow,
  WorkflowVersion,
  type CloudLinkRow
} from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import type {
  CaptureRevisionSetOutput,
  RevisionSetFile
} from "@nodetool-ai/protocol/api-schemas/receive.js";
import type { TransferDocumentKind } from "@nodetool-ai/protocol/api-schemas/transfer.js";
import {
  cancelReceive,
  captureReceive,
  ReceiveSetExpiredError,
  resumeReceives,
  runReceive,
  type ReceiveTransport
} from "../src/cloud-receive-client.js";
import { documentFileSync } from "../src/document-file-sync.js";
import { identityHash, transferPayloadOf, type TransferPayloadContent } from "../src/transfer-documents.js";
import { workflowFileAdapter } from "../src/workflow-file.js";

const USER = "local-user";
const PROJECT = "a".repeat(32);
const CLOUD_PROJECT = "c".repeat(32);
const REPLACING = "receive.place.replacing";

function id(): string {
  return randomBytes(16).toString("hex");
}

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function workflowPayload(name: string, assetId: string | null, marker = "one"): TransferPayloadContent {
  const nodes = [
    { id: "n0", type: "nodetool.constant.String", data: { value: marker } },
    ...(assetId
      ? [{ id: "n1", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: assetId } } }]
      : [])
  ];
  return { name, description: "", tags: [], graph: { nodes, edges: [] }, settings: {}, run_mode: "workflow" };
}

interface CloudDocument {
  kind: TransferDocumentKind;
  id: string;
  name: string;
  payload: TransferPayloadContent;
  files: RevisionSetFile[];
}

/** A cloud server that answers the `receive` endpoints from memory. */
class FakeCloud implements ReceiveTransport {
  readonly documents = new Map<string, CloudDocument>();
  readonly blobs = new Map<string, Uint8Array>();
  /** Hashes an owner erased: the cloud lists their files as missing. */
  readonly erased = new Set<string>();
  readonly sets = new Map<string, CloudDocument[]>();
  readonly released: string[] = [];
  readonly downloads: string[] = [];
  readonly documentReads: string[] = [];
  expired = false;
  /** Sets the cloud no longer serves. */
  readonly expiredSets = new Set<string>();
  /** After this many downloads, the set of the last one expires. */
  expireAfterDownloads: number | null = null;
  failNextDownload = false;

  putWorkflow(name: string, file: { bytes: Uint8Array; name: string; path: string | null } | null, docId = id()) {
    const assetId = file ? id() : null;
    const files: RevisionSetFile[] = [];
    if (file && assetId) {
      const hash = sha(file.bytes);
      this.blobs.set(hash, file.bytes);
      files.push({ asset_id: assetId, hash, size: file.bytes.byteLength, name: file.name, content_type: "image/png", path: file.path });
    }
    const document: CloudDocument = { kind: "workflow", id: docId, name, payload: workflowPayload(name, assetId), files };
    this.documents.set(docId, document);
    return document;
  }

  async capture(input: { project_id: string }): Promise<CaptureRevisionSetOutput> {
    expect(input.project_id).toBe(CLOUD_PROJECT);
    const setId = id();
    const snapshot = [...this.documents.values()].map((document) => structuredClone(document));
    this.sets.set(setId, snapshot);
    return {
      set_id: setId,
      project_id: CLOUD_PROJECT,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      documents: snapshot.map((document) => ({
        kind: document.kind,
        document_id: document.id,
        name: document.name,
        revision_id: id(),
        content_hash: identityHash(document.payload),
        // A file whose bytes an owner erased is listed as missing, as the server does.
        files: document.files.filter((file) => !this.erased.has(file.hash)),
        missing_files: document.files.filter((file) => this.erased.has(file.hash)).map((file) => file.asset_id)
      }))
    };
  }

  async document(input: { set_id: string; kind: TransferDocumentKind; document_id: string }) {
    if (this.expired || this.expiredSets.has(input.set_id)) throw new ReceiveSetExpiredError();
    const document = this.sets.get(input.set_id)?.find((entry) => entry.id === input.document_id);
    if (!document) throw new Error("not in the set");
    this.documentReads.push(document.id);
    return {
      kind: input.kind,
      document_id: input.document_id,
      content_hash: identityHash(document.payload),
      document: structuredClone(document.payload)
    };
  }

  async downloadFile(input: { set_id: string; hash: string }, destination: string): Promise<"ok" | "ERASED"> {
    if (this.expired || this.expiredSets.has(input.set_id)) throw new ReceiveSetExpiredError();
    if (this.failNextDownload) {
      this.failNextDownload = false;
      throw new Error("The connection dropped");
    }
    const bytes = this.blobs.get(input.hash);
    if (!bytes) return "ERASED";
    this.downloads.push(input.hash);
    await writeFile(destination, bytes);
    if (this.expireAfterDownloads !== null && this.downloads.length >= this.expireAfterDownloads) {
      this.expiredSets.add(input.set_id);
      this.expireAfterDownloads = null;
    }
    return "ok";
  }

  async release(input: { set_id: string }): Promise<void> {
    this.released.push(input.set_id);
  }
}

describe("receiving a cloud project", { timeout: 30_000 }, () => {
  let root: string;
  let folder: Workspace;
  let cloud: FakeCloud;
  let link: CloudLinkRow;

  beforeEach(async () => {
    initTestDb();
    root = await mkdtemp(join(tmpdir(), "nodetool-receive-"));
    folder = createLocalWorkspace(join(root, PROJECT));
    await folder.mkdir("");
    setProjectFolderResolver(async (projectId): Promise<ProjectFolderResolution> => {
      if (projectId !== PROJECT) return { ok: false, reason: "No such folder" };
      return { ok: true, projectId, workspace: folder };
    });
    setWorkflowFileSync(documentFileSync(workflowFileAdapter));
    cloud = new FakeCloud();
    link = await createCloudLink({
      userId: USER,
      projectId: PROJECT,
      serverKey: "0123456789abcdef",
      accountId: "account-1",
      cloudProjectId: CLOUD_PROJECT
    });
  });

  afterEach(async () => {
    setWorkflowFileSync(null);
    setProjectFolderResolver(null);
    await rm(root, { recursive: true, force: true });
  });

  const stagingRoot = () => join(root, PROJECT, ".nodetool", "cloud-staging");

  it("receives a new workflow and its file, writes both into the folder and records the bases", async () => {
    const bytes = randomBytes(64);
    const document = cloud.putWorkflow("Edit", { bytes, name: "still.png", path: "media/still.png" });
    const file = document.files[0]!;

    const review = await captureReceive(cloud, link);
    expect(review.documents).toMatchObject([{ cloudId: document.id, status: "new", decision: "receive" }]);

    const outcome = await runReceive(cloud, review.setId);
    expect(outcome).toMatchObject({ status: "finished", result: { received: [{ id: document.id, name: "Edit" }] } });

    const workflow = await Workflow.get<Workflow>(document.id);
    expect(workflow?.project_id).toBe(PROJECT);
    expect(identityHash(await transferPayloadOf("workflow", document.id))).toBe(identityHash(document.payload));
    expect(workflow?.file_path).toBeTruthy();
    expect(await folder.readText(workflow!.file_path!)).toContain(document.id);

    const asset = await Asset.get<Asset>(file.asset_id);
    expect(asset).toMatchObject({ project_id: PROJECT, workspace_path: "media/still.png", content_hash: file.hash });
    expect(Buffer.from((await folder.read("media/still.png"))!).equals(bytes)).toBe(true);
    expect(asset?.metadata).toMatchObject({ workspace_size: bytes.byteLength });

    expect(await getCloudLinkDocumentByCloudId(link.id, "workflow", document.id)).toMatchObject({
      local_id: document.id,
      base_content_hash: identityHash(document.payload)
    });
    expect(await getCloudLinkFile(link.id, file.asset_id)).toMatchObject({ base_hash: file.hash });
    expect(await getCloudReceive(review.setId)).toBeNull();
    expect(await listTransferPlacements(PROJECT)).toEqual([]);
    expect(existsSync(join(stagingRoot(), review.setId))).toBe(false);
    expect(cloud.released).toEqual([review.setId]);

    // A second receive finds the local copy equal to the cloud and writes nothing.
    const again = await captureReceive(cloud, link);
    expect(again.documents).toMatchObject([{ status: "same" }]);
    const second = await runReceive(cloud, again.setId);
    expect(second).toMatchObject({ status: "finished", result: { received: [] } });
    expect(cloud.downloads).toHaveLength(1);
  });

  it("receives a cloud document whose id a document of another project holds under a new id (review F15)", async () => {
    const otherProject = "b".repeat(32);
    const document = cloud.putWorkflow("Edit", null);
    const theirs = await Workflow.create<Workflow>({
      id: document.id,
      user_id: USER,
      project_id: otherProject,
      name: "Another project's workflow",
      description: "",
      tags: [],
      access: "private",
      graph: { nodes: [], edges: [] },
      run_mode: "workflow"
    });
    const before = identityHash(await transferPayloadOf("workflow", theirs.id));

    const review = await captureReceive(cloud, link);
    const [planned] = review.documents;
    expect(planned).toMatchObject({ cloudId: document.id, status: "new", decision: "receive" });
    expect(planned?.localId).not.toBe(document.id);
    expect(await runReceive(cloud, review.setId)).toMatchObject({ status: "finished" });

    const kept = await Workflow.get<Workflow>(document.id);
    expect(kept).toMatchObject({ project_id: otherProject, name: "Another project's workflow" });
    expect(identityHash(await transferPayloadOf("workflow", document.id))).toBe(before);
    const received = await Workflow.get<Workflow>(planned?.localId ?? "");
    expect(received).toMatchObject({ project_id: PROJECT, name: "Edit" });
    expect(await getCloudLinkDocumentByCloudId(link.id, "workflow", document.id)).toMatchObject({
      local_id: planned?.localId
    });

    // The next receive finds the pair and changes nothing.
    const again = await captureReceive(cloud, link);
    expect(again.documents).toMatchObject([{ localId: planned?.localId, status: "same" }]);
  });

  it("refuses a capture whose file hash or path would leave the staging or project folder (review F17)", async () => {
    const bad = cloud.putWorkflow("Edit", { bytes: randomBytes(16), name: "still.png", path: "media/still.png" });
    bad.files[0]!.hash = "../../escape";
    await expect(captureReceive(cloud, link)).rejects.toThrow();
    bad.files[0]!.hash = sha(randomBytes(4));
    bad.files[0]!.path = "../outside.png";
    await expect(captureReceive(cloud, link)).rejects.toThrow();
    bad.files[0]!.path = null;
    bad.files[0]!.name = "../outside.png";
    await expect(captureReceive(cloud, link)).rejects.toThrow();
    expect(await getCloudReceive(cloud.sets.keys().next().value ?? "")).toBeNull();
  });

  it("takes a cloud change over an unchanged local copy and keeps the local revision as a version", async () => {
    const document = cloud.putWorkflow("Edit", null);
    await runReceive(cloud, (await captureReceive(cloud, link)).setId);
    document.payload = workflowPayload("Edit", null, "two");

    const review = await captureReceive(cloud, link);
    expect(review.documents).toMatchObject([{ status: "cloud_changed", decision: "receive" }]);
    await runReceive(cloud, review.setId);

    expect(identityHash(await transferPayloadOf("workflow", document.id))).toBe(identityHash(document.payload));
    const versions = await WorkflowVersion.listForWorkflow(document.id);
    expect(versions.some((version) => JSON.stringify(version.graph).includes('"one"'))).toBe(true);
  });

  it("applies nothing when a document changed locally after the review, and asks again (Y3, review F31)", async () => {
    const changed = cloud.putWorkflow("Edit", null);
    const other = cloud.putWorkflow("Other", null);
    await runReceive(cloud, (await captureReceive(cloud, link)).setId);
    changed.payload = workflowPayload("Edit", null, "cloud edit");
    other.payload = workflowPayload("Other", null, "cloud edit");

    const review = await captureReceive(cloud, link);
    expect(review.documents.map((document) => document.status)).toEqual(["cloud_changed", "cloud_changed"]);
    const local = await Workflow.get<Workflow>(changed.id);
    local!.graph = { nodes: [{ id: "n0", type: "nodetool.constant.String", data: { value: "local edit" } }], edges: [] };
    await local!.save();

    const refused = await runReceive(cloud, review.setId);
    expect(refused).toMatchObject({
      status: "waiting_for_review",
      setId: review.setId,
      documents: [
        { cloudId: changed.id, status: "both_changed", decision: null },
        { cloudId: other.id, status: "cloud_changed", decision: "receive" }
      ]
    });
    // Nothing changed locally, and the staged documents stay for the next attempt.
    expect(JSON.stringify((await Workflow.get<Workflow>(changed.id))?.graph)).toContain("local edit");
    expect(JSON.stringify((await Workflow.get<Workflow>(other.id))?.graph)).not.toContain("cloud edit");
    expect(existsSync(join(stagingRoot(), review.setId, "documents"))).toBe(true);
    const reads = cloud.documentReads.length;

    // The person keeps the local edit and receives the other document.
    const outcome = await runReceive(cloud, review.setId, [
      { kind: "workflow", document_id: changed.id, decision: "keep_local" }
    ]);
    expect(outcome).toMatchObject({
      status: "finished",
      result: { received: [{ id: other.id }], notReceived: [{ id: changed.id, status: "both_changed" }] }
    });
    expect(cloud.documentReads).toHaveLength(reads);
    expect(JSON.stringify((await Workflow.get<Workflow>(changed.id))?.graph)).toContain("local edit");
    expect(JSON.stringify((await Workflow.get<Workflow>(other.id))?.graph)).toContain("cloud edit");
    // The base of the kept document stays where it was, so the next capture still sees both sides changed.
    expect((await getCloudLinkDocumentByCloudId(link.id, "workflow", changed.id))?.base_content_hash).not.toBe(
      identityHash(changed.payload)
    );
  });

  it("receives a document both sides changed only when the person decides to", async () => {
    const document = cloud.putWorkflow("Edit", null);
    await runReceive(cloud, (await captureReceive(cloud, link)).setId);
    document.payload = workflowPayload("Edit", null, "cloud edit");
    const local = await Workflow.get<Workflow>(document.id);
    local!.graph = { nodes: [{ id: "n0", type: "nodetool.constant.String", data: { value: "local edit" } }], edges: [] };
    await local!.save();

    const undecided = await captureReceive(cloud, link);
    expect(undecided.documents).toMatchObject([{ status: "both_changed", decision: null }]);
    const skipped = await runReceive(cloud, undecided.setId);
    expect(skipped).toMatchObject({ result: { notReceived: [{ id: document.id, status: "both_changed" }] } });
    expect(JSON.stringify((await Workflow.get<Workflow>(document.id))?.graph)).toContain("local edit");

    const decided = await captureReceive(cloud, link);
    await runReceive(cloud, decided.setId, [{ kind: "workflow", document_id: document.id, decision: "receive" }]);
    expect(JSON.stringify((await Workflow.get<Workflow>(document.id))?.graph)).toContain("cloud edit");
  });

  it("puts received bytes beside a file that changed locally, and keeps the local file", async () => {
    const bytes = randomBytes(64);
    const document = cloud.putWorkflow("Edit", { bytes, name: "still.png", path: "media/still.png" });
    await runReceive(cloud, (await captureReceive(cloud, link)).setId);

    // The cloud gets new bytes for the asset, and the local file is edited in another app.
    const newer = randomBytes(64);
    const file = document.files[0]!;
    file.hash = sha(newer);
    file.size = newer.byteLength;
    cloud.blobs.set(file.hash, newer);
    document.payload = workflowPayload("Edit", file.asset_id, "two");
    const edited = randomBytes(32);
    await folder.write("media/still.png", edited);

    const review = await captureReceive(cloud, link);
    const outcome = await runReceive(cloud, review.setId);
    expect(outcome.status).toBe("finished");
    if (outcome.status !== "finished") return;
    expect(outcome.result.keptBeside).toHaveLength(1);
    const kept = outcome.result.keptBeside[0]!;
    expect(kept.path).toBe("media/still.png");
    expect(kept.keptPath).toMatch(/^media\/still \(cloud \d{4}-\d{2}-\d{2}\)\.png$/);
    expect(Buffer.from((await folder.read("media/still.png"))!).equals(edited)).toBe(true);
    expect(Buffer.from((await folder.read(kept.keptPath))!).equals(newer)).toBe(true);
    // The local asset keeps its path and bytes, so documents that use it keep
    // the local media, and the received bytes are a new asset (V22, review F34).
    expect(await Asset.get<Asset>(file.asset_id)).toMatchObject({ workspace_path: "media/still.png", content_hash: sha(edited) });
    expect(kept.assetId).not.toBe(file.asset_id);
    expect(await Asset.get<Asset>(kept.assetId)).toMatchObject({
      project_id: PROJECT,
      workspace_path: kept.keptPath,
      content_hash: file.hash
    });
  });

  it("receives a media file the cloud changed in place while its workflow stayed the same (review F33)", async () => {
    const bytes = randomBytes(64);
    const document = cloud.putWorkflow("Edit", { bytes, name: "still.png", path: "media/still.png" });
    await runReceive(cloud, (await captureReceive(cloud, link)).setId);

    // New bytes under the same asset id. The graph does not change.
    const newer = randomBytes(64);
    const file = document.files[0]!;
    file.hash = sha(newer);
    file.size = newer.byteLength;
    cloud.blobs.set(file.hash, newer);

    const review = await captureReceive(cloud, link);
    expect(review.documents).toMatchObject([{ status: "same", decision: "receive", changedFiles: 1 }]);
    const outcome = await runReceive(cloud, review.setId);
    expect(outcome).toMatchObject({ status: "finished", result: { received: [], keptBeside: [] } });
    expect(Buffer.from((await folder.read("media/still.png"))!).equals(newer)).toBe(true);
    expect(await Asset.get<Asset>(file.asset_id)).toMatchObject({ workspace_path: "media/still.png", content_hash: file.hash });
    expect(await getCloudLinkFile(link.id, file.asset_id)).toMatchObject({ base_hash: file.hash });
  });

  it("keeps a local file another app saves while the received bytes replace it (review F18)", async () => {
    const bytes = randomBytes(64);
    const document = cloud.putWorkflow("Edit", { bytes, name: "still.png", path: "media/still.png" });
    await runReceive(cloud, (await captureReceive(cloud, link)).setId);

    // The cloud gets new bytes for the asset. The local file is unchanged when the receive looks at it.
    const newer = randomBytes(64);
    const file = document.files[0]!;
    file.hash = sha(newer);
    file.size = newer.byteLength;
    cloud.blobs.set(file.hash, newer);
    document.payload = workflowPayload("Edit", file.asset_id, "two");

    // Another app saves the file after the receive checked it and before it replaces it.
    const edited = randomBytes(32);
    const gate = new PauseGate([REPLACING]).install();
    try {
      const review = await captureReceive(cloud, link);
      const running = runReceive(cloud, review.setId);
      await gate.waitFor(REPLACING);
      await folder.write("media/still.png", edited);
      gate.release(REPLACING);
      const outcome = await running;
      if (outcome.status !== "finished") throw new Error("expected a finished receive");
      expect(Buffer.from((await folder.read("media/still.png"))!).equals(edited)).toBe(true);
      const kept = outcome.result.keptBeside[0];
      expect(kept?.path).toBe("media/still.png");
      expect(Buffer.from((await folder.read(kept!.keptPath))!).equals(newer)).toBe(true);
    } finally {
      gate.uninstall();
    }
  });

  it("lists a file the cloud no longer held at capture as missing and still receives the document", async () => {
    const document = cloud.putWorkflow("Edit", { bytes: randomBytes(16), name: "gone.png", path: "gone.png" });
    cloud.blobs.clear();
    cloud.erased.add(document.files[0]!.hash);
    const outcome = await runReceive(cloud, (await captureReceive(cloud, link)).setId);
    expect(outcome).toMatchObject({
      status: "finished",
      result: { received: [{ id: document.id }], missingFiles: [document.files[0]!.asset_id] }
    });
    expect(await Asset.get<Asset>(document.files[0]!.asset_id)).toBeNull();
  });

  it("captures a new set when an owner erases a file during staging, and downloads no staged file again (Y7, AC74, review F32)", async () => {
    const kept = cloud.putWorkflow("Kept", { bytes: randomBytes(16), name: "kept.png", path: "kept.png" });
    const erased = cloud.putWorkflow("Erased", { bytes: randomBytes(16), name: "erased.png", path: "erased.png" });
    const review = await captureReceive(cloud, link);
    // The owner erases the second file after the capture.
    cloud.blobs.delete(erased.files[0]!.hash);
    cloud.erased.add(erased.files[0]!.hash);

    const outcome = await runReceive(cloud, review.setId);
    expect(outcome.status).toBe("finished");
    if (outcome.status !== "finished") return;
    expect(outcome.setId).not.toBe(review.setId);
    expect(outcome.result.received.map((entry) => entry.id).sort()).toEqual([kept.id, erased.id].sort());
    expect(outcome.result.missingFiles).toEqual([erased.files[0]!.asset_id]);
    expect(cloud.downloads).toEqual([kept.files[0]!.hash]);
    expect(cloud.released).toContain(review.setId);
    expect(await getCloudReceive(review.setId)).toBeNull();
    expect(existsSync(join(stagingRoot(), review.setId))).toBe(false);
  });

  it("captures a new set when the set expired during staging, and downloads no staged file again (Y7, review F32)", async () => {
    const first = cloud.putWorkflow("First", { bytes: randomBytes(16), name: "first.png", path: "first.png" });
    const second = cloud.putWorkflow("Second", { bytes: randomBytes(16), name: "second.png", path: "second.png" });
    const review = await captureReceive(cloud, link);
    cloud.expireAfterDownloads = 1;

    const outcome = await runReceive(cloud, review.setId);
    expect(outcome).toMatchObject({ status: "finished", result: { missingFiles: [] } });
    expect(outcome.setId).not.toBe(review.setId);
    expect([...cloud.downloads].sort()).toEqual([first.files[0]!.hash, second.files[0]!.hash].sort());
    expect(Buffer.from((await folder.read("first.png"))!).length).toBe(16);
    expect(Buffer.from((await folder.read("second.png"))!).length).toBe(16);
    expect(await getCloudReceive(review.setId)).toBeNull();
  });

  it("gives up and writes nothing when every new set expires too", async () => {
    const document = cloud.putWorkflow("Edit", null);
    const review = await captureReceive(cloud, link);
    cloud.expired = true;
    expect((await runReceive(cloud, review.setId)).status).toBe("expired");
    expect(await Workflow.get<Workflow>(document.id)).toBeNull();
    expect(await listCloudReceives(USER)).toEqual([]);
    expect(existsSync(join(stagingRoot(), review.setId))).toBe(false);
  });

  describe("resume after a crash", () => {
    it("resumes downloads after a crash during staging, and fetches no document twice", async () => {
      const document = cloud.putWorkflow("Edit", { bytes: randomBytes(64), name: "still.png", path: "still.png" });
      const review = await captureReceive(cloud, link);
      cloud.failNextDownload = true;
      await expect(runReceive(cloud, review.setId)).rejects.toThrow("The connection dropped");
      expect((await getCloudReceive(review.setId))?.state).toBe("staging");
      expect(await Workflow.get<Workflow>(document.id)).toBeNull();

      const outcomes = await resumeReceives(() => cloud, USER);
      expect(outcomes).toMatchObject([{ status: "finished", setId: review.setId }]);
      expect(cloud.documentReads).toEqual([document.id]);
      expect(await Workflow.get<Workflow>(document.id)).not.toBeNull();
      expect(await folder.exists("still.png")).toBe(true);
    });

    it("repeats the check and commits after a crash once installed", async () => {
      const document = cloud.putWorkflow("Edit", { bytes: randomBytes(64), name: "still.png", path: "still.png" });
      const review = await captureReceive(cloud, link);
      await expect(
        runReceive(cloud, review.setId, undefined, {
          afterStep: (step) => {
            if (step === "installed") throw new Error("killed");
          }
        })
      ).rejects.toThrow("killed");
      expect((await getCloudReceive(review.setId))?.state).toBe("installed");
      expect(await Workflow.get<Workflow>(document.id)).toBeNull();

      await resumeReceives(() => cloud, USER);
      expect(await Workflow.get<Workflow>(document.id)).not.toBeNull();
      expect(await folder.exists("still.png")).toBe(true);
      expect(await getCloudReceive(review.setId)).toBeNull();
    });

    it("finishes the placements after a crash once applied, with the path in flux until then", async () => {
      const bytes = randomBytes(64);
      const document = cloud.putWorkflow("Edit", { bytes, name: "still.png", path: "still.png" });
      const assetId = document.files[0]!.asset_id;
      const review = await captureReceive(cloud, link);
      await expect(
        runReceive(cloud, review.setId, undefined, {
          afterStep: (step) => {
            if (step === "applied") throw new Error("killed");
          }
        })
      ).rejects.toThrow("killed");
      expect((await getCloudReceive(review.setId))?.state).toBe("applied");
      // The rows are written and the file is not: the placement keeps the path in flux.
      expect(await Workflow.get<Workflow>(document.id)).not.toBeNull();
      expect(await Asset.get<Asset>(assetId)).not.toBeNull();
      expect(await folder.exists("still.png")).toBe(false);
      expect((await listTransferPlacements(PROJECT)).map((placement) => placement.path)).toEqual(["still.png"]);

      await resumeReceives(() => cloud, USER);
      expect(Buffer.from((await folder.read("still.png"))!).equals(bytes)).toBe(true);
      expect(await listTransferPlacements(PROJECT)).toEqual([]);
      expect(await getCloudReceive(review.setId)).toBeNull();
    });

    it("leaves a receive the person has not reviewed waiting", async () => {
      const document = cloud.putWorkflow("Edit", null);
      const review = await captureReceive(cloud, link);
      expect(await resumeReceives(() => cloud, USER)).toEqual([{ status: "waiting_for_review", setId: review.setId }]);
      expect(await Workflow.get<Workflow>(document.id)).toBeNull();
    });
  });

  it("keeps a local file edit it has not seen as a version before writing the received document", async () => {
    const document = cloud.putWorkflow("Edit", null);
    await runReceive(cloud, (await captureReceive(cloud, link)).setId);
    const path = (await Workflow.get<Workflow>(document.id))!.file_path!;
    document.payload = workflowPayload("Edit", null, "cloud edit");

    const review = await captureReceive(cloud, link);
    // The file is edited in another app after the comparison would have run.
    const text = JSON.parse((await folder.readText(path))!) as Record<string, unknown>;
    const outcome = await runReceive(cloud, review.setId, undefined, {
      afterStep: async (step) => {
        if (step !== "applied") return;
        const graph = text["graph"] as { nodes: Array<{ data: { value: string } }> };
        graph.nodes[0]!.data.value = "file edit";
        await writeFile(join(root, PROJECT, path), JSON.stringify(text));
      }
    });
    expect(await readFile(join(root, PROJECT, path), "utf8")).toContain("cloud edit");
    expect(outcome).toMatchObject({
      result: { received: [{ id: document.id }], changedDuringReceive: [{ id: document.id }] }
    });
    const versions = await WorkflowVersion.listForWorkflow(document.id);
    expect(versions.some((version) => JSON.stringify(version.graph).includes("file edit"))).toBe(true);
  });

  it("releases the set and clears the local receive when the person closes the review (review F41)", async () => {
    const document = cloud.putWorkflow("Edit", { bytes: randomBytes(16), name: "still.png", path: "media/still.png" });
    const review = await captureReceive(cloud, link);
    expect(await cancelReceive(cloud, review.setId)).toBe("cancelled");
    expect(cloud.released).toEqual([review.setId]);
    expect(await getCloudReceive(review.setId)).toBeNull();
    expect(existsSync(join(stagingRoot(), review.setId))).toBe(false);
    expect(await Workflow.get<Workflow>(document.id)).toBeNull();
    expect(await cancelReceive(cloud, review.setId)).toBe("cancelled");
  });

  it("applies nothing once a cancel claimed the receive, and keeps a receive that applied (review F45)", async () => {
    const document = cloud.putWorkflow("Edit", { bytes: randomBytes(16), name: "still.png", path: "media/still.png" });
    const review = await captureReceive(cloud, link);
    let resume: () => void = () => {};
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let reached: () => void = () => {};
    const atInstalled = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const run = runReceive(cloud, review.setId, undefined, {
      afterStep: async (step) => {
        if (step !== "installed") return;
        reached();
        await paused;
      }
    });
    await atInstalled;
    // The cancel wins: the run that continues must not write the document
    // without the staged files the cancel removed.
    expect(await cancelReceive(cloud, review.setId)).toBe("cancelled");
    resume();
    await expect(run).rejects.toThrow(/cancelled/);
    expect(await Workflow.get<Workflow>(document.id)).toBeNull();
    expect(await folder.read("media/still.png")).toBeNull();

    // A receive that applied keeps its staged files for the placing.
    const second = await captureReceive(cloud, link);
    let cancelled: Promise<"cancelled" | "applied"> | null = null;
    const done = await runReceive(cloud, second.setId, undefined, {
      afterStep: (step) => {
        if (step === "applied") cancelled = cancelReceive(cloud, second.setId);
      }
    });
    expect(done.status).toBe("finished");
    expect(await cancelled).toBe("applied");
    expect(Buffer.from((await folder.read("media/still.png"))!).length).toBe(16);
  });
});

