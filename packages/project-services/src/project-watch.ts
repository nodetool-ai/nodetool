/**
 * File-system watchers for open project folders (PRD T4, US5).
 *
 * A change another app makes in a project folder reaches the asset index
 * while the project is open: the folder is watched, the changed paths are
 * collected for a short quiet time, and the reconcile then looks at those
 * paths only.
 *
 * A folder is watched from the moment a client has its project open until no
 * client has. A client is one connection, and it has one project open at a
 * time. A folder in object storage has no directory on this host and no
 * outside writer, so it is never watched. Its index is reconciled when the
 * project opens and after NodeTool's own writes.
 */
import { watch as watchFileSystem } from "node:fs";
import { sep } from "node:path";
import { createLogger } from "@nodetool-ai/config";
import type { Workspace } from "@nodetool-ai/runtime";
import { requireProjectFolder } from "@nodetool-ai/asset-services/project-asset-file";
import { DebouncedRuns } from "./debounced-runs.js";
import {
  isIgnoredProjectPath,
  logReconcileFailure,
  reconcileInBackground,
  reconcileProjectOnOpen
} from "./project-index.js";

const log = createLogger("nodetool.project-services.project-watch");

/** Quiet time after the last file event before the reconcile runs, in ms. */
export const WATCH_DEBOUNCE_MS = 300;
/** Longest a reconcile waits while file events keep arriving, in ms. */
export const WATCH_MAX_WAIT_MS = 2_000;
/** More changed paths than this are reconciled as one scan of the folder. */
export const WATCH_MAX_PATHS = 2_000;

/** A running watcher. */
export interface FolderWatchHandle {
  close(): void;
}

/**
 * Starts watching `directory` and everything below it. `onChange` gets the
 * changed path relative to the directory, with `/` separators, or null when
 * the platform did not name it.
 */
export type FolderWatchFactory = (
  directory: string,
  onChange: (path: string | null) => void,
  onError: (error: unknown) => void
) => FolderWatchHandle;

const watchDirectory: FolderWatchFactory = (directory, onChange, onError) => {
  const watcher = watchFileSystem(
    directory,
    // Not persistent: a watcher must not hold the process open at shutdown.
    { recursive: true, persistent: false },
    (_event, fileName) => {
      onChange(typeof fileName === "string" ? fileName.split(sep).join("/") : null);
    }
  );
  watcher.on("error", onError);
  return watcher;
};

/**
 * One connection that can have a project open. The owner of the connection
 * makes the symbol and keeps it for as long as the connection lives.
 */
export type ProjectClient = symbol;

interface WatchedFolder {
  key: string;
  projectId: string;
  userId: string;
  /** The connections that have the project open. */
  clients: Set<ProjectClient>;
  /** Null for a folder with no directory on this host. */
  handle: FolderWatchHandle | null;
  /** Paths changed since the last reconcile. */
  paths: Set<string>;
  /** The next reconcile scans the whole folder. */
  whole: boolean;
}

interface ClientState {
  /** The folder the client has open. */
  key: string | null;
  /** Counts the client's calls, so a slow earlier one does not win. */
  turn: number;
}

function folderKey(projectId: string, userId: string): string {
  return `${userId}\u0000${projectId}`;
}

export class ProjectFolderWatchers {
  private readonly folders = new Map<string, WatchedFolder>();
  private readonly clients = new Map<ProjectClient, ClientState>();
  private readonly runs = new DebouncedRuns({
    debounceMs: WATCH_DEBOUNCE_MS,
    maxWaitMs: WATCH_MAX_WAIT_MS,
    onError: logReconcileFailure
  });

  constructor(private readonly watch: FolderWatchFactory = watchDirectory) {}

  /**
   * Record that `client` now has `projectId` open and no other project. Null
   * records that it has none. The project's folder is watched while at least
   * one client has it open, and its index is reconciled when it opens. A
   * missing or loose project id names Personal. Never throws.
   */
  async setOpenProject(
    client: ProjectClient,
    userId: string,
    projectId: string | null
  ): Promise<void> {
    const state = this.clients.get(client) ?? { key: null, turn: 0 };
    const turn = ++state.turn;
    this.leave(client, state);
    if (projectId === null) {
      this.clients.delete(client);
      return;
    }
    this.clients.set(client, state);

    let folder: Awaited<ReturnType<typeof requireProjectFolder>>;
    try {
      folder = await requireProjectFolder(projectId, userId);
    } catch (error) {
      // A folder that is away is reported where the project is shown.
      log.debug("No watcher for a project whose folder cannot be reached", {
        reason: error instanceof Error ? error.message : String(error)
      });
      return;
    }
    // The client moved on, or disconnected, while the folder was resolved.
    if (this.clients.get(client) !== state || state.turn !== turn) return;

    const key = folderKey(folder.projectId, userId);
    let watched = this.folders.get(key);
    if (!watched) {
      watched = {
        key,
        projectId: folder.projectId,
        userId,
        clients: new Set(),
        handle: null,
        paths: new Set(),
        whole: false
      };
      this.folders.set(key, watched);
    }
    watched.clients.add(client);
    state.key = key;
    if (!watched.handle) this.start(watched, folder.workspace);
    reconcileProjectOnOpen(folder.projectId, userId);
  }

  /**
   * Record that `client` is gone. The folder of its project stops being
   * watched when no other client has that project open.
   */
  release(client: ProjectClient): void {
    const state = this.clients.get(client);
    if (!state) return;
    this.clients.delete(client);
    this.leave(client, state);
  }

  /** Whether the folder of the project is being watched right now. */
  isWatching(projectId: string, userId: string): boolean {
    return Boolean(this.folders.get(folderKey(projectId, userId))?.handle);
  }

  /** How many folders are being watched right now. */
  get watching(): number {
    let count = 0;
    for (const folder of this.folders.values()) if (folder.handle) count++;
    return count;
  }

  /** Reconcile every collected change now and wait for the reconciles. */
  async flush(): Promise<void> {
    await this.runs.flush();
  }

  /** Stop every watcher and forget every client. */
  closeAll(): void {
    for (const folder of this.folders.values()) this.stop(folder);
    this.folders.clear();
    this.clients.clear();
  }

  private leave(client: ProjectClient, state: ClientState): void {
    const key = state.key;
    state.key = null;
    const watched = key === null ? undefined : this.folders.get(key);
    if (!watched) return;
    watched.clients.delete(client);
    if (watched.clients.size > 0) return;
    // Changes still waiting are found by the reconcile of the next open.
    this.stop(watched);
    this.folders.delete(watched.key);
  }

  private start(watched: WatchedFolder, workspace: Workspace): void {
    const directory = workspace.localDir;
    // A folder in object storage has no directory to watch.
    if (directory === null) return;
    try {
      watched.handle = this.watch(
        directory,
        (path) => this.changed(watched, path),
        (error) => {
          log.warn("A project folder watcher failed and was stopped", {
            projectId: watched.projectId,
            error: error instanceof Error ? error.message : String(error)
          });
          this.stop(watched);
        }
      );
    } catch (error) {
      log.warn("Could not watch a project folder", {
        projectId: watched.projectId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private stop(watched: WatchedFolder): void {
    this.runs.cancel(watched.key);
    watched.paths.clear();
    watched.whole = false;
    const handle = watched.handle;
    watched.handle = null;
    try {
      handle?.close();
    } catch {
      // A watcher that already failed has nothing left to close.
    }
  }

  private changed(watched: WatchedFolder, path: string | null): void {
    if (!watched.handle) return;
    if (path === null) {
      watched.whole = true;
    } else {
      // NodeTool's own files and directories the index never enters.
      if (isIgnoredProjectPath(path)) return;
      watched.paths.add(path);
      if (watched.paths.size > WATCH_MAX_PATHS) watched.whole = true;
    }
    this.runs.schedule(watched.key, () => this.reconcile(watched));
  }

  private async reconcile(watched: WatchedFolder): Promise<void> {
    const paths = watched.paths;
    const whole = watched.whole;
    watched.paths = new Set();
    watched.whole = false;
    await reconcileInBackground(
      watched.projectId,
      watched.userId,
      whole ? {} : { paths }
    );
  }
}

/** The process-wide watchers, driven by the clients' open-project signal. */
export const projectFolderWatchers = new ProjectFolderWatchers();
