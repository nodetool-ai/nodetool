import { isAbsolute, join, relative, sep } from "node:path";
import { createLogger, workspaceStorageKind } from "@nodetool-ai/config";
import {
  LOOSE_PROJECT_ID,
  Project,
  Workspace as WorkspaceRow,
  getSecret
} from "@nodetool-ai/models";
import {
  PERMISSION_GATE_CONTEXT_KEY,
  ProcessingContext,
  RESERVED_WORKSPACE_DIR,
  createLocalWorkspace,
  createWorkspace,
  headlessGate,
  observeWorkspace,
  type StorageAdapter,
  type Workspace,
  type WorkspaceChange
} from "@nodetool-ai/runtime";
import {
  createFalGenerationLifecycleHooks,
  withGenerationAdmission,
  type GenerationAdmission
} from "../generation-lifecycle.js";

const log = createLogger("nodetool.execution.workspace");

/**
 * The host name the kernel's headless gate reports a denial under. Shared by
 * the context built here and by `ExecutionSession.create`, which gates a
 * caller's own context the same way when that caller set no gate.
 */
export const WORKFLOW_RUN_HOST = "kernel workflow run";

/**
 * The object store a cloud deployment keeps workspaces in.
 *
 * Injected by the host rather than constructed here: `@nodetool-ai/execution`
 * has no storage dependency, and the server already builds exactly one asset
 * adapter it wants reused (connection pools, credentials).
 */
let cloudStorage: StorageAdapter | null = null;

/** Called once at startup by a host that serves cloud workspaces. */
export function setWorkspaceCloudStorage(storage: StorageAdapter | null): void {
  cloudStorage = storage;
}

/** What a host is told when a run writes in a workspace. */
export interface WorkspaceFileChange extends WorkspaceChange {
  workspaceId: string;
  userId: string;
}

/**
 * Told about every file a run writes, so a host can push the change to a
 * client watching that workspace.
 *
 * Injected the way {@link setWorkspaceCloudStorage} is: `@nodetool-ai/execution`
 * has no websocket to broadcast on, and the workspace row id — which the
 * {@link Workspace} interface deliberately does not carry — is known only here,
 * where the row is read.
 */
let changeNotifier: ((change: WorkspaceFileChange) => void) | null = null;

/** Called once at startup by a host that pushes workspace changes to clients. */
export function setWorkspaceChangeNotifier(
  notify: ((change: WorkspaceFileChange) => void) | null
): void {
  changeNotifier = notify;
}

/**
 * Where the folder at `path` lies inside the folder at `outer`, as a
 * workspace key. Null when it is not inside it. A local folder and one in
 * object storage are never inside each other.
 */
export function folderKeyInside(outer: string, path: string): string | null {
  if (isAbsolute(outer) !== isAbsolute(path)) return null;
  if (!isAbsolute(outer)) {
    return path.startsWith(`${outer}/`) ? path.slice(outer.length + 1) : null;
  }
  const inside = relative(outer, path);
  if (!inside || isAbsolute(inside)) return null;
  const segments = inside.split(sep);
  return segments[0] === ".." ? null : segments.join("/");
}

/**
 * The folders of other projects and of games that lie inside the folder of
 * `row`, as keys of its workspace. Personal's managed folder holds
 * `projects/<segment>`, where cloud projects, imported projects and games
 * keep theirs. A game's workspace has no `.nodetool/` directory to tell it
 * by, so the rows name it.
 */
async function foldersInside(row: WorkspaceRow): Promise<string[]> {
  const keys: string[] = [];
  for (const path of await WorkspaceRow.listFolderPaths(row.user_id)) {
    const key = folderKeyInside(row.path, path);
    if (key !== null) keys.push(key);
  }
  return keys;
}

/** Build the {@link Workspace} a workspace row describes. */
export function workspaceFromRow(row: WorkspaceRow): Workspace | null {
  // Read from the database only when a scan of the folder first asks.
  const nestedFolders = (): Promise<string[]> => foldersInside(row);
  const workspace = !row.isVirtual()
    ? createLocalWorkspace(row.path, { nestedFolders })
    : cloudStorage
      ? createWorkspace(cloudStorage, { prefix: row.path, nestedFolders })
      : null;
  if (!workspace) {
    log.warn(
      "A virtual workspace was requested but no cloud storage is configured",
      { workspaceId: row.id }
    );
    return null;
  }
  const notify = changeNotifier;
  if (!notify) return workspace;
  return observeWorkspace(workspace, (change) =>
    notify({ ...change, workspaceId: row.id, userId: row.user_id })
  );
}

/**
 * The workspace NodeTool writes its own files through: the folder's reserved
 * `.nodetool/` directory, as a workspace rooted there.
 *
 * A run's {@link Workspace} refuses every path in that directory, which is
 * what keeps agent tools, Code nodes and save nodes out of it. This is the
 * one way in, and it needs a workspace row, which run code never holds. The
 * project manifest writer uses it.
 */
export function nodetoolDirFromRow(row: WorkspaceRow): Workspace | null {
  if (!row.isVirtual()) {
    return createLocalWorkspace(join(row.path, RESERVED_WORKSPACE_DIR));
  }
  return cloudStorage
    ? createWorkspace(cloudStorage, {
        prefix: `${row.path}/${RESERVED_WORKSPACE_DIR}`
      })
    : null;
}

/** Gives a project that has no folder its folder, and records it on the row. */
type MissingFolderProvider = (project: Project) => Promise<unknown>;

let missingFolderProvider: MissingFolderProvider | null = null;

/**
 * Install what {@link resolveProjectWorkspace} calls for a project that has
 * no folder yet. `project-folder.ts` installs `ensureProjectFolder`, which
 * sits above this module.
 */
export function setMissingFolderProvider(provider: MissingFolderProvider | null): void {
  missingFolderProvider = provider;
}

/** The start of every reason a run reports when its folder is unreachable. */
export const PROJECT_FOLDER_NOT_FOUND = "Project folder not found";

/** A run's project folder, or why the run cannot have it. */
export type ProjectWorkspaceResolution =
  | {
      ok: true;
      projectId: string;
      workspace: Workspace;
      /** The folder's reserved directory, see {@link nodetoolDirFromRow}. */
      nodetoolDir?: Workspace | null;
    }
  | { ok: false; projectId: string | null; reason: string };

function unresolved(
  projectId: string | null,
  reason: string
): ProjectWorkspaceResolution {
  return { ok: false, projectId, reason };
}

/**
 * Resolve the folder a run reads and writes in: the workspace named by the
 * project's `workspace_id`.
 *
 * A run with no project of its own (a loose record, a file the CLI runs) uses
 * the Personal project, which is where loose records belong.
 *
 * Call it once when the run starts and keep the result for the whole run, so a
 * run started in one project never writes into another.
 *
 * It never substitutes a folder. A project from before project folders that
 * was never given one gets its own here, through the provider installed with
 * {@link setMissingFolderProvider}: the first step of the migration, for this
 * project alone, so a run or chat turn works before the user confirms the
 * migration of every project (docs/project-folders/migration-ux.md).
 * `options.createMissing: false` skips that, for the asset and document
 * services, which must not make folders on their own. When the project still
 * has no folder, or its folder is unreachable, the answer carries a reason
 * that names the folder, and the caller must refuse to start the run with it.
 */
export async function resolveProjectWorkspace(
  projectId: string | null | undefined,
  userId: string,
  options: { createMissing?: boolean } = {}
): Promise<ProjectWorkspaceResolution> {
  try {
    const project =
      !projectId ||
      projectId === LOOSE_PROJECT_ID ||
      projectId === `personal:${userId}`
        ? await Project.ensurePersonal(userId)
        : await Project.findOwned(userId, projectId);
    if (!project) {
      return unresolved(projectId ?? null, `Project not found: ${projectId}`);
    }
    if (
      !project.workspace_id &&
      missingFolderProvider &&
      options.createMissing !== false
    ) {
      await missingFolderProvider(project);
    }
    const row = project.workspace_id
      ? await WorkspaceRow.find(userId, project.workspace_id)
      : null;
    if (!row) {
      return unresolved(
        project.id,
        `${PROJECT_FOLDER_NOT_FOUND}: project "${project.name}" has no folder`
      );
    }
    if (!row.isAccessible()) {
      // A production server names no host path to its callers, the rule
      // `isLocalDeployment` in project-folder.ts applies to the project API.
      const folder =
        row.isVirtual() || process.env["NODETOOL_ENV"] === "production"
          ? `the folder of project "${project.name}"`
          : row.path;
      return unresolved(project.id, `${PROJECT_FOLDER_NOT_FOUND}: ${folder}`);
    }
    const workspace = workspaceFromRow(row);
    if (!workspace) {
      return unresolved(
        project.id,
        `${PROJECT_FOLDER_NOT_FOUND}: cloud folder storage is not configured`
      );
    }
    return {
      ok: true,
      projectId: project.id,
      workspace,
      nodetoolDir: nodetoolDirFromRow(row)
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("Failed to resolve the project folder", {
      projectId,
      userId,
      error: message
    });
    return unresolved(
      projectId ?? null,
      `${PROJECT_FOLDER_NOT_FOUND}: ${message}`
    );
  }
}

/** True when this deployment keeps workspaces in object storage. */
export function usesCloudWorkspaces(): boolean {
  return workspaceStorageKind() === "cloud";
}

/**
 * Build a minimal execution context carrying the resolved workspace, for run
 * paths (REST / tRPC / MCP) that otherwise run without a ProcessingContext.
 * The streaming WebSocket runner builds a richer context of its own; this keeps
 * the workspace available everywhere else with the same resolution rules.
 *
 * The run's secrets come with it. Without a resolver `context.getSecret`
 * answers `null` for every key and providers see only the process environment,
 * so a key stored in the secret DB is invisible: an agent could generate an
 * image in a chat turn and get a 401 from the same provider when it ran the
 * workflow it had just built. The resolver is scoped to the run's own user,
 * which is the only account whose secrets this run may read.
 *
 * So do the storage adapters. A context with none resolves no `asset://` ref
 * at all — every uploaded image wired into a graph reached its node empty, and
 * the node reported "The input image is empty". The host passes the same two
 * adapters the streaming WebSocket runner uses; a host that passes neither
 * keeps the old read-nothing behaviour rather than guessing at a backend.
 *
 * The context carries the headless permission gate, set here on purpose: a
 * workflow run is consent — the user pressed Run on a graph whose nodes list
 * their tools — so an agent loop inside it gates in `auto` with no human to
 * ask, and every escalation the ladder raises is denied. Setting it
 * explicitly is what lets `gateFromContext` in `@nodetool-ai/agents` treat a
 * context with no gate as a bug and fail closed. A host that does have a
 * user to ask — a chat turn — puts its own gate on the context it hands in
 * and never comes through here.
 */
export function buildWorkspaceExecutionContext(opts: {
  jobId: string;
  workflowId?: string | null;
  projectId?: string | null;
  userId: string;
  workspace: Workspace | null;
  /** Overrides the per-user DB lookup (tests, a host with its own store). */
  secretResolver?: (
    key: string,
    userId: string
  ) => Promise<string | null | undefined> | string | null | undefined;
  /** Temp store for runtime-materialized refs. */
  storage?: StorageAdapter | null;
  /** Asset store `asset://<id>` references resolve through. */
  assetStorage?: StorageAdapter | null;
  /** Enable the execution-owned FAL durable lifecycle for this host. */
  durableFalGenerations?: boolean;
  /** Checked before each provider call the run makes. */
  admitGeneration?: GenerationAdmission;
}): ProcessingContext {
  const durable = opts.durableFalGenerations
    ? createFalGenerationLifecycleHooks({
        userId: opts.userId,
        jobId: opts.jobId,
        projectId: opts.projectId,
        publicUrl: process.env["NODETOOL_PUBLIC_URL"] ?? null
      })
    : undefined;
  const generationLifecycle = opts.admitGeneration
    ? withGenerationAdmission(durable ?? {}, opts.admitGeneration)
    : durable;
  const context = new ProcessingContext({
    jobId: opts.jobId,
    workflowId: opts.workflowId ?? null,
    projectId: opts.projectId ?? null,
    userId: opts.userId,
    workspace: opts.workspace,
    storage: opts.storage ?? null,
    assetStorage: opts.assetStorage ?? null,
    secretResolver:
      opts.secretResolver ??
      ((key: string, userId: string) => getSecret(key, userId)),
    generationLifecycle
  });
  context.set(PERMISSION_GATE_CONTEXT_KEY, headlessGate(WORKFLOW_RUN_HOST));
  return context;
}
