/**
 * The file operations of a transfer into a cloud project
 * (docs/plans/native-cloud-sync/technical-design.md, "Operations of a
 * transfer" and "Placement", WP2.4).
 *
 * The commit checks each put and delete against what the cloud holds at the
 * path and writes the asset rows and a placement per file in its
 * transaction. The files themselves are written after the commit by
 * {@link runTransferPlacements}, under the project folder lock, because a
 * file write cannot join a database transaction. Bytes a placement replaces
 * or deletes stay in the blob store for 30 days through a recovery copy.
 *
 * A path a placement has not written yet is in flux for the project index,
 * so a scan in between neither marks the asset offline nor gives the file a
 * second row. A sweeper repeats the placements a crash left behind.
 */
import { createLogger } from "@nodetool-ai/config";
import {
  addTransferPlacements,
  Asset,
  deleteTransferPlacement,
  listTransferPlacements,
  Project,
  projectsWithStalePlacements,
  recordRecoveryCopy,
  type NewTransferPlacement,
  type TransferPlacementRow
} from "@nodetool-ai/models";
import type { Workspace } from "@nodetool-ai/runtime";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { blobHash, readBlob, storeNamedBlob } from "@nodetool-ai/asset-services/blob-store";
import { withProjectFolderLock } from "@nodetool-ai/asset-services/project-asset";
import {
  partialContentHash,
  requireProjectFolder,
  withWorkspaceFingerprint
} from "@nodetool-ai/asset-services/project-asset-file";
import type {
  TransferFailure,
  TransferFileOperation
} from "@nodetool-ai/protocol/api-schemas/transfer.js";

const log = createLogger("nodetool.project-services.transfer-files");

/** A placement older than this is the sweeper's to repeat. */
export const PLACEMENT_SWEEP_AGE_MS = 30_000;

/** Paths a document travels under, never as a workspace file (CF2). */
const DOCUMENT_FILE_SUFFIXES = [".workflow.json", ".timeline.json"];

export interface KeptBeside {
  path: string;
  kept_path: string;
  asset_id?: string;
  kept_asset_id?: string;
}

/** What the commit applies once every check passed. */
export interface FileOperationPlan {
  placements: Omit<NewTransferPlacement, "projectId" | "userId" | "transferId">[];
  assets: (
    | { action: "create"; id?: string; name: string; contentType: string; path: string; hash: string; size: number }
    | { action: "replace"; asset: Asset; path: string; hash: string; size: number }
  )[];
  keptBeside: KeptBeside[];
  /** Entries of `keptBeside` whose asset is created with the plan, by index into `assets`. */
  keptAssetIndex: Map<number, number>;
}

/** What the cloud holds at a project's paths: pending placements, then the folder. */
class CloudPaths {
  private readonly pending = new Map<string, string | null>();
  private readonly assigned = new Set<string>();
  private readonly hashes = new Map<string, string | null>();

  private constructor(private readonly workspace: Workspace | null) {}

  static async open(projectId: string, workspace: Workspace | null): Promise<CloudPaths> {
    const paths = new CloudPaths(workspace);
    // Oldest first, so the latest placement of a path wins.
    for (const placement of await listTransferPlacements(projectId)) {
      paths.pending.set(placement.path, placement.hash);
    }
    return paths;
  }

  /** The SHA-256 of the file at `path` as the cloud holds it, or null for none. */
  async hashAt(path: string): Promise<string | null> {
    if (this.pending.has(path)) return this.pending.get(path) ?? null;
    if (this.hashes.has(path)) return this.hashes.get(path) ?? null;
    let hash: string | null = null;
    if (this.workspace) {
      const bytes = await this.workspace.read(path);
      hash = bytes ? blobHash(bytes) : null;
    }
    this.hashes.set(path, hash);
    return hash;
  }

  /** Records that this attempt writes `path`, so a kept name never takes it. */
  claim(path: string): void {
    this.assigned.add(path);
  }

  async taken(path: string): Promise<boolean> {
    return this.assigned.has(path) || (await this.hashAt(path)) !== null;
  }

  /**
   * A free path beside `path` for a file kept next to the cloud one: the
   * name gets the sending device and the date, and a counter when that is
   * taken as well.
   */
  async keptPath(path: string, device: string, now: Date): Promise<string> {
    const slash = path.lastIndexOf("/");
    const dir = path.slice(0, slash + 1);
    const name = path.slice(slash + 1);
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    const label = `${device} ${now.toISOString().slice(0, 10)}`;
    for (let n = 1; ; n += 1) {
      const candidate = `${dir}${stem} (${label}${n > 1 ? ` ${n}` : ""})${ext}`;
      if (!(await this.taken(candidate))) {
        this.claim(candidate);
        return candidate;
      }
    }
  }
}

function keptName(name: string, keptPath: string): string {
  const file = keptPath.slice(keptPath.lastIndexOf("/") + 1);
  return file || name;
}

/**
 * Checks the file operations against the cloud and plans their apply.
 * `workspace` is null for a first publication, whose folder holds nothing.
 * Failures go to `failures`, and the plan is only applied when none did.
 */
export async function planFileOperations(input: {
  projectId: string;
  userId: string;
  operations: readonly TransferFileOperation[];
  workspace: Workspace | null;
  deviceName: string | undefined;
  failures: TransferFailure[];
  now: Date;
}): Promise<FileOperationPlan> {
  const { projectId, userId, operations, failures, now } = input;
  const device = input.deviceName ?? "Another device";
  const cloud = await CloudPaths.open(projectId, input.workspace);
  const plan: FileOperationPlan = { placements: [], assets: [], keptBeside: [], keptAssetIndex: new Map() };
  const fail = (code: TransferFailure["code"], message: string, extra: Partial<TransferFailure>) => {
    failures.push({ code, message, ...extra });
  };

  const seenPaths = new Set<string>();
  const seenAssets = new Set<string>();
  for (const op of operations) {
    if (seenPaths.has(op.path)) {
      fail("PAYLOAD_INVALID", "The transfer names this path twice", { path: op.path });
    }
    seenPaths.add(op.path);
    if (op.op === "put_asset_file") {
      if (seenAssets.has(op.asset_id)) {
        fail("PAYLOAD_INVALID", "The transfer names this asset twice", { asset_id: op.asset_id });
      }
      seenAssets.add(op.asset_id);
    } else if (DOCUMENT_FILE_SUFFIXES.some((suffix) => op.path.endsWith(suffix))) {
      fail("PAYLOAD_INVALID", "A workflow or timeline file travels as its document", { path: op.path });
    }
  }
  if (failures.length > 0) return plan;
  // The paths this attempt writes as given are its own before any kept name is chosen.
  for (const op of operations) cloud.claim(op.path);

  for (const op of operations) {
    switch (op.op) {
      case "put_workspace_file": {
        const stored = await cloud.hashAt(op.path);
        if (stored === op.hash) break;
        if (stored === op.base_hash) {
          plan.placements.push({ path: op.path, hash: op.hash });
          break;
        }
        const kept = await cloud.keptPath(op.path, device, now);
        plan.placements.push({ path: kept, hash: op.hash });
        plan.keptBeside.push({ path: op.path, kept_path: kept });
        break;
      }
      case "delete_workspace_file": {
        const stored = await cloud.hashAt(op.path);
        if (stored === null) break;
        if (stored !== op.base_hash) {
          fail("BASE_CHANGED", "The cloud file changed since the review", { path: op.path, stored_hash: stored });
          break;
        }
        plan.placements.push({ path: op.path, hash: null });
        break;
      }
      case "put_asset_file": {
        const asset = await Asset.get<Asset>(op.asset_id);
        if (asset && (asset.project_id !== projectId || asset.user_id !== userId)) {
          fail("DOCUMENT_NOT_IN_PROJECT", "The asset is not in this project", { asset_id: op.asset_id, path: op.path });
          break;
        }
        if (!asset) {
          // A new asset takes its path unless the cloud holds other bytes there.
          const stored = await cloud.hashAt(op.path);
          const path = stored === null || stored === op.hash ? op.path : await cloud.keptPath(op.path, device, now);
          plan.assets.push({
            action: "create",
            id: op.asset_id,
            name: path === op.path ? op.name : keptName(op.name, path),
            contentType: op.content_type,
            path,
            hash: op.hash,
            size: op.size
          });
          if (stored !== op.hash) plan.placements.push({ path, hash: op.hash, assetId: op.asset_id });
          if (path !== op.path) plan.keptBeside.push({ path: op.path, kept_path: path, asset_id: op.asset_id });
          break;
        }
        const path = asset.workspace_path ?? op.path;
        const stored = asset.content_hash ?? (await cloud.hashAt(path));
        if (stored === op.hash) break;
        if (stored === op.base_hash) {
          plan.assets.push({ action: "replace", asset, path, hash: op.hash, size: op.size });
          plan.placements.push({ path, hash: op.hash, assetId: asset.id });
          break;
        }
        // V22: both are kept. The sent bytes become a new asset beside the
        // cloud one, and documents keep the existing id.
        const kept = await cloud.keptPath(path, device, now);
        plan.keptAssetIndex.set(plan.keptBeside.length, plan.assets.length);
        plan.assets.push({
          action: "create",
          name: keptName(op.name, kept),
          contentType: op.content_type,
          path: kept,
          hash: op.hash,
          size: op.size
        });
        plan.placements.push({ path: kept, hash: op.hash });
        plan.keptBeside.push({ path, kept_path: kept, asset_id: asset.id });
        break;
      }
    }
  }
  return plan;
}

/**
 * Applies a checked plan inside the commit transaction: the asset rows and
 * the placements. Returns the kept-beside list with the new asset ids.
 */
export async function applyFileOperations(
  plan: FileOperationPlan,
  context: { projectId: string; userId: string; transferId: string; now: Date }
): Promise<KeptBeside[]> {
  const createdIds: string[] = [];
  const placementAsset = new Map<string, string>();
  for (const entry of plan.assets) {
    if (entry.action === "replace") {
      await entry.asset.update({ content_hash: entry.hash, size: entry.size });
      createdIds.push(entry.asset.id);
      continue;
    }
    const fields: Record<string, unknown> = {
      user_id: context.userId,
      project_id: context.projectId,
      // The user's home folder, where an asset with no folder of its own lists.
      parent_id: context.userId,
      name: entry.name,
      content_type: entry.contentType,
      workspace_path: entry.path,
      size: entry.size,
      content_hash: entry.hash
    };
    if (entry.id) fields["id"] = entry.id;
    const asset = await Asset.create<Asset>(fields);
    createdIds.push(asset.id);
    placementAsset.set(entry.path, asset.id);
  }
  await addTransferPlacements(
    plan.placements.map((placement) => ({
      ...placement,
      assetId: placement.assetId ?? placementAsset.get(placement.path) ?? null,
      projectId: context.projectId,
      userId: context.userId,
      transferId: context.transferId
    })),
    context.now
  );
  return plan.keptBeside.map((entry, index) => {
    const assetIndex = plan.keptAssetIndex.get(index);
    if (assetIndex !== undefined) return { ...entry, kept_asset_id: createdIds[assetIndex] };
    if (entry.asset_id) return { ...entry, kept_asset_id: entry.asset_id };
    return entry;
  });
}

function recoveryOperation(placement: TransferPlacementRow) {
  if (placement.hash === null) return "delete_workspace_file" as const;
  return placement.asset_id ? ("put_asset_file" as const) : ("put_workspace_file" as const);
}

/** One placement: keep what it replaces, write or delete the file, record the fingerprint. */
async function place(storage: StorageAdapter, workspace: Workspace, placement: TransferPlacementRow): Promise<void> {
  const existing = await workspace.read(placement.path);
  const existingHash = existing ? blobHash(existing) : null;
  if (existing && existingHash !== null && existingHash !== placement.hash) {
    // The row comes first, so the blob cleanup never takes the object it names.
    await recordRecoveryCopy({
      projectId: placement.project_id,
      userId: placement.user_id,
      transferId: placement.transfer_id,
      operation: recoveryOperation(placement),
      workspacePath: placement.path,
      assetId: placement.asset_id,
      blobHash: existingHash,
      size: existing.byteLength
    });
    await storeNamedBlob(storage, existingHash, existing, placement.transfer_id);
  }
  if (placement.hash === null) {
    if (existing) await workspace.delete(placement.path);
  } else {
    let bytes = existing;
    if (existingHash !== placement.hash) {
      bytes = await readBlob(storage, { projectId: placement.project_id, hash: placement.hash });
      if (!bytes) throw new Error(`The blob ${placement.hash} of a placement is missing`);
      await workspace.write(placement.path, bytes);
    }
    if (placement.asset_id && bytes) {
      const asset = await Asset.get<Asset>(placement.asset_id);
      const stat = await workspace.stat(placement.path);
      if (asset && stat && asset.workspace_path === placement.path) {
        await asset.update({
          metadata: withWorkspaceFingerprint(asset.metadata, {
            workspace_size: stat.size,
            workspace_mtime: stat.modifiedAt,
            workspace_hash: partialContentHash(bytes)
          })
        });
      }
    }
  }
  await deleteTransferPlacement(placement.id);
}

/**
 * Runs the pending placements of a project, oldest first, under its folder
 * lock. A placement that fails stays for the sweeper, and the ones after it
 * still run. Returns how many ran.
 */
export async function runTransferPlacements(storage: StorageAdapter, projectId: string): Promise<number> {
  const project = await Project.get<Project>(projectId);
  if (!project) return 0;
  return withProjectFolderLock(project.user_id, projectId, async () => {
    const placements = await listTransferPlacements(projectId);
    if (placements.length === 0) return 0;
    const { workspace } = await requireProjectFolder(projectId, project.user_id);
    let done = 0;
    for (const placement of placements) {
      try {
        await place(storage, workspace, placement);
        done += 1;
      } catch (error) {
        log.warn("A transfer placement failed", {
          projectId,
          placementId: placement.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return done;
  });
}

/** One sweep: the placements of every project with one older than {@link PLACEMENT_SWEEP_AGE_MS}. */
export async function sweepTransferPlacements(storage: StorageAdapter, now: Date = new Date()): Promise<number> {
  let done = 0;
  for (const projectId of await projectsWithStalePlacements(new Date(now.getTime() - PLACEMENT_SWEEP_AGE_MS))) {
    try {
      done += await runTransferPlacements(storage, projectId);
    } catch (error) {
      log.warn("A placement sweep of a project failed", {
        projectId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return done;
}

/** Sweeps now and every 30 seconds. Returns a stop function. */
export function startTransferPlacementSweeper(storage: StorageAdapter): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    void sweepTransferPlacements(storage)
      .catch((error) => {
        log.warn("The placement sweeper failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      })
      .finally(() => {
        running = false;
      });
  };
  tick();
  const timer = setInterval(tick, PLACEMENT_SWEEP_AGE_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
