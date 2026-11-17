/**
 * The migration into project folders as the user confirms and follows it
 * (docs/project-folders/migration-ux.md, issue #7634).
 *
 * Every case runs against a real SQLite database, real project folders under
 * a temporary `PROJECTS_DIR`, and a file asset store. A new runner and job
 * stand for a restarted process.
 */
import { link, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  ModelObserver,
  Project,
  Setting,
  Workflow,
  Workspace,
  assets,
  clearSecretCache,
  getPortableDb,
  initTestDb,
  setWorkflowFileSync
} from "@nodetool-ai/models";
import { FileStorageAdapter, type StorageAdapter } from "@nodetool-ai/storage";
import { resolveProjectWorkspace } from "@nodetool-ai/execution/service";
import { getAssetStorageKey } from "@nodetool-ai/asset-services/asset-paths";
import { getAssetAdapter } from "@nodetool-ai/asset-services/storage";
import type { LegacyAssetMoveOptions } from "@nodetool-ai/asset-services/legacy-asset-move";
import { ProjectAssetMoveJob, scheduleLegacyAssetMoves } from "../src/project-asset-move-job.js";
import {
  PROJECT_FOLDER_MIGRATION_SETTING,
  ProjectFolderMigrationError,
  ProjectFolderMigrationRunner,
  bulkMigrationAllowed,
  buildMigrationPlan,
  confirmMigration,
  dismissMigration,
  getMigrationStatus,
  locationNeedsPermission,
  pauseMigration,
  readMigrationStatus,
  resumeMigration,
  retryMigration,
  runMigrationToEnd,
  showMigrationPlan,
  startProjectFolderMigration
} from "../src/project-folder-migration.js";
import { documentFileSync } from "../src/document-file-sync.js";
import { workflowFileAdapter } from "../src/workflow-file.js";
import { flushProjectReconciles } from "../src/project-index.js";

vi.mock("@nodetool-ai/asset-services/storage", () => ({
  getAssetAdapter: vi.fn()
}));

const USER = "1";
const PNG = "image/png";

let root: string;
let store: StorageAdapter;
let job: ProjectAssetMoveJob;
let runner: ProjectFolderMigrationRunner;

/** A job and runner that stand for one server process. */
function newProcess(
  afterStep?: LegacyAssetMoveOptions["afterStep"],
  settleMs = 0
): void {
  runner?.stop();
  job = new ProjectAssetMoveJob({ settleMs, afterStep, gate: bulkMigrationAllowed });
  runner = new ProjectFolderMigrationRunner(job);
}

function bytesOf(seed: number): Uint8Array {
  const bytes = new Uint8Array(512);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (seed * 31 + i * 7) % 251;
  return bytes;
}

let seed = 0;

/** A project from before project folders: a row with no folder. */
async function legacyProject(name: string): Promise<Project> {
  const project = await Project.insertNew({ user_id: USER, name });
  if (!project) throw new Error("insert failed");
  return project;
}

/** An asset from before project folders: a row plus a stored object, aged. */
async function legacyAsset(projectId: string, name: string): Promise<Asset> {
  const bytes = bytesOf(++seed);
  const asset = await Asset.create<Asset>({
    user_id: USER,
    project_id: projectId,
    parent_id: null,
    name,
    content_type: PNG,
    size: bytes.byteLength
  });
  await store.store(getAssetStorageKey(USER, asset.id, PNG), bytes, PNG);
  await getPortableDb()
    .update(assets)
    .set({ updated_at: "2024-01-01T00:00:00.000Z" });
  return asset;
}

/** A workflow from before project folders: a row whose file was never written. */
async function legacyWorkflow(projectId: string, name: string): Promise<Workflow> {
  setWorkflowFileSync(null);
  try {
    return await Workflow.create<Workflow>({
      user_id: USER,
      project_id: projectId,
      name,
      graph: { nodes: [], edges: [] }
    });
  } finally {
    setWorkflowFileSync(documentFileSync(workflowFileAdapter));
  }
}

/** A workspace row from before project folders, with a real directory. */
async function legacyWorkspace(
  projectId: string,
  name: string,
  createdAt: string
): Promise<Workspace> {
  const path = join(root, "old", name);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "notes.txt"), name);
  return Workspace.create<Workspace>({
    user_id: USER,
    project_id: projectId,
    name,
    path,
    is_default: false,
    created_at: createdAt
  });
}

async function moved(asset: Asset): Promise<boolean> {
  const row = await Asset.find(USER, asset.id);
  return Boolean(row?.workspace_path);
}

async function storedState(): Promise<Record<string, unknown> | null> {
  const row = await Setting.find(USER, PROJECT_FOLDER_MIGRATION_SETTING);
  return row ? (JSON.parse(row.value) as Record<string, unknown>) : null;
}

/** Store a state as another process left it. */
async function storeState(changes: Record<string, unknown>): Promise<void> {
  await Setting.upsert({
    userId: USER,
    key: PROJECT_FOLDER_MIGRATION_SETTING,
    value: JSON.stringify({ ...(await storedState()), ...changes })
  });
}

/** A process id that no process on this machine has. */
async function deadPid(): Promise<number> {
  for (let pid = 4_000_000; ; pid++) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return pid;
    }
  }
}

/** Let a run that a transition started in the background begin and end. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await runner.idle(USER);
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason
  );
  if (!(error instanceof ProjectFolderMigrationError)) {
    throw new Error(`expected a refusal, got ${String(error)}`);
  }
  return error.code;
}

/** Confirm and wait for the run to finish. */
async function confirmAndRun(location?: string): Promise<void> {
  await showMigrationPlan(USER, location);
  await confirmMigration(USER, { location, runner });
  await runner.idle(USER);
}

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "project-folder-migration-"));
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", "local");
  vi.stubEnv("NODETOOL_PROJECT_MIGRATION", "");
  vi.stubEnv("PROJECTS_DIR", join(root, "NodeTool"));
  vi.stubEnv("NODETOOL_WORKSPACES_DIR", join(root, "workspaces"));
  clearSecretCache(USER, "PROJECTS_DIR");
  store = new FileStorageAdapter(join(root, "assets"), { externalPathLookup: null });
  vi.mocked(getAssetAdapter).mockReturnValue(store);
  newProcess();
});

afterEach(async () => {
  runner.stop();
  await runner.idle(USER);
  await job.idle();
  job.stop();
  await flushProjectReconciles();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  ModelObserver.clear();
  await rm(root, { recursive: true, force: true });
});

describe("before confirmation", () => {
  it("runs no bulk step at startup, and a run still gets its folder", async () => {
    const film = await legacyProject("Film");
    const other = await legacyProject("Other");
    const fox = await legacyAsset(film.id, "fox");
    const draft = await legacyWorkflow(other.id, "Draft");

    await startProjectFolderMigration(runner);
    await runner.idle(USER);
    // What the startup scheduling and opening a project ask the job to do.
    await scheduleLegacyAssetMoves(job, USER);
    expect(await job.prepare(film.id, USER)).toBeNull();
    await job.idle();

    expect(await storedState()).toBeNull();
    expect((await getMigrationStatus(USER, runner)).state).toBe("not_started");
    expect((await Project.findOwned(USER, film.id))?.workspace_id).toBeNull();
    expect((await Project.findOwned(USER, other.id))?.workspace_id).toBeNull();
    expect(await moved(fox)).toBe(false);
    expect((await Workflow.get<Workflow>(draft.id))?.file_path).toBeNull();
    expect(await bulkMigrationAllowed(USER)).toBe(false);

    // Lazy creation for a run is not gated.
    const resolution = await resolveProjectWorkspace(film.id, USER);
    expect(resolution.ok).toBe(true);
    expect((await Project.findOwned(USER, film.id))?.workspace_id).toBeTruthy();
    // The other project still waits.
    expect((await Project.findOwned(USER, other.id))?.workspace_id).toBeNull();
  });
});

describe("state machine", () => {
  it("moves through plan, confirm and done, and refuses the rest", async () => {
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    const draft = await legacyWorkflow(film.id, "Draft");

    expect(await refusal(confirmMigration(USER, { runner }))).toBe("invalid_transition");
    expect(await refusal(pauseMigration(USER, runner))).toBe("invalid_transition");
    expect(await refusal(resumeMigration(USER, runner))).toBe("invalid_transition");
    expect(await refusal(retryMigration(USER, runner, job))).toBe("invalid_transition");
    expect(await refusal(dismissMigration(USER, runner))).toBe("invalid_transition");

    const plan = await showMigrationPlan(USER);
    expect(plan).toMatchObject({ projects: 1, assets: 1, workflows: 1, timelines: 0 });
    expect(plan.location).toMatchObject({
      path: join(root, "NodeTool"),
      is_default: true,
      error: null
    });
    expect((await getMigrationStatus(USER, runner)).state).toBe("plan_shown");

    await confirmMigration(USER, { runner });
    expect(await refusal(confirmMigration(USER, { runner }))).toBe("invalid_transition");
    await runner.idle(USER);

    const status = await getMigrationStatus(USER, runner);
    expect(status).toMatchObject({
      applies: true,
      state: "done",
      location: join(root, "NodeTool"),
      progress: { done: 1, total: 1 },
      failure_count: 0,
      dismissed: false
    });
    expect(await moved(fox)).toBe(true);
    expect((await Workflow.get<Workflow>(draft.id))?.file_path).toBeTruthy();
    expect(await refusal(pauseMigration(USER, runner))).toBe("invalid_transition");
    expect(await refusal(retryMigration(USER, runner, job))).toBe("invalid_transition");

    expect((await dismissMigration(USER, runner)).dismissed).toBe(true);
  });

  it("names the workspaces a project with several will hide", async () => {
    const film = await legacyProject("Film");
    const newer = await legacyWorkspace(film.id, "Cuts", "2025-02-01T00:00:00.000Z");
    const older = await legacyWorkspace(film.id, "Footage", "2025-01-01T00:00:00.000Z");

    const plan = await buildMigrationPlan(USER);

    expect(plan.extra_workspaces).toEqual([
      {
        project_id: film.id,
        project_name: "Film",
        kept: { id: older.id, name: "Footage", path: older.path },
        hidden: [{ id: newer.id, name: "Cuts", path: newer.path }]
      }
    ]);
    await confirmAndRun();
    expect((await Project.findOwned(USER, film.id))?.workspace_id).toBe(older.id);
    // Nothing is deleted: the hidden workspace keeps its files.
    expect(await readdir(newer.path)).toContain("notes.txt");
  });
});

describe("location", () => {
  it("refuses a location that cannot hold project folders", async () => {
    await legacyProject("Film");
    await showMigrationPlan(USER);
    const file = join(root, "a-file");
    await writeFile(file, "x");

    for (const location of ["relative/dir", join(root, "missing"), file]) {
      expect((await buildMigrationPlan(USER, location)).location.error).toBeTruthy();
      expect(await refusal(confirmMigration(USER, { location, runner }))).toBe(
        "invalid_location"
      );
    }
    expect((await getMigrationStatus(USER, runner)).state).toBe("plan_shown");
    expect(await Setting.find(USER, "PROJECTS_DIR")).toBeNull();
  });

  it("stores a chosen location and creates the folders there", async () => {
    const film = await legacyProject("Film");
    const chosen = join(root, "Elsewhere");
    await mkdir(chosen);

    await confirmAndRun(chosen);

    expect((await Setting.find(USER, "PROJECTS_DIR"))?.value).toBe(chosen);
    expect((await getMigrationStatus(USER, runner)).location).toBe(chosen);
    const project = await Project.findOwned(USER, film.id);
    const folder = await Workspace.find(USER, project?.workspace_id ?? "");
    expect(folder?.path).toBe(join(chosen, "Film"));
    expect((await stat(join(chosen, "Film", ".nodetool", "project.json"))).isFile()).toBe(
      true
    );
  });

  it("keeps the location of the confirmation that won a race", async () => {
    const film = await legacyProject("Film");
    const first = join(root, "First");
    const second = join(root, "Second");
    await mkdir(first);
    await mkdir(second);
    await showMigrationPlan(USER);

    // The second confirmation reads `plan_shown`, then waits while it checks
    // its location. The first one commits in that time.
    let hold: (() => void) | null = null;
    let held: () => void = () => undefined;
    const reachedHold = new Promise<void>((resolve) => {
      held = resolve;
    });
    let holding = true;
    const find = Setting.find.bind(Setting);
    vi.spyOn(Setting, "find").mockImplementation(async (userId, key) => {
      if (holding && key === "PROJECTS_DIR") {
        holding = false;
        held();
        await new Promise<void>((resolve) => {
          hold = resolve;
        });
      }
      return find(userId, key);
    });

    const late = confirmMigration(USER, { location: second, runner, start: false });
    await reachedHold;
    await confirmMigration(USER, { location: first, runner, start: false });
    (hold as (() => void) | null)?.();

    expect(await refusal(late)).toBe("invalid_transition");
    expect((await getMigrationStatus(USER, runner)).location).toBe(first);
    expect((await Setting.find(USER, "PROJECTS_DIR"))?.value).toBe(first);

    await runner.start(USER);
    const project = await Project.findOwned(USER, film.id);
    const folder = await Workspace.find(USER, project?.workspace_id ?? "");
    expect(folder?.path).toBe(join(first, "Film"));
  });

  it("warns where macOS asks for permission", () => {
    const home = "/Users/ada";
    for (const path of [
      "/Users/ada/Documents/NodeTool",
      "/Users/ada/Desktop",
      "/Users/ada/Downloads/x",
      "/Users/ada/Library/Mobile Documents/com~apple~CloudDocs/NodeTool",
      "/Volumes/Archive/NodeTool"
    ]) {
      expect(locationNeedsPermission(path, "darwin", home)).toBe(true);
    }
    for (const path of ["/Users/ada/NodeTool", "/Users/ada/DocumentsArchive"]) {
      expect(locationNeedsPermission(path, "darwin", home)).toBe(false);
    }
    expect(locationNeedsPermission("/Users/ada/Documents", "linux", home)).toBe(false);
  });
});

describe("pause and resume", () => {
  it("stops after the asset being moved, stays paused across a restart, and resumes", async () => {
    const film = await legacyProject("Film");
    const first = await legacyAsset(film.id, "first");
    const second = await legacyAsset(film.id, "second");
    let pausedOnce = false;
    newProcess(async (step) => {
      if (step !== "legacy_deleted" || pausedOnce) return;
      pausedOnce = true;
      await pauseMigration(USER, runner);
    });

    await confirmAndRun();

    expect((await getMigrationStatus(USER, runner))).toMatchObject({
      state: "paused",
      progress: { done: 1, total: 2 }
    });
    expect([await moved(first), await moved(second)]).toEqual([true, false]);
    expect(await bulkMigrationAllowed(USER)).toBe(false);

    // A restarted server does not continue a paused migration.
    newProcess();
    await startProjectFolderMigration(runner);
    await runner.idle(USER);
    await scheduleLegacyAssetMoves(job, USER);
    await job.idle();
    expect(await moved(second)).toBe(false);

    await resumeMigration(USER, runner);
    await runner.idle(USER);
    // `resume` starts the run once the previous one is idle.
    await new Promise((resolve) => setImmediate(resolve));
    await runner.idle(USER);
    expect((await getMigrationStatus(USER, runner))).toMatchObject({
      state: "done",
      progress: { done: 2, total: 2 }
    });
    expect(await moved(second)).toBe(true);
  });

  it("continues a running migration after a stopped server", async () => {
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    await showMigrationPlan(USER);
    await confirmMigration(USER, { runner, start: false });
    const state = await storedState();
    // The server stopped after it marked the migration running.
    await Setting.upsert({
      userId: USER,
      key: PROJECT_FOLDER_MIGRATION_SETTING,
      value: JSON.stringify({ ...state, state: "running" })
    });

    newProcess();
    await startProjectFolderMigration(runner);
    await runner.idle(USER);

    expect((await getMigrationStatus(USER, runner)).state).toBe("done");
    expect(await moved(fox)).toBe(true);
  });
});

describe("failures", () => {
  it("lists an asset that could not move and moves it on retry", async () => {
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    const owl = await legacyAsset(film.id, "owl");
    // The file store refuses to read a file that has a second name.
    const alias = join(root, "alias-of-owl");
    await link(join(root, "assets", getAssetStorageKey(USER, owl.id, PNG)), alias);

    await confirmAndRun();

    const status = await getMigrationStatus(USER, runner);
    expect(status).toMatchObject({ state: "done", failure_count: 1 });
    expect(status.failures).toEqual([
      expect.objectContaining({
        kind: "asset",
        id: owl.id,
        name: "owl",
        project_id: film.id,
        project_name: "Film"
      })
    ]);
    expect([await moved(fox), await moved(owl)]).toEqual([true, false]);

    await rm(alias);
    await retryMigration(USER, runner, job);
    await new Promise((resolve) => setImmediate(resolve));
    await runner.idle(USER);

    expect(await getMigrationStatus(USER, runner)).toMatchObject({
      state: "done",
      failure_count: 0,
      failures: [],
      progress: { done: 2, total: 2 }
    });
    expect(await moved(owl)).toBe(true);
  });

  it("lists a project whose folder cannot be made", async () => {
    const film = await legacyProject("Film");
    // The default projects folder is a file, so no folder can be made in it.
    await writeFile(join(root, "NodeTool"), "not a directory");
    await showMigrationPlan(USER);
    expect(await refusal(confirmMigration(USER, { runner }))).toBe("invalid_location");

    await rm(join(root, "NodeTool"));
    await confirmMigration(USER, { runner, start: false });
    await writeFile(join(root, "NodeTool"), "not a directory");
    await runner.start(USER);

    const status = await getMigrationStatus(USER, runner);
    expect(status.state).toBe("done");
    expect(status.failures).toEqual([
      expect.objectContaining({ kind: "project", id: film.id, name: "Film" })
    ]);
  });
});

describe("document files", () => {
  it("lists a workflow whose folder is unavailable and writes it on retry", async () => {
    const film = await legacyProject("Film");
    expect((await resolveProjectWorkspace(film.id, USER)).ok).toBe(true);
    const folder = await Workspace.find(
      USER,
      (await Project.findOwned(USER, film.id))?.workspace_id ?? ""
    );
    if (!folder) throw new Error("no folder");
    const draft = await legacyWorkflow(film.id, "Draft");
    // The drive that holds the folder is disconnected.
    const away = `${folder.path}-away`;
    await rename(folder.path, away);

    await confirmAndRun();

    const status = await getMigrationStatus(USER, runner);
    expect(status).toMatchObject({ state: "done", failure_count: 1 });
    expect(status.failures).toEqual([
      expect.objectContaining({ kind: "project", id: film.id, name: "Film" })
    ]);
    expect((await Workflow.get<Workflow>(draft.id))?.file_path).toBeNull();

    await rename(away, folder.path);
    await retryMigration(USER, runner, job);
    await new Promise((resolve) => setImmediate(resolve));
    await runner.idle(USER);

    expect(await getMigrationStatus(USER, runner)).toMatchObject({
      state: "done",
      failure_count: 0
    });
    expect((await Workflow.get<Workflow>(draft.id))?.file_path).toBeTruthy();
  });
});

describe("where the migration does not ask", () => {
  it.each([
    ["cloud storage", { NODETOOL_WORKSPACE_STORAGE: "cloud" }],
    ["a production server", { NODETOOL_ENV: "production", NODETOOL_WORKSPACE_STORAGE: "local" }]
  ])("on %s it allows the bulk steps and refuses every transition", async (_name, env) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    await legacyProject("Film");

    expect(await getMigrationStatus(USER, runner)).toMatchObject({
      applies: false,
      state: "done"
    });
    expect(await bulkMigrationAllowed(USER)).toBe(true);
    expect(await refusal(showMigrationPlan(USER))).toBe("not_applicable");
    expect(await refusal(confirmMigration(USER, { runner }))).toBe("not_applicable");
    expect(await refusal(pauseMigration(USER, runner))).toBe("not_applicable");
  });

  it("records a fresh install as done without asking", async () => {
    expect(await getMigrationStatus(USER, runner)).toMatchObject({
      applies: false,
      state: "done"
    });
    expect(await storedState()).toMatchObject({ state: "done", nothing_to_move: true });
    expect(await bulkMigrationAllowed(USER)).toBe(true);
  });

  it("confirms at startup with NODETOOL_PROJECT_MIGRATION=auto", async () => {
    vi.stubEnv("NODETOOL_PROJECT_MIGRATION", "auto");
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");

    await startProjectFolderMigration(runner);
    await runner.idle(USER);

    expect(await storedState()).toMatchObject({ state: "done", confirmed_by: "auto" });
    expect(await moved(fox)).toBe(true);
  });
});

describe("nodetool projects migrate", () => {
  it("only reads the plan without --yes, and runs to the end with it", async () => {
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");

    // `migrate` without --yes.
    await buildMigrationPlan(USER);
    await getMigrationStatus(USER, runner);
    expect(await storedState()).toBeNull();
    expect(await moved(fox)).toBe(false);

    const status = await runMigrationToEnd(USER, { runner });

    expect(status).toMatchObject({ state: "done", progress: { done: 1, total: 1 } });
    expect(await moved(fox)).toBe(true);
    expect(await storedState()).toMatchObject({ confirmed_by: "user" });
  });

  it("continues a migration a server confirmed", async () => {
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    // The server confirmed and stopped before it moved anything.
    await showMigrationPlan(USER);
    await confirmMigration(USER, { runner, start: false });

    newProcess();
    const status = await runMigrationToEnd(USER, { runner });

    expect(status.state).toBe("done");
    expect(await moved(fox)).toBe(true);
  });

  it("waits for an asset changed just before it ran", async () => {
    newProcess(undefined, 300);
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    // The asset was edited a moment ago, so the mover defers it.
    await getPortableDb()
      .update(assets)
      .set({ updated_at: new Date().toISOString() });

    const status = await runMigrationToEnd(USER, { runner });

    expect(status).toMatchObject({ state: "done", progress: { done: 1, total: 1 } });
    expect(await moved(fox)).toBe(true);
  });

  it("stays unfinished while an asset still waits, and a second run continues", async () => {
    const film = await legacyProject("Film");
    // A client-direct upload that may still get its bytes.
    const upload = await Asset.create<Asset>({
      user_id: USER,
      project_id: film.id,
      parent_id: null,
      name: "upload",
      content_type: PNG,
      size: null
    });
    await store.store(getAssetStorageKey(USER, upload.id, PNG), bytesOf(++seed), PNG);

    const first = await runMigrationToEnd(USER, { runner });

    expect(first.state).not.toBe("done");
    expect(first.progress).toMatchObject({ done: 0, total: 1 });
    expect(await moved(upload)).toBe(false);

    // The upload window has passed.
    await getPortableDb()
      .update(assets)
      .set({ created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z" });
    newProcess();
    const second = await runMigrationToEnd(USER, { runner });

    expect(second).toMatchObject({ state: "done", progress: { done: 1, total: 1 } });
    expect(await moved(upload)).toBe(true);
  });

  it("refuses a migration the user paused", async () => {
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    await showMigrationPlan(USER);
    await confirmMigration(USER, { runner, start: false });
    await pauseMigration(USER, runner);

    expect(await refusal(runMigrationToEnd(USER, { runner }))).toBe("invalid_transition");
    expect(await moved(fox)).toBe(false);
    expect((await storedState())?.state).toBe("paused");
  });
});

describe("failures across runs", () => {
  it("keeps listing an asset that failed before a pause and resume", async () => {
    const film = await legacyProject("Film");
    // The move takes the oldest asset first: fox fails, then owl moves.
    const fox = await legacyAsset(film.id, "fox");
    const owl = await legacyAsset(film.id, "owl");
    await link(join(root, "assets", getAssetStorageKey(USER, fox.id, PNG)), join(root, "alias"));
    newProcess(async (step, assetId) => {
      if (step === "legacy_deleted" && assetId === owl.id) await pauseMigration(USER, runner);
    });
    await confirmAndRun();
    expect((await getMigrationStatus(USER, runner)).failure_count).toBe(1);

    // Resumed within the time a failed asset waits before its next try.
    await resumeMigration(USER, runner);
    await settle();

    const status = await getMigrationStatus(USER, runner);
    expect(status).toMatchObject({ state: "done", failure_count: 1 });
    expect(status.failures).toEqual([expect.objectContaining({ id: fox.id })]);
    expect([await moved(fox), await moved(owl)]).toEqual([false, true]);
  });

  it("lists a project once when its folder and its assets both fail", async () => {
    const film = await legacyProject("Film");
    await legacyAsset(film.id, "fox");
    await showMigrationPlan(USER);
    await confirmMigration(USER, { runner, start: false });
    await writeFile(join(root, "NodeTool"), "not a directory");
    await runner.start(USER);

    const status = await getMigrationStatus(USER, runner);
    expect(status.failures.filter((failure) => failure.id === film.id)).toHaveLength(1);
    expect(status.failure_count).toBe(status.failures.length);
  });
});

describe("previews", () => {
  it("reads the status without confirming under NODETOOL_PROJECT_MIGRATION=auto", async () => {
    vi.stubEnv("NODETOOL_PROJECT_MIGRATION", "auto");
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");

    expect((await readMigrationStatus(USER, runner)).state).toBe("not_started");
    await runner.idle(USER);

    expect(await storedState()).toBeNull();
    expect(await moved(fox)).toBe(false);
  });

  it("reads a fresh install as done without writing", async () => {
    expect(await readMigrationStatus(USER, runner)).toMatchObject({
      applies: false,
      state: "done"
    });
    expect(await storedState()).toBeNull();
  });
});

describe("work another process left", () => {
  it("continues a migration whose process stopped", async () => {
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    await showMigrationPlan(USER);
    await confirmMigration(USER, { runner, start: false });
    // A `nodetool projects migrate` process claimed the run and was killed.
    await storeState({
      state: "running",
      run_id: "gone",
      owner_pid: await deadPid(),
      owner_host: hostname(),
      heartbeat_at: new Date().toISOString()
    });

    await getMigrationStatus(USER, runner);
    await runner.idle(USER);

    expect((await getMigrationStatus(USER, runner)).state).toBe("done");
    expect(await moved(fox)).toBe(true);
  });

  it("continues a migration a stopped command left waiting", async () => {
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    await showMigrationPlan(USER);
    await confirmMigration(USER, { runner, start: false });
    await storeState({
      state: "confirmed",
      owner_pid: await deadPid(),
      owner_host: hostname(),
      heartbeat_at: new Date().toISOString()
    });

    await getMigrationStatus(USER, runner);
    await runner.idle(USER);

    expect(await moved(fox)).toBe(true);
  });

  it("leaves a migration that a live process runs", async () => {
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    await showMigrationPlan(USER);
    await confirmMigration(USER, { runner, start: false });
    await storeState({
      state: "running",
      run_id: "elsewhere",
      owner_pid: process.ppid,
      owner_host: hostname(),
      heartbeat_at: new Date().toISOString()
    });

    await getMigrationStatus(USER, runner);
    await runner.idle(USER);

    expect((await storedState())?.state).toBe("running");
    expect(await moved(fox)).toBe(false);
  });

  it("takes over a run whose heartbeat stopped", async () => {
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    await showMigrationPlan(USER);
    await confirmMigration(USER, { runner, start: false });
    await storeState({
      state: "running",
      run_id: "elsewhere",
      owner_pid: process.ppid,
      owner_host: "another-machine",
      heartbeat_at: "2024-01-01T00:00:00.000Z"
    });

    await getMigrationStatus(USER, runner);
    await runner.idle(USER);

    expect(await moved(fox)).toBe(true);
  });

  it("runs a migration once when a second process starts it during the run", async () => {
    const film = await legacyProject("Film");
    await legacyAsset(film.id, "fox");
    await legacyAsset(film.id, "owl");
    await showMigrationPlan(USER);
    await confirmMigration(USER, { runner, start: false });
    let secondSteps = 0;
    const second = new ProjectFolderMigrationRunner(
      new ProjectAssetMoveJob({
        settleMs: 0,
        gate: bulkMigrationAllowed,
        afterStep: async () => {
          secondSteps++;
        }
      })
    );
    const list = Asset.listProjectsAwaitingFolderMove.bind(Asset);
    let started = false;
    vi.spyOn(Asset, "listProjectsAwaitingFolderMove").mockImplementation(async (...args) => {
      if (!started) {
        // The first run is in its asset phase when the other process starts.
        started = true;
        await second.start(USER);
      }
      return list(...args);
    });

    await runner.start(USER);

    expect(secondSteps).toBe(0);
    expect((await storedState())?.state).toBe("done");
    second.stop();
  });
});

describe("a run that throws", () => {
  it("returns the migration to confirmed and starts again", async () => {
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    runner = new ProjectFolderMigrationRunner(job, { errorRestartMs: 10 });
    const list = Asset.listProjectsAwaitingFolderMove.bind(Asset);
    let thrown = false;
    vi.spyOn(Asset, "listProjectsAwaitingFolderMove").mockImplementation(async (...args) => {
      if (!thrown) {
        thrown = true;
        throw new Error("database is locked");
      }
      return list(...args);
    });

    await confirmAndRun();
    expect((await storedState())?.state).toBe("confirmed");

    await new Promise((resolve) => setTimeout(resolve, 50));
    await runner.idle(USER);
    expect((await storedState())?.state).toBe("done");
    expect(await moved(fox)).toBe(true);
  });
});

describe("auto confirmation", () => {
  it("confirms a user who only read the plan", async () => {
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    await showMigrationPlan(USER);
    vi.stubEnv("NODETOOL_PROJECT_MIGRATION", "auto");

    await startProjectFolderMigration(runner);
    await runner.idle(USER);

    expect((await storedState())?.state).toBe("done");
    expect(await moved(fox)).toBe(true);
  });
});

describe("nothing to move", () => {
  it("refuses every transition with not_applicable", async () => {
    expect(await refusal(showMigrationPlan(USER))).toBe("not_applicable");
    expect(await refusal(confirmMigration(USER, { runner }))).toBe("not_applicable");
    expect(await refusal(pauseMigration(USER, runner))).toBe("not_applicable");
    expect(await refusal(resumeMigration(USER, runner))).toBe("not_applicable");
    expect(await refusal(retryMigration(USER, runner, job))).toBe("not_applicable");
    expect(await refusal(dismissMigration(USER, runner))).toBe("not_applicable");
    expect((await getMigrationStatus(USER, runner)).applies).toBe(false);
  });
});

describe("command line", () => {
  it("refuses a location once the migration is confirmed", async () => {
    await legacyProject("Film");
    const chosen = join(root, "Elsewhere");
    await mkdir(chosen);
    await showMigrationPlan(USER);
    await confirmMigration(USER, { runner, start: false });

    expect(await refusal(runMigrationToEnd(USER, { location: chosen, runner }))).toBe(
      "invalid_transition"
    );
  });

  it("stores a chosen location without a trailing separator", async () => {
    await legacyProject("Film");
    const chosen = join(root, "Elsewhere");
    await mkdir(chosen);

    await confirmAndRun(`${chosen}/`);

    expect((await Setting.find(USER, "PROJECTS_DIR"))?.value).toBe(chosen);
  });

  it("reports failures where the migration does not ask", async () => {
    vi.stubEnv("NODETOOL_ENV", "production");
    const film = await legacyProject("Film");
    const fox = await legacyAsset(film.id, "fox");
    await link(join(root, "assets", getAssetStorageKey(USER, fox.id, PNG)), join(root, "alias"));

    const status = await runMigrationToEnd(USER, { runner });

    expect(status).toMatchObject({ applies: false, failure_count: 1 });
  });
});

describe("macOS permission", () => {
  it("ignores letter case", () => {
    expect(locationNeedsPermission("/Users/ada/documents/x", "darwin", "/Users/ada")).toBe(true);
    expect(locationNeedsPermission("/volumes/Archive", "darwin", "/Users/ada")).toBe(true);
  });
});
