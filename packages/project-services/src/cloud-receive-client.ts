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
import { join, resolve, sep } from "node:path";
import { createLogger } from "@nodetool-ai/config";
import { pausePoint } from "@nodetool-ai/config/pause-points";
import {
  addTransferPlacements,
  Asset,
  createTimeOrderedUuid,
  deleteCloudReceive,
  deletedDocumentExists,
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
import { withProjectFolderLock, type FolderLockHold } from "@nodetool-ai/asset-services/project-asset";
import {
  contentHashOfFile,
  partialContentHashOfFile,
  requireProjectFolder,
  withWorkspaceFingerprint
} from "@nodetool-ai/asset-services/project-asset-file";
import {
  captureRevisionSetOutput,
  type CaptureRevisionSetOutput,
  type ReceiveDocumentOutput,
  type RevisionSetDocument
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
  /**
   * Files of the document whose cloud bytes the folder does not hold, so a
   * receive has work for the document even when its own content is the same
   * (review F33).
   */
  changedFiles: number;
}

/** A file the commit chose to place, with the hash its target may be replaced over. */
interface PlannedPlacement {
  assetId: string;
  path: string;
  hash: string;
  /** The hash of the last exchange, which a target may still hold to be replaced. Null when none was exchanged. */
  replaceIfHash: string | null;
  /**
   * The asset existed locally before the receive. When its file cannot be
   * replaced, it keeps its id, path and bytes, and the received bytes become
   * a new asset beside it (V22).
   */
  existing?: boolean;
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
  /**
   * Local files a crash left moved aside while the received bytes took
   * their path, put back beside it.
   */
  localKept?: Array<{ path: string; keptPath: string }>;
}

interface ReceivePlan {
  version: 1;
  set: CaptureRevisionSetOutput;
  documents: PlannedDocument[];
  /** True once the person's decisions are recorded and the receive may download. */
  decided: boolean;
  placements: PlannedPlacement[];
  result: ReceiveResult;
  /**
   * Where the received bytes of a file went when its path held other
   * content, by cloud asset id and hash, and the id of the asset they became
   * when both sides changed the file. Recorded before the bytes are placed,
   * so a run after a crash reuses the path and the asset (review F48).
   */
  keptPlacements?: Record<string, { path: string; siblingId: string | null }>;
}

/** What {@link runReceive} ended with. */
export type ReceiveOutcome =
  | { status: "finished"; setId: string; result: ReceiveResult }
  | { status: "expired"; setId: string }
  /**
   * The receive waits for the person's decisions. `documents` is the sheet
   * to show again when a local document changed after the review: nothing
   * was applied, the staged files are kept, and the changed documents carry
   * their new status (Y3).
   */
  | { status: "waiting_for_review"; setId: string; documents?: PlannedDocument[] };

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

/**
 * Whether a local document other than this project's copy holds `id`: a
 * document of another project or another user, or a deleted one that can
 * still be restored. A cloud document is then received under a new id.
 */
async function idTakenElsewhere(kind: TransferDocumentKind, id: string, link: CloudLinkRow): Promise<boolean> {
  const row = kind === "workflow" ? await Workflow.get<Workflow>(id) : await TimelineSequence.findById(id);
  if (row) return row.project_id !== link.project_id || row.user_id !== link.user_id;
  return deletedDocumentExists(kind, id);
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

/**
 * A path inside the staging folder. Each part is one plain name, such as a
 * hash or a document id the cloud sent, so a part like `..` or `a/b` from a
 * malformed answer can never reach outside the folder.
 */
function stagedPath(dir: string, ...parts: string[]): string {
  for (const part of parts) {
    if (!/^[A-Za-z0-9._-]+$/.test(part) || part === "." || part === "..") {
      throw new Error(`Refused a staging name the cloud sent: ${JSON.stringify(part)}`);
    }
  }
  const path = join(dir, ...parts);
  const root = resolve(dir) + sep;
  if (!resolve(path).startsWith(root)) throw new Error("Refused a staging path outside the staging folder");
  return path;
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
  // A self-hosted cloud can answer anything. Ids, hashes and paths name
  // files on this computer, so the answer is checked before it is kept.
  const set = captureRevisionSetOutput.parse(await transport.capture({ project_id: link.cloud_project_id }));
  const documents: PlannedDocument[] = [];
  for (const document of set.documents) {
    const linked = await getCloudLinkDocumentByCloudId(link.id, document.kind, document.document_id);
    // The plan keeps the pair, and the commit records it as the link document.
    const localId =
      linked?.local_id ??
      ((await idTakenElsewhere(document.kind, document.document_id, link))
        ? createTimeOrderedUuid()
        : document.document_id);
    const baseHash = linked?.base_content_hash ?? null;
    const localHash = await localHashOf(document.kind, localId, link.project_id);
    const status = statusOf(document.content_hash, baseHash, localHash);
    let changedFiles = 0;
    for (const file of document.files) {
      if (!(await heldLocally(file))) changedFiles += 1;
    }
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
      missingFiles: document.missing_files,
      changedFiles
    });
  }
  const plan: ReceivePlan = {
    version: 1,
    set,
    documents,
    decided: false,
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

/** The documents the person chose to receive, whether or not their own content changed. */
function received(plan: ReceivePlan): PlannedDocument[] {
  return plan.documents.filter((document) => document.decision === "receive");
}

/**
 * The files of the received documents, by hash. A file changes on its own,
 * in place under the same asset id, so the files of a document whose
 * content is the same are received too (review F33). A file the folder
 * already holds is not downloaded.
 */
function neededFiles(plan: ReceivePlan): Map<string, RevisionSetDocument["files"]> {
  const files = new Map<string, RevisionSetDocument["files"]>();
  for (const document of received(plan)) {
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
    const path = stagedPath(dir, "documents", `${document.kind}-${document.cloudId}.json`);
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
  for (const [hash, files] of neededFiles(plan)) {
    const path = stagedPath(dir, hash);
    if (await fileExists(path)) {
      // A crash can leave a staged file only after its rename, which follows its check.
      continue;
    }
    let held = true;
    for (const file of files) held &&= await heldLocally(file);
    if (held) continue;
    const part = `${path}.part`;
    const answer = await transport.downloadFile({ set_id: row.id, hash }, part);
    // An owner erased the file after the capture. The set no longer is one
    // moment, so it is treated as expired and captured again (Y7, review F32).
    if (answer === "ERASED") {
      await rm(part, { force: true });
      throw new ReceiveSetExpiredError("A file of the revision set was erased.");
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
  // Never replace a document of another project or person under the same id.
  if (current && (current.projectId !== link.project_id || current.userId !== link.user_id)) {
    throw new Error(`The local ${document.kind} ${document.localId} belongs to another project`);
  }
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
 * The documents the person chose to receive whose local copy or link base
 * changed since the sheet showed them.
 */
async function changedSinceReview(link: CloudLinkRow, plan: ReceivePlan): Promise<PlannedDocument[]> {
  const changed: PlannedDocument[] = [];
  for (const document of plan.documents) {
    if (document.decision !== "receive") continue;
    const localHash = await localHashOf(document.kind, document.localId, link.project_id);
    const linked = await getCloudLinkDocumentByCloudId(link.id, document.kind, document.cloudId);
    const baseHash = linked?.base_content_hash ?? null;
    if (localHash === document.localHash && baseHash === document.baseHash) continue;
    document.localHash = localHash;
    document.baseHash = baseHash;
    document.status = statusOf(document.contentHash, baseHash, localHash);
    document.decision = defaultDecision(document.status);
    changed.push(document);
  }
  return changed;
}

/**
 * Under the folder lock: compares the folder (CF1), then in one local
 * transaction checks every document against the hash the sheet showed and
 * writes the documents, asset rows, bases and placements, and sets state
 * `applied`. When any document the person chose changed since the review,
 * it writes nothing, keeps the staged files and returns the receive to the
 * review with those documents' new status (Y3, review F31). Returns whether
 * it applied.
 */
async function commit(
  row: CloudReceiveRow,
  link: CloudLinkRow,
  plan: ReceivePlan,
  dir: string,
  hold: FolderLockHold
): Promise<boolean> {
  // A cancel claims a receive under this folder lock by deleting its row and
  // staged files, so a commit after it finds the row gone (review F45).
  const live = await getCloudReceive(row.id);
  if (!live || live.state !== "installed") throw new ReceiveCancelledError(row.id);
  await reconcileInBackground(link.project_id, link.user_id, { under: hold });
  const payloads = new Map<PlannedDocument, TransferPayloadContent>();
  for (const document of toWrite(plan)) {
    const text = await readFile(stagedPath(dir, "documents", `${document.kind}-${document.cloudId}.json`), "utf8");
    payloads.set(document, JSON.parse(text) as TransferPayloadContent);
  }
  // A transaction on SQLite may await nothing but the database, so the
  // staged files are looked at before it.
  const staged = new Set<string>();
  for (const hash of neededFiles(plan).keys()) {
    if (await fileExists(stagedPath(dir, hash))) staged.add(hash);
  }
  return withoutDocumentFileWrites(() =>
    withTransaction(async () => {
      const changed = await changedSinceReview(link, plan);
      if (changed.length > 0) {
        plan.decided = false;
        plan.result = {
          ...emptyResult(),
          changedDuringReceive: changed.map((document) => ({ kind: document.kind, id: document.localId, name: document.name }))
        };
        await updateCloudReceive(row.id, { state: "staging", plan });
        return false;
      }
      const result = emptyResult();
      const placements: PlannedPlacement[] = [];
      for (const document of plan.documents) {
        const entry = { kind: document.kind, id: document.localId, name: document.name };
        if (document.decision !== "receive") {
          result.notReceived.push({ ...entry, status: document.status });
          continue;
        }
        const payload = payloads.get(document);
        if (payload) {
          await writeDocument(link, document, payload);
          result.received.push(entry);
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
      for (const document of received(plan)) {
        result.missingFiles.push(...document.missingFiles);
        for (const file of document.files) {
          if (seen.has(file.asset_id)) continue;
          seen.add(file.asset_id);
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
            placements.push({
              assetId: asset.id,
              path,
              hash: file.hash,
              replaceIfHash: base?.base_hash ?? null,
              existing: true
            });
            // The row keeps describing the local bytes until the received
            // ones take its path, which the placing decides (review F34).
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
      return true;
    })
  );
}

/** The person cancelled the receive before it applied. Nothing was written. */
export class ReceiveCancelledError extends Error {
  constructor(setId: string) {
    super(`The receive ${setId} was cancelled`);
    this.name = "ReceiveCancelledError";
  }
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

/** Where a replacement keeps the bytes it moved off a path until they are checked. */
function displacedPath(dir: string, placementId: string): string {
  return join(dir, `displaced-${placementId}`);
}

/**
 * Replaces the file at `target` with the staged bytes only while it still
 * holds `baseHash`. Another app can save the file at any moment, and the
 * folder lock does not stop it, so the file is first moved aside in one
 * rename and the moved bytes are checked. Bytes that changed go back to the
 * path, or beside it when the path was taken meanwhile. Returns false when
 * the staged bytes were not placed at `target`.
 */
async function replaceUnchanged(
  workspace: Workspace,
  dir: string,
  placementId: string,
  target: string,
  staged: string,
  baseHash: string
): Promise<boolean> {
  const displaced = displacedPath(dir, placementId);
  try {
    await rename(localPath(workspace, target), displaced);
  } catch {
    // The file went away after it was checked. The next pass sees a free path.
    return false;
  }
  await pausePoint("receive.place.moved-aside");
  if ((await contentHashOfFile(displaced)) !== baseHash) {
    if (await workspace.absorbNew(displaced, target)) await rm(displaced, { force: true });
    return false;
  }
  const placed = await workspace.absorbNew(staged, target);
  if (placed) await rm(displaced, { force: true });
  return placed;
}

/**
 * After a crash during {@link replaceUnchanged}, puts bytes it moved aside
 * back: at the path when it is free, beside it otherwise. Bytes that equal
 * the base are the ones the receive replaces and are dropped.
 */
async function restoreDisplaced(
  workspace: Workspace,
  dir: string,
  placementId: string,
  path: string,
  baseHash: string | null,
  now: Date,
  plan: ReceivePlan
): Promise<void> {
  const displaced = displacedPath(dir, placementId);
  if (!(await fileExists(displaced))) return;
  if (baseHash !== null && (await contentHashOfFile(displaced)) === baseHash) {
    await rm(displaced, { force: true });
    return;
  }
  if (await workspace.absorbNew(displaced, path)) {
    await rm(displaced, { force: true });
    return;
  }
  const beside = await keptPath(workspace, path, now);
  if (!(await workspace.absorbNew(displaced, beside))) {
    throw new Error(`Could not put back the local file of ${path}`);
  }
  (plan.result.localKept ??= []).push({ path, keptPath: beside });
  await updateCloudReceive(plan.set.set_id, { plan });
  await rm(displaced, { force: true });
}

/**
 * Puts the staged bytes beside `path` and returns where. The path is
 * recorded before the bytes go there, with the id of the asset they become
 * when the local file is a changed asset, and a later run reuses both
 * (review F48).
 */
async function keepBeside(
  workspace: Workspace,
  row: CloudReceiveRow,
  plan: ReceivePlan,
  key: string,
  path: string,
  hash: string,
  staged: string,
  existing: boolean,
  now: Date
): Promise<string> {
  const recorded = plan.keptPlacements?.[key];
  if (recorded && (await workspace.exists(recorded.path))) {
    if ((await contentHashOfFile(localPath(workspace, recorded.path))) === hash) return recorded.path;
  } else if (recorded) {
    if (await workspace.absorbNew(staged, recorded.path)) return recorded.path;
  }
  // No path is recorded, or another app took the recorded one.
  const target = await keptPath(workspace, path, now);
  (plan.keptPlacements ??= {})[key] = {
    path: target,
    siblingId: recorded?.siblingId ?? (existing ? createTimeOrderedUuid() : null)
  };
  await updateCloudReceive(row.id, { plan });
  if (!(await workspace.absorbNew(staged, target))) {
    throw new Error(`Could not place a received file beside ${path}`);
  }
  return target;
}

/** Lists a file kept beside its path once, however often a run after a crash places it. */
async function reportKeptBeside(
  row: CloudReceiveRow,
  plan: ReceivePlan,
  entry: { assetId: string; path: string; keptPath: string }
): Promise<void> {
  const listed = plan.result.keptBeside.findIndex((kept) => kept.assetId === entry.assetId);
  if (listed >= 0 && plan.result.keptBeside[listed]!.keptPath === entry.keptPath) return;
  if (listed >= 0) plan.result.keptBeside[listed] = entry;
  else plan.result.keptBeside.push(entry);
  await updateCloudReceive(row.id, { plan });
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
    const staged = stagedPath(dir, placement.hash);
    let target = placement.path;
    await restoreDisplaced(workspace, dir, placement.id, placement.path, planned.replaceIfHash, now, plan);
    const existing = (await workspace.exists(target)) ? await contentHashOfFile(localPath(workspace, target)) : null;
    let placed = false;
    if (existing === placement.hash) {
      placed = true;
    } else if (existing === null) {
      placed = await workspace.absorbNew(staged, target);
    } else if (existing === planned.replaceIfHash) {
      await pausePoint("receive.place.replacing");
      placed = await replaceUnchanged(workspace, dir, placement.id, target, staged, planned.replaceIfHash);
    }
    const keyOf = `${planned.assetId}:${placement.hash}`;
    if (!placed) {
      target = await keepBeside(workspace, row, plan, keyOf, placement.path, placement.hash, staged, planned.existing === true, now);
    }
    const asset = await Asset.get<Asset>(planned.assetId);
    const fileStat = await workspace.stat(target);
    if (!fileStat) throw new Error(`The received file at ${target} is gone`);
    const fingerprint = {
      workspace_size: fileStat.size,
      workspace_mtime: fileStat.modifiedAt,
      workspace_hash: await partialContentHashOfFile(localPath(workspace, target))
    };
    const siblingId = placed ? null : (plan.keptPlacements?.[keyOf]?.siblingId ?? null);
    if (siblingId) {
      // Both sides changed the file. The local asset keeps its id, path and
      // bytes, so every document that uses it keeps the local media, and the
      // received bytes become a new asset (V22, review F34). Its id was
      // recorded with the path, so a run after a crash finds it (review F48).
      if (!(await Asset.get<Asset>(siblingId))) {
        await Asset.create<Asset>({
          id: siblingId,
          user_id: link.user_id,
          project_id: link.project_id,
          parent_id: asset?.parent_id ?? link.user_id,
          name: target.slice(target.lastIndexOf("/") + 1),
          content_type: asset?.content_type ?? "application/octet-stream",
          workspace_path: target,
          size: fileStat.size,
          content_hash: placement.hash,
          metadata: withWorkspaceFingerprint(null, fingerprint)
        });
      }
      await reportKeptBeside(row, plan, { assetId: siblingId, path: placement.path, keptPath: target });
    } else {
      if (!placed) await reportKeptBeside(row, plan, { assetId: planned.assetId, path: placement.path, keptPath: target });
      if (asset) {
        await asset.update({
          workspace_path: target,
          content_hash: placement.hash,
          size: fileStat.size,
          metadata: withWorkspaceFingerprint(asset.metadata, fingerprint)
        });
      }
    }
    // Local bytes a failed replacement moved aside go back before the
    // placement that names them is cleared (review F49).
    await restoreDisplaced(workspace, dir, placement.id, placement.path, planned.replaceIfHash, now, plan);
    await pausePoint("receive.place.placed");
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

/** How many new sets one receive captures after its set expired before it gives up. */
const RECAPTURE_LIMIT = 3;

/**
 * Replaces a receive whose set expired, or named a file an owner erased,
 * with a receive of a new set (Y7, AC74, review F32). Staged files the new
 * set also names move to its staging folder after their hash is checked
 * again, so they are not downloaded twice. A document keeps the person's
 * decision only when the new set shows the revisions the person reviewed:
 * the same status, cloud hash, local hash and base (review F44). When any
 * document differs, or the set has documents the person did not see, the
 * new receive waits for review. Nothing local was written.
 */
async function recapture(
  transport: ReceiveTransport,
  row: CloudReceiveRow,
  link: CloudLinkRow,
  plan: ReceivePlan,
  workspace: Workspace,
  dir: string
): Promise<{ setId: string; reviewed: boolean; documents: PlannedDocument[] }> {
  const next = await captureReceive(transport, link);
  const nextRow = await getCloudReceive(next.setId);
  if (!nextRow) throw new Error(`The receive ${next.setId} was not recorded`);
  const nextPlan = parsePlan(nextRow);
  let reviewed = plan.decided && nextPlan.documents.length === plan.documents.length;
  for (const document of nextPlan.documents) {
    const before = plan.documents.find((entry) => entry.kind === document.kind && entry.cloudId === document.cloudId);
    if (
      before &&
      before.status === document.status &&
      before.contentHash === document.contentHash &&
      before.localHash === document.localHash &&
      before.baseHash === document.baseHash
    ) {
      document.decision = before.decision;
    } else {
      reviewed = false;
    }
  }
  nextPlan.decided = reviewed;
  const nextDir = stagingDir(workspace, next.setId);
  for (const document of nextPlan.documents) {
    for (const file of document.files) {
      const staged = stagedPath(dir, file.hash);
      if (!(await fileExists(staged)) || (await contentHashOfFile(staged)) !== file.hash) continue;
      await mkdir(nextDir, { recursive: true });
      await rename(staged, stagedPath(nextDir, file.hash));
    }
  }
  await updateCloudReceive(next.setId, { plan: nextPlan });
  await transport.release({ set_id: row.id }).catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
  await deleteCloudReceive(row.id);
  return { setId: next.setId, reviewed, documents: nextPlan.documents };
}

/**
 * Cancels a receive the person closed before it was applied: releases the
 * set, deletes the staging folder and the receive's row (review F41). A
 * receive that applied its commit already only has its files left to place,
 * so it is left for {@link runReceive} or {@link resumeReceives}, and the
 * answer is `applied`.
 */
export async function cancelReceive(transport: ReceiveTransport, setId: string): Promise<"cancelled" | "applied"> {
  const row = await getCloudReceive(setId);
  if (!row) return "cancelled";
  if (row.state === "applied") return "applied";
  const link = await getCloudLinkById(row.link_id);
  const folder = link ? await requireProjectFolder(link.project_id, link.user_id).catch(() => null) : null;
  if (link && folder) {
    // The commit and the placing run under the folder lock. Under it the
    // cancel either finds the receive applied and leaves its staged files to
    // the placing, or claims it by deleting the row, which a commit that
    // runs later finds gone (review F45).
    const claimed = await withProjectFolderLock(link.user_id, link.project_id, async () => {
      const current = await getCloudReceive(setId);
      if (!current) return "gone" as const;
      if (current.state === "applied") return "applied" as const;
      await deleteCloudReceive(setId);
      await rm(stagingDir(folder.workspace, setId), { recursive: true, force: true });
      return "claimed" as const;
    });
    if (claimed === "applied") return "applied";
    if (claimed === "claimed") await transport.release({ set_id: setId }).catch(() => undefined);
  } else {
    await transport.release({ set_id: setId }).catch(() => undefined);
    await deleteCloudReceive(setId);
  }
  return "cancelled";
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
  return runReceiveOf(transport, setId, decisions, options, 0);
}

async function runReceiveOf(
  transport: ReceiveTransport,
  setId: string,
  decisions: ReadonlyArray<{ kind: TransferDocumentKind; document_id: string; decision: ReceiveDecision }> | undefined,
  options: ReceiveRunOptions,
  recaptures: number
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
      if (!(error instanceof ReceiveSetExpiredError)) throw error;
      if (recaptures >= RECAPTURE_LIMIT) return abandon(row, dir);
      const next = await recapture(transport, row, link, plan, workspace, dir);
      if (!next.reviewed) return { status: "waiting_for_review", setId: next.setId, documents: next.documents };
      return runReceiveOf(transport, next.setId, undefined, options, recaptures + 1);
    }
    row = { ...row, state: "installed" };
    await after("installed");
  }
  const current = row;
  // The commit and the placing take the folder lock again for the reconcile
  // and the document files.
  const applied = await withProjectFolderLock(
    link.user_id,
    link.project_id,
    async (hold) => {
      if (current.state === "installed") {
        if (!(await commit(current, link, plan, dir, hold))) return false;
        await after("applied");
      }
      await place(current, link, plan, workspace, dir);
      return true;
    }
  );
  if (!applied) return { status: "waiting_for_review", setId, documents: plan.documents };
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
