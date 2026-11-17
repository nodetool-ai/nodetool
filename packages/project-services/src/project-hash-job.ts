/**
 * The background job that computes the full content hash of every indexed
 * file in a project folder (PRD T3, T4).
 *
 * The fingerprint a row records on every scan covers only the first and last
 * 1 MiB of its file, because a full hash of multi-gigabyte footage is too
 * slow to run during a scan. This job reads each file once, in the
 * background, and stores its SHA-256 in `nodetool_assets.content_hash`. The
 * reconcile uses that hash to tell apart moved files whose partial
 * fingerprints are equal.
 *
 * The job keeps no state of its own. What is left to do is every row of the
 * project with no `content_hash`, so a job started after a restart reads the
 * files the last one did not finish and none that it did.
 *
 * It yields to interactive work: one file is read at a time, as a stream of
 * 1 MiB pieces with the event loop running between them, and the folder lock
 * that asset saves and the reconcile take is never held.
 */
import { setImmediate as nextTurn } from "node:timers/promises";
import { createLogger } from "@nodetool-ai/config";
import { Asset } from "@nodetool-ai/models";
import type { Workspace } from "@nodetool-ai/runtime";
import {
  ProjectFolderUnavailableError,
  contentHashOfWorkspaceFile,
  isProjectAssetOffline,
  requireProjectFolder
} from "@nodetool-ai/asset-services/project-asset-file";
import { NestedFolders } from "./project-folder-scan.js";
import { scheduleAssetManifestWrite } from "./project-manifest.js";

const log = createLogger("nodetool.project-services.project-hash-job");

interface HashTarget {
  projectId: string;
  userId: string;
}

/** Whether the file still has the size and mtime the row recorded for it. */
async function matchesRecordedFingerprint(
  workspace: Workspace,
  path: string,
  metadata: Record<string, unknown> | null
): Promise<boolean> {
  const size = metadata?.["workspace_size"];
  const mtime = metadata?.["workspace_mtime"];
  if (typeof size !== "number" || typeof mtime !== "number") return false;
  try {
    const info = await workspace.stat(path);
    return (
      info !== null &&
      !info.isDirectory &&
      info.size === size &&
      Math.trunc(info.modifiedAt) === Math.trunc(mtime)
    );
  } catch {
    // A path the folder refuses is a file whose hash cannot be taken.
    return false;
  }
}

/**
 * The content hash of an asset's file at capture
 * (docs/plans/native-cloud-sync/technical-design.md, "Blob store", WP2.1).
 *
 * A stored hash is used only while the file still has the fingerprint the
 * row recorded. Otherwise the file is read again, because an asset id does
 * not fix its bytes (RF18). With `force` the file is always read, which is
 * the client's answer to `HASH_MISMATCH`. A new hash is stored on the row
 * only while the file and the row still agree, as the background job does.
 * `recorded` says whether the row now holds the returned hash.
 */
export async function captureContentHash(
  workspace: Workspace,
  asset: Asset,
  options: { force?: boolean; signal?: AbortSignal } = {}
): Promise<{ hash: string; recorded: boolean }> {
  const path = asset.workspace_path;
  if (!path) throw new Error(`Asset ${asset.id} has no file in its project folder`);
  const read = asset.metadata;
  const unchanged = await matchesRecordedFingerprint(workspace, path, read);
  if (!options.force && unchanged && asset.content_hash !== null) {
    return { hash: asset.content_hash, recorded: true };
  }
  const hash = await contentHashOfWorkspaceFile(workspace, path, options.signal);
  if (hash === asset.content_hash) return { hash, recorded: true };
  const stillUnchanged = unchanged && (await matchesRecordedFingerprint(workspace, path, read));
  const recorded = stillUnchanged && (await asset.recordContentHash(hash, read));
  return { hash, recorded };
}

export class ProjectHashJob {
  private readonly pending = new Map<string, HashTarget>();
  private running: Promise<void> | null = null;
  private readonly abort = new AbortController();

  /**
   * Hash the files of the project that have no full hash yet, in the
   * background. A project already waiting is not queued twice, and one that
   * is being worked on is looked at again afterwards. Never throws.
   */
  schedule(projectId: string, userId: string): void {
    if (this.abort.signal.aborted) return;
    this.pending.set(`${userId}\u0000${projectId}`, { projectId, userId });
    this.ensureRunning();
  }

  private ensureRunning(): void {
    if (this.running) return;
    this.running = this.run().finally(() => {
      this.running = null;
      // A project scheduled while the loop was ending still gets its pass.
      if (this.pending.size > 0 && !this.abort.signal.aborted) {
        this.ensureRunning();
      }
    });
  }

  /** Resolves once every scheduled project has been worked through. */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  /**
   * Stop for good: the file being read is abandoned and nothing more is
   * started. Hashes already stored stay stored.
   */
  stop(): void {
    this.abort.abort();
    this.pending.clear();
  }

  private async run(): Promise<void> {
    for (;;) {
      const next = this.pending.entries().next();
      if (next.done || this.abort.signal.aborted) return;
      const [key, target] = next.value;
      this.pending.delete(key);
      try {
        await this.hashProject(target);
      } catch (error) {
        if (this.abort.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        // A folder that is away is reported where the project is shown.
        if (error instanceof ProjectFolderUnavailableError) {
          log.debug("Skipped hashing a project folder", { reason: message });
        } else {
          log.warn("Hashing a project folder failed", { error: message });
        }
      }
    }
  }

  private async hashProject(target: HashTarget): Promise<void> {
    const folder = await requireProjectFolder(target.projectId, target.userId);
    const { workspace } = folder;
    const rows = await Asset.listProjectFiles(target.userId, folder.projectId);
    const nested = new NestedFolders(workspace);
    let hashed = 0;
    for (const asset of rows) {
      const path = asset.workspace_path;
      if (!path || asset.content_hash !== null) continue;
      if (isProjectAssetOffline(asset)) continue;
      // A file in the folder of another project is not this project's to read.
      if (await nested.holds(path)) continue;
      // Let requests and timers that queued up run before the next file.
      await nextTurn();
      if (this.abort.signal.aborted) return;
      const read = asset.metadata;
      // A file that no longer is what the row recorded waits for the
      // reconcile, which records its new fingerprint and schedules this again.
      if (!(await matchesRecordedFingerprint(workspace, path, read))) continue;
      let hash: string;
      try {
        hash = await contentHashOfWorkspaceFile(
          workspace,
          path,
          this.abort.signal
        );
      } catch (error) {
        if (this.abort.signal.aborted) return;
        log.debug("Could not hash a project file", {
          path,
          error: error instanceof Error ? error.message : String(error)
        });
        continue;
      }
      // The file may have been written while it was read. The hash is kept
      // only for a file that is still what the row recorded, and stored only
      // while the row still records that fingerprint.
      if (!(await matchesRecordedFingerprint(workspace, path, read))) continue;
      if (await asset.recordContentHash(hash, read)) hashed++;
    }
    if (hashed > 0) {
      scheduleAssetManifestWrite(folder.projectId, target.userId);
    }
  }
}

/** The process-wide hash job. */
export const projectHashJob = new ProjectHashJob();

/** Hash the project's unhashed files in the background. Never throws. */
export function scheduleProjectHashing(
  projectId: string,
  userId: string
): void {
  projectHashJob.schedule(projectId, userId);
}
