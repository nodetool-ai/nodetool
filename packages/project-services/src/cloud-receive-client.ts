/**
 * The local half of a receive from a cloud project
 * (docs/plans/native-cloud-sync/technical-design.md, "Receiving: revision
 * set, stage, check, apply", WP2.7). It runs in the server bundled with a
 * native app, against the cloud's `receive` endpoints through a
 * {@link ReceiveTransport}.
 *
 * A receive moves through the states of its `cloud_receives` row, and a
 * restart resumes from the state alone:
 *
 * | State | What happened | What a resume does |
 * | --- | --- | --- |
 * | `staging` | The set is captured and the review is recorded | Downloads what is missing into `.nodetool/cloud-staging/<set id>/` |
 * | `installed` | Every staged file is flushed and has its hash | Compares the folder, checks again, commits |
 * | `applied` | One local transaction wrote the documents, the asset rows, the bases and the placements | Places the files, writes the document files, finishes |
 *
 * The project folder lock is held from the comparison to the last
 * placement, so no other writer of this process changes the folder in
 * between. An asset whose file is not placed yet has a `transfer_placements`
 * row, which makes its path a path in flux for the comparison, as on the
 * server.
 */
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@nodetool-ai/config";
import {
  addTransferPlacements,
  Asset,
  deleteCloudReceive,
  deleteTransferPlacement,
  getCloudLinkById,
  getCloudLinkDocumentByCloudId,
  getCloudLinkFile,
  getCloudReceive,
  listCloudReceives,
  listTransferPlacements,
  setCloudLinkDocumentBase,
  setCloudLinkFileBase,
  TimelineSequence,
  updateCloudReceive,
  withTransaction,
  Workflow,
  createCloudReceive,
  type CloudLinkRow,
  type CloudReceiveRow
} from "@nodetool-ai/models";
import type { Workspace } from "@nodetool-ai/runtime";
import { withProjectFolderLock } from "@nodetool-ai/asset-services/project-asset";
import {
  contentHashOfFile,
  partialContentHashOfFile,
  requireProjectFolder,
  withWorkspaceFingerprint
} from "@nodetool-ai/asset-services/project-asset-file";
import type {
  CaptureRevisionSetOutput,
  ReceiveDocumentOutput,
  RevisionSetDocument
} from "@nodetool-ai/protocol/api-schemas/receive.js";
import type { TransferDocumentKind } from "@nodetool-ai/protocol/api-schemas/transfer.js";
import { withoutDocumentFileWrites, writeDocumentFileUnderLock } from "./document-file-sync.js";
import { reconcileInBackground } from "./project-index.js";
import { timelineFileAdapter } from "./timeline-file.js";
import {
  identityHash,
  TRANSFER_DOCUMENT_KINDS,
  transferPayloadOf,
  type TransferPayloadContent
} from "./transfer-documents.js";
import { workflowFileAdapter } from "./workflow-file.js";

const log = createLogger("nodetool.project-services.cloud-receive-client");

/** The cloud's `receive` endpoints, as the client calls them. */
export interface ReceiveTransport {
  capture(input: { project_id: string }): Promise<CaptureRevisionSetOutput>;
  document(input: { set_id: string; kind: TransferDocumentKind; document_id: string }): Promise<ReceiveDocumentOutput>;
  /**
   * Writes the bytes of a file of the set to `destination`. Returns
   * `ERASED` when an owner's action freed them.
   */
  downloadFile(input: { set_id: string; hash: string }, destination: string): Promise<"ok" | "ERASED">;
  release(input: { set_id: string }): Promise<void>;
}

/** The cloud answered that the set expired, was released or no longer holds a revision. */
export class ReceiveSetExpiredError extends Error {
  constructor(message = "The revision set expired. Start the download again.") {
    super(message);
    this.name = "ReceiveSetExpiredError";
  }
}

/** How a cloud document stands against its local copy when the set was captured. */
export type ReceiveDocumentStatus =
  /** No local copy and no base: the document is new on the cloud. */
  | "new"
  /** The local copy already has the cloud content. */
  | "same"
  /** Only the cloud changed since the base. */
  | "cloud_changed"
  /** Only the local copy changed since the base. Nothing to receive. */
  | "local_changed"
  /** Both changed, or a local document with the id was never exchanged. */
  | "both_changed"
  /** The local copy was deleted since the base. */
  | "local_deleted";

export type ReceiveDecision = "receive" | "keep_local";

/** One document of a receive, as the review sheet shows it. */
export interface PlannedDocument {
  kind: TransferDocumentKind;
  cloudId: string;
  localId: string;
  name: string;
  revisionId: string;
  contentHash: string;
  /** The base content hash of the link at capture, or null when none was exchanged. */
  baseHash: string | null;
  /** The identity hash of the local copy the sheet showed, or null for none. */
  localHash: string | null;
  status: ReceiveDocumentStatus;
  /** Null until the person decides a document that needs it. Null is never received. */
  decision: ReceiveDecision | null;
  files: RevisionSetDocument["files"];
  missingFiles: string[];
}

/** A file the commit chose to place, with the hash its target may be replaced over. */
interface PlannedPlacement {
  assetId: string;
  path: string;
  hash: string;
  /** The hash of the last exchange, which a target may still hold to be replaced. Null when none was exchanged. */
  replaceIfHash: string | null;
}

/** What a receive did, for the result sheet. */
export interface ReceiveResult {
  /** Documents written from the cloud, by local id. */
  received: Array<{ kind: TransferDocumentKind; id: string; name: string }>;
  /**
   * Documents changed locally after the review. A changed row is left as it
   * was. A file edited during the receive is kept as a version before the
   * received document is written (TC104).
   */
  changedDuringReceive: Array<{ kind: TransferDocumentKind; id: string; name: string }>;
  /** Documents left out because the person kept the local copy or did not decide them. */
  notReceived: Array<{ kind: TransferDocumentKind; id: string; name: string; status: ReceiveDocumentStatus }>;
  /** Files whose target held other content: the received bytes went beside it. */
  keptBeside: Array<{ assetId: string; path: string; keptPath: string }>;
  /** Asset ids the cloud holds no bytes for. */
  missingFiles: string[];
  /** Documents whose file held an edit that is not valid, so the file was left as it was. */
  fileKept: Array<{ kind: TransferDocumentKind; id: string }>;
}

interface ReceivePlan {
  version: 1;
  set: CaptureRevisionSetOutput;
  documents: PlannedDocument[];
  /** True once the person's decisions are recorded and the receive may download. */
  decided: boolean;
  /** Hashes whose bytes the cloud no longer holds. */
  erased: string[];
  placements: PlannedPlacement[];
  result: ReceiveResult;
}

/** What {@link runReceive} ended with. */
export type ReceiveOutcome =
  | { status: "finished"; setId: string; result: ReceiveResult }
  | { status: "expired"; setId: string }
  | { status: "waiting_for_review"; setId: string };

function emptyResult(): ReceiveResult {
  return { received: [], changedDuringReceive: [], notReceived: [], keptBeside: [], missingFiles: [], fileKept: [] };
}

function statusOf(contentHash: string, baseHash: string | null, localHash: string | null): ReceiveDocumentStatus {
  if (localHash === contentHash) return "same";
  if (localHash === null) return baseHash === null ? "new" : "local_deleted";
  if (baseHash === null) return "both_changed";
  if (baseHash === contentHash) return "local_changed";
  if (localHash === baseHash) return "cloud_changed";
  return "both_changed";
}

/** The decision a status takes without the person, or null when it needs one. */
function defaultDecision(status: ReceiveDocumentStatus): ReceiveDecision | null {
  switch (status) {
    case "new":
    case "same":
    case "cloud_changed":
      return "receive";
    case "local_changed":
      return "keep_local";
    case "both_changed":
    case "local_deleted":
      return null;
  }
}

async function localHashOf(kind: TransferDocumentKind, localId: string, projectId: string): Promise<string | null> {
  const payload = await transferPayloadOf(kind, localId);
  if (!payload) return null;
  const owner = kind === "workflow" ? await Workflow.get<Workflow>(localId) : await TimelineSequence.findById(localId);
  // A document with the id in another project is not this project's copy.
  if (!owner || owner.project_id !== projectId) return null;
  return identityHash(payload);
}

function parsePlan(row: CloudReceiveRow): ReceivePlan {
  return JSON.parse(row.plan) as ReceivePlan;
}

/** The staging folder of a receive, inside the reserved `.nodetool/` directory (RF23). */
function stagingDir(workspace: Workspace, setId: string): string {
  if (!workspace.localDir) {
    throw new Error("A receive needs a project folder on this computer");
  }
  return join(workspace.localDir, ".nodetool", "cloud-staging", setId);
}

/** The path on this computer of a file in a local project folder. */
function localPath(workspace: Workspace, path: string): string {
  return join(workspace.localDir ?? "", workspace.key(path));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    // Nothing is there.
    return false;
  }
}

async function flush(path: string): Promise<void> {
  const handle = await open(path, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Captures a revision set of the linked cloud project and records the
 * receive in state `staging`, with each document's status for the review
 * sheet. Nothing is downloaded until {@link runReceive}.
 */
export async function captureReceive(
  transport: ReceiveTransport,
  link: CloudLinkRow
): Promise<{ setId: string; documents: PlannedDocument[] }> {
  const set = await transport.capture({ project_id: link.cloud_project_id });
  const documents: PlannedDocument[] = [];
  for (const document of set.documents) {
    const linked = await getCloudLinkDocumentByCloudId(link.id, document.kind, document.document_id);
    const localId = linked?.local_id ?? document.document_id;
    const baseHash = linked?.base_content_hash ?? null;
    const localHash = await localHashOf(document.kind, localId, link.project_id);
    const status = statusOf(document.content_hash, baseHash, localHash);
    documents.push({
      kind: document.kind,
      cloudId: document.document_id,
      localId,
      name: document.name,
      revisionId: document.revision_id,
      contentHash: document.content_hash,
      baseHash,
      localHash,
      status,
      decision: defaultDecision(status),
      files: document.files,
      missingFiles: document.missing_files
    });
  }
  const plan: ReceivePlan = {
    version: 1,
    set,
    documents,
    decided: false,
    erased: [],
    placements: [],
    result: emptyResult()
  };
  try {
    await createCloudReceive(link, { setId: set.set_id, plan });
  } catch (error) {
    await transport.release({ set_id: set.set_id }).catch(() => undefined);
    throw error;
  }
  return { setId: set.set_id, documents };
}

/** The documents a receive writes: received ones whose local copy does not already match. */
function toWrite(plan: ReceivePlan): PlannedDocument[] {
  return plan.documents.filter((document) => document.decision === "receive" && document.status !== "same");
}

/** The files the documents a receive writes need, by hash. */
function neededFiles(plan: ReceivePlan): Map<string, RevisionSetDocument["files"]> {
  const files = new Map<string, RevisionSetDocument["files"]>();
  for (const document of toWrite(plan)) {
    for (const file of document.files) {
      const list = files.get(file.hash) ?? [];
      if (!list.some((entry) => entry.asset_id === file.asset_id)) list.push(file);
      files.set(file.hash, list);
    }
  }
  return files;
}

/** Whether a local asset already holds the bytes of `file`, so nothing needs downloading. */
async function heldLocally(file: RevisionSetDocument["files"][number]): Promise<boolean> {
  const asset = await Asset.get<Asset>(file.asset_id);
  return asset?.content_hash === file.hash;
}

/** Downloads each document and file of the set that is not staged yet, then marks the receive installed. */
async function stage(transport: ReceiveTransport, row: CloudReceiveRow, plan: ReceivePlan, dir: string): Promise<void> {
  await mkdir(join(dir, "documents"), { recursive: true });
  for (const document of toWrite(plan)) {
    const path = join(dir, "documents", `${document.kind}-${document.cloudId}.json`);
    if (await fileExists(path)) continue;
    const received = await transport.document({
      set_id: row.id,
      kind: document.kind,
      document_id: document.cloudId
    });
    if (identityHash(received.document) !== document.contentHash) {
      throw new Error(`The cloud sent ${document.kind} ${document.cloudId} with another hash than it captured`);
    }
    const part = `${path}.part`;
    await writeFile(part, JSON.stringify(received.document));
    await flush(part);
    await rename(part, path);
  }
  const erased = new Set(plan.erased);
  for (const [hash, files] of neededFiles(plan)) {
    if (erased.has(hash)) continue;
    const path = join(dir, hash);
    if (await fileExists(path)) {
      // A crash can leave a staged file only after its rename, which follows its check.
      continue;
    }
    let held = true;
    for (const file of files) held &&= await heldLocally(file);
    if (held) continue;
    const part = `${path}.part`;
    const answer = await transport.downloadFile({ set_id: row.id, hash }, part);
    if (answer === "ERASED") {
      erased.add(hash);
      plan.erased = [...erased];
      await updateCloudReceive(row.id, { plan });
      continue;
    }
    await flush(part);
    if ((await contentHashOfFile(part)) !== hash) {
      await rm(part, { force: true });
      throw new Error(`A download of ${hash} has other bytes`);
    }
    await rename(part, path);
  }
  await updateCloudReceive(row.id, { state: "installed", plan });
}

/** Writes one document from its staged payload. Runs inside the commit transaction. */
async function writeDocument(link: CloudLinkRow, document: PlannedDocument, payload: TransferPayloadContent): Promise<void> {
  const handler = TRANSFER_DOCUMENT_KINDS[document.kind];
  const current = await handler.lock(document.localId);
  if (current) {
    await handler.replace(current, payload);
  } else {
    await handler.create({ id: document.localId, userId: link.user_id, projectId: link.project_id, payload });
  }
}

/** A free path for a new file: the cloud's path, or its name at the root. */
function targetPath(file: RevisionSetDocument["files"][number]): string {
  return file.path ?? file.name;
}

/**
 * Under the folder lock: compares the folder (CF1), then in one local
 * transaction checks every document against the hash the sheet showed and
 * writes the documents, asset rows, bases and placements, and sets state
 * `applied`.
 */
async function commit(row: CloudReceiveRow, link: CloudLinkRow, plan: ReceivePlan, dir: string): Promise<void> {
  await reconcileInBackground(link.project_id, link.user_id);
  const payloads = new Map<PlannedDocument, TransferPayloadContent>();
  for (const document of toWrite(plan)) {
    const text = await readFile(join(dir, "documents", `${document.kind}-${document.cloudId}.json`), "utf8");
    payloads.set(document, JSON.parse(text) as TransferPayloadContent);
  }
  const erased = new Set(plan.erased);
  // A transaction on SQLite may await nothing but the database, so the
  // staged files are looked at before it.
  const staged = new Set<string>();
  for (const hash of neededFiles(plan).keys()) {
    if (await fileExists(join(dir, hash))) staged.add(hash);
  }
  await withoutDocumentFileWrites(() =>
    withTransaction(async () => {
      const result = emptyResult();
      const placements: PlannedPlacement[] = [];
      const written: PlannedDocument[] = [];
      for (const document of plan.documents) {
        const entry = { kind: document.kind, id: document.localId, name: document.name };
        if (document.decision !== "receive") {
          result.notReceived.push({ ...entry, status: document.status });
          continue;
        }
        const localHash = await localHashOf(document.kind, document.localId, link.project_id);
        if (localHash !== document.localHash) {
          result.changedDuringReceive.push(entry);
          continue;
        }
        const payload = payloads.get(document);
        if (payload) {
          await writeDocument(link, document, payload);
          result.received.push(entry);
          written.push(document);
        }
        await setCloudLinkDocumentBase(link, {
          kind: document.kind,
          localId: document.localId,
          cloudId: document.cloudId,
          contentHash: document.contentHash,
          cloudRevision: document.revisionId
        });
      }
      const seen = new Set<string>();
      for (const document of written) {
        result.missingFiles.push(...document.missingFiles);
        for (const file of document.files) {
          if (seen.has(file.asset_id)) continue;
          seen.add(file.asset_id);
          if (erased.has(file.hash)) {
            result.missingFiles.push(file.asset_id);
            continue;
          }
          const asset = await Asset.get<Asset>(file.asset_id);
          if (asset && asset.content_hash === file.hash && asset.project_id === link.project_id) {
            await setCloudLinkFileBase(link, { assetId: asset.id, cloudAssetId: file.asset_id, hash: file.hash });
            continue;
          }
          // The bytes were held locally at staging and changed since, or the
          // id belongs to an asset of another project.
          if (!staged.has(file.hash) || (asset && asset.project_id !== link.project_id)) {
            result.missingFiles.push(file.asset_id);
            continue;
          }
          let path: string;
          if (asset) {
            path = asset.workspace_path ?? targetPath(file);
            // The file may be replaced only while it still has the bytes of the
            // last exchange. The row's own hash follows local edits.
            const base = await getCloudLinkFile(link.id, asset.id);
            placements.push({ assetId: asset.id, path, hash: file.hash, replaceIfHash: base?.base_hash ?? null });
            await asset.update({ workspace_path: path, content_hash: file.hash, size: file.size });
          } else {
            path = targetPath(file);
            placements.push({ assetId: file.asset_id, path, hash: file.hash, replaceIfHash: null });
            await Asset.create<Asset>({
              id: file.asset_id,
              user_id: link.user_id,
              project_id: link.project_id,
              // The user's home folder, where an asset with no folder of its own lists.
              parent_id: link.user_id,
              name: file.name,
              content_type: file.content_type,
              workspace_path: path,
              size: file.size,
              content_hash: file.hash
            });
          }
          await setCloudLinkFileBase(link, { assetId: file.asset_id, cloudAssetId: file.asset_id, hash: file.hash });
        }
      }
      await addTransferPlacements(
        placements.map((placement) => ({
          projectId: link.project_id,
          userId: link.user_id,
          transferId: row.id,
          path: placement.path,
          hash: placement.hash,
          assetId: placement.assetId
        }))
      );
      plan.placements = placements;
      plan.result = result;
      await updateCloudReceive(row.id, { state: "applied", plan });
    })
  );
}

/** A free path beside `path` for received bytes whose target holds other content. */
async function keptPath(workspace: Workspace, path: string, now: Date): Promise<string> {
  const slash = path.lastIndexOf("/");
  const directory = path.slice(0, slash + 1);
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  const label = `cloud ${now.toISOString().slice(0, 10)}`;
  for (let n = 1; ; n += 1) {
    const candidate = `${directory}${stem} (${label}${n > 1 ? ` ${n}` : ""})${extension}`;
    if (!(await workspace.exists(candidate))) return candidate;
  }
}

/**
 * Still under the lock: copies each staged file to its path when the path is
 * free or still holds the recorded bytes, and beside it otherwise. Then the
 * file of each written document goes through the document file sync, which
 * keeps an edit it has not seen as a version first.
 */
async function place(row: CloudReceiveRow, link: CloudLinkRow, plan: ReceivePlan, workspace: Workspace, dir: string): Promise<void> {
  const pending = (await listTransferPlacements(link.project_id)).filter((placement) => placement.transfer_id === row.id);
  const byAsset = new Map(plan.placements.map((placement) => [placement.assetId, placement]));
  const now = new Date();
  for (const placement of pending) {
    const planned = placement.asset_id ? byAsset.get(placement.asset_id) : undefined;
    if (!planned || placement.hash === null) {
      await deleteTransferPlacement(placement.id);
      continue;
    }
    const staged = join(dir, placement.hash);
    let target = placement.path;
    const existing = (await workspace.exists(target)) ? await contentHashOfFile(localPath(workspace, target)) : null;
    let placed = false;
    if (existing === placement.hash) {
      placed = true;
    } else if (existing === null) {
      placed = await workspace.absorbNew(staged, target);
    } else if (existing === planned.replaceIfHash) {
      await workspace.absorb(staged, target);
      placed = true;
    }
    if (!placed) {
      target = await keptPath(workspace, placement.path, now);
      if (!(await workspace.absorbNew(staged, target))) {
        throw new Error(`Could not place a received file beside ${placement.path}`);
      }
      plan.result.keptBeside.push({ assetId: planned.assetId, path: placement.path, keptPath: target });
      await updateCloudReceive(row.id, { plan });
    }
    const asset = await Asset.get<Asset>(planned.assetId);
    const fileStat = await workspace.stat(target);
    if (asset && fileStat) {
      await asset.update({
        workspace_path: target,
        metadata: withWorkspaceFingerprint(asset.metadata, {
          workspace_size: fileStat.size,
          workspace_mtime: fileStat.modifiedAt,
          workspace_hash: await partialContentHashOfFile(localPath(workspace, target))
        })
      });
    }
    await deleteTransferPlacement(placement.id);
  }
  for (const entry of plan.result.received) {
    const written =
      entry.kind === "workflow"
        ? await writeWorkflowFile(workspace, link.project_id, entry.id)
        : await writeTimelineFile(workspace, link.project_id, entry.id);
    if (written?.outcome === "kept") plan.result.fileKept.push({ kind: entry.kind, id: entry.id });
    // The file was edited in another app during the receive. The edit is a version now (TC104).
    if (written?.editReplaced) plan.result.changedDuringReceive.push(entry);
  }
}

type FileWrite = Awaited<ReturnType<typeof writeDocumentFileUnderLock>>;

async function writeWorkflowFile(workspace: Workspace, projectId: string, id: string): Promise<FileWrite | null> {
  const workflow = await Workflow.get<Workflow>(id);
  return workflow ? writeDocumentFileUnderLock(workflowFileAdapter, workspace, projectId, workflow) : null;
}

async function writeTimelineFile(workspace: Workspace, projectId: string, id: string): Promise<FileWrite | null> {
  const timeline = await TimelineSequence.findById(id);
  return timeline ? writeDocumentFileUnderLock(timelineFileAdapter, workspace, projectId, timeline) : null;
}

/** Releases the set, deletes the staging folder and the receive's row. */
async function finish(transport: ReceiveTransport, row: CloudReceiveRow, dir: string): Promise<void> {
  try {
    await transport.release({ set_id: row.id });
  } catch (error) {
    // The set expires on its own after seven days.
    log.warn("Could not release a revision set", {
      setId: row.id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  await rm(dir, { recursive: true, force: true });
  await deleteCloudReceive(row.id);
}

/** Ends a receive whose set the cloud no longer serves. Nothing local was written. */
async function abandon(row: CloudReceiveRow, dir: string): Promise<ReceiveOutcome> {
  await rm(dir, { recursive: true, force: true });
  await deleteCloudReceive(row.id);
  return { status: "expired", setId: row.id };
}

/** Options of {@link runReceive}. */
export interface ReceiveRunOptions {
  /**
   * Called once each step is recorded: `installed` after staging, `applied`
   * after the commit, `placed` before the finish. A kill test throws here to
   * stop the receive where a crash would.
   */
  afterStep?: (step: "installed" | "applied" | "placed") => void | Promise<void>;
}

/**
 * Runs a captured receive to its end, or from the state a crash left it in.
 * `decisions` records the person's choices from the review sheet on the
 * first run. A document that needs a decision and has none is not received.
 */
export async function runReceive(
  transport: ReceiveTransport,
  setId: string,
  decisions?: ReadonlyArray<{ kind: TransferDocumentKind; document_id: string; decision: ReceiveDecision }>,
  options: ReceiveRunOptions = {}
): Promise<ReceiveOutcome> {
  const after = options.afterStep ?? (() => undefined);
  let row = await getCloudReceive(setId);
  if (!row) throw new Error(`No receive ${setId} is in progress`);
  const link = await getCloudLinkById(row.link_id);
  if (!link) throw new Error(`The link of receive ${setId} is gone`);
  const plan = parsePlan(row);
  if (row.state === "staging" && (decisions || !plan.decided)) {
    for (const decision of decisions ?? []) {
      const document = plan.documents.find(
        (entry) => entry.kind === decision.kind && entry.cloudId === decision.document_id
      );
      if (document) document.decision = decision.decision;
    }
    plan.decided = true;
    await updateCloudReceive(setId, { plan });
    row = (await getCloudReceive(setId)) ?? row;
  }
  const { workspace } = await requireProjectFolder(link.project_id, link.user_id);
  const dir = stagingDir(workspace, setId);
  if (row.state === "staging") {
    try {
      await stage(transport, row, plan, dir);
    } catch (error) {
      if (error instanceof ReceiveSetExpiredError) return abandon(row, dir);
      throw error;
    }
    row = { ...row, state: "installed" };
    await after("installed");
  }
  const current = row;
  // The commit and the placing take the folder lock again for the reconcile
  // and the document files.
  await withProjectFolderLock(
    link.user_id,
    link.project_id,
    async () => {
      if (current.state === "installed") {
        await commit(current, link, plan, dir);
        await after("applied");
      }
      await place(current, link, plan, workspace, dir);
    },
    { allowNested: true }
  );
  await after("placed");
  await finish(transport, current, dir);
  return { status: "finished", setId, result: plan.result };
}

/**
 * Resumes every receive of `userId` a restart interrupted, oldest first. A
 * receive the person has not reviewed yet keeps waiting. `transportFor`
 * gives the transport of a link's server and account, or null when the app
 * is signed out of it, which leaves that receive for later.
 */
export async function resumeReceives(
  transportFor: (link: CloudLinkRow) => ReceiveTransport | null,
  userId: string
): Promise<ReceiveOutcome[]> {
  const outcomes: ReceiveOutcome[] = [];
  for (const row of await listCloudReceives(userId)) {
    const plan = parsePlan(row);
    if (row.state === "staging" && !plan.decided) {
      outcomes.push({ status: "waiting_for_review", setId: row.id });
      continue;
    }
    const link = await getCloudLinkById(row.link_id);
    const transport = link ? transportFor(link) : null;
    if (!transport) continue;
    try {
      outcomes.push(await runReceive(transport, row.id));
    } catch (error) {
      log.warn("Could not resume a receive", {
        setId: row.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return outcomes;
}
