/**
 * The migration into project folders as the user confirms and follows it
 * (docs/project-folders/migration-ux.md, issue #7634).
 *
 * Every case runs against a real SQLite database, real project folders under
 * a temporary `PROJECTS_DIR`, and a file asset store. A new runner and job
 * stand for a restarted process.
 */
import { link, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
function newProcess(afterStep?: LegacyAssetMoveOptions["afterStep"]): void {
  job = new ProjectAssetMoveJob({ settleMs: 0, afterStep, gate: bulkMigrationAllowed });
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
