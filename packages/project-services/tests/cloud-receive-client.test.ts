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
import {
  Asset,
  createCloudLink,
  getCloudLinkDocumentByCloudId,
  getCloudLinkFile,
  getCloudReceive,
  initTestDb,
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
  readonly sets = new Map<string, CloudDocument[]>();
  readonly released: string[] = [];
  readonly downloads: string[] = [];
  readonly documentReads: string[] = [];
  expired = false;
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
        files: document.files,
        missing_files: []
      }))
    };
  }

  async document(input: { set_id: string; kind: TransferDocumentKind; document_id: string }) {
    if (this.expired) throw new ReceiveSetExpiredError();
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
    if (this.expired) throw new ReceiveSetExpiredError();
    if (this.failNextDownload) {
      this.failNextDownload = false;
      throw new Error("The connection dropped");
    }
    const bytes = this.blobs.get(input.hash);
    if (!bytes) return "ERASED";
    this.downloads.push(input.hash);
    await writeFile(destination, bytes);
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

  it("leaves a document changed locally after the review as it is, and lists it", async () => {
    const document = cloud.putWorkflow("Edit", null);
    await runReceive(cloud, (await captureReceive(cloud, link)).setId);
    document.payload = workflowPayload("Edit", null, "cloud edit");

    const review = await captureReceive(cloud, link);
    const local = await Workflow.get<Workflow>(document.id);
    local!.graph = { nodes: [{ id: "n0", type: "nodetool.constant.String", data: { value: "local edit" } }], edges: [] };
    await local!.save();

    const outcome = await runReceive(cloud, review.setId);
    expect(outcome).toMatchObject({
      status: "finished",
      result: { received: [], changedDuringReceive: [{ id: document.id }] }
    });
    const after = await Workflow.get<Workflow>(document.id);
    expect(JSON.stringify(after?.graph)).toContain("local edit");
    // The base stays where it was, so the next capture still sees both sides changed.
    expect((await getCloudLinkDocumentByCloudId(link.id, "workflow", document.id))?.base_content_hash).not.toBe(
      identityHash(document.payload)
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
    expect((await Asset.get<Asset>(file.asset_id))?.workspace_path).toBe(kept.keptPath);
  });

  it("lists a file the cloud no longer holds as missing and still receives the document", async () => {
    const document = cloud.putWorkflow("Edit", { bytes: randomBytes(16), name: "gone.png", path: "gone.png" });
    cloud.blobs.clear();
    const outcome = await runReceive(cloud, (await captureReceive(cloud, link)).setId);
    expect(outcome).toMatchObject({
      status: "finished",
      result: { received: [{ id: document.id }], missingFiles: [document.files[0]!.asset_id] }
    });
    expect(await Asset.get<Asset>(document.files[0]!.asset_id)).toBeNull();
  });

  it("drops the receive and writes nothing when the set expired during staging", async () => {
    const document = cloud.putWorkflow("Edit", null);
    const review = await captureReceive(cloud, link);
    cloud.expired = true;
    expect(await runReceive(cloud, review.setId)).toEqual({ status: "expired", setId: review.setId });
    expect(await Workflow.get<Workflow>(document.id)).toBeNull();
    expect(await getCloudReceive(review.setId)).toBeNull();
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
});
