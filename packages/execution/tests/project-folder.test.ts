/**
 * Project folders: `ensureProjectFolder` and the startup migration.
 *
 * Every case runs twice, once with workspaces in local directories and once
 * with workspaces in object storage, because a project folder is either.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Game,
  Project,
  Workspace as WorkspaceRow,
  clearSecretCache,
  getPortableDb,
  initTestDb,
  projects,
  workspaces
} from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  PROJECT_MANIFEST_PATH,
  ensureProjectFolder,
  migrateProjectFolders,
  projectFolderName
} from "../src/service/project-folder.js";
import {
  nodetoolDirFromRow,
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "../src/service/workflow-workspace.js";

const USER = "user-1";

interface Mode {
  name: "local" | "cloud";
  /** A path for a workspace row created outside the code under test. */
  folderPath(label: string): string;
}

const ENV_KEYS = [
  "NODETOOL_WORKSPACE_STORAGE",
  "NODETOOL_WORKSPACES_DIR",
  "PROJECTS_DIR"
] as const;

let root = "";
let savedEnv: Record<string, string | undefined> = {};

const MODES: Mode[] = [
  { name: "local", folderPath: (label) => join(root, "elsewhere", label) },
  { name: "cloud", folderPath: (label) => `workspaces/${USER}/elsewhere/${label}` }
];

/** Point new project folders at `path`. `getSecret` caches the setting. */
function setProjectsDir(path: string): void {
  process.env["PROJECTS_DIR"] = path;
  clearSecretCache(USER, "PROJECTS_DIR");
}

function rowFolder(row: WorkspaceRow) {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return workspace;
}

/**
 * The folder's reserved `.nodetool/` directory. The folder's own workspace
 * refuses every path in it, so the manifest is read the way NodeTool writes it.
 */
function nodetoolDir(row: WorkspaceRow) {
  const workspace = nodetoolDirFromRow(row);
  if (!workspace) throw new Error("no .nodetool directory for row");
  return workspace;
}

/** The manifest's path inside the reserved directory. */
const MANIFEST_FILE = PROJECT_MANIFEST_PATH.slice(".nodetool/".length);

async function manifestOf(row: WorkspaceRow): Promise<unknown> {
  const text = await nodetoolDir(row).readText(MANIFEST_FILE);
  return text === null ? null : JSON.parse(text);
}

async function insertProject(
  name: string,
  fields: Record<string, unknown> = {}
): Promise<Project> {
  const project = await Project.insertNew({ user_id: USER, name, ...fields });
  if (!project) throw new Error("insert failed");
  return project;
}

/** A workspace row with one file in it, made the way a pre-folder install did. */
async function legacyWorkspace(
  mode: Mode,
  projectId: string,
  label: string,
  createdAt: string
): Promise<WorkspaceRow> {
  const row = (await WorkspaceRow.create({
    user_id: USER,
    project_id: projectId,
    name: label,
    path: mode.folderPath(label),
    created_at: createdAt
  })) as WorkspaceRow;
  // `create` stamps `updated_at` only, so the creation time sticks.
  await rowFolder(row).write("notes.txt", `${label} notes`);
  return row;
}

async function snapshot(): Promise<unknown> {
  const db = getPortableDb();
  return {
    projects: await db.select().from(projects).orderBy(projects.id),
    workspaces: await db.select().from(workspaces).orderBy(workspaces.id)
  };
}

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  root = await mkdtemp(join(tmpdir(), "nodetool-project-folder-"));
  setProjectsDir(join(root, "NodeTool"));
  process.env["NODETOOL_WORKSPACES_DIR"] = join(root, "workspaces");
  initTestDb();
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  clearSecretCache(USER, "PROJECTS_DIR");
  setWorkspaceCloudStorage(null);
  await rm(root, { recursive: true, force: true });
});

describe("projectFolderName", () => {
  it("keeps a plain name and makes any name a valid folder", () => {
    expect(projectFolderName("My Film")).toBe("My Film");
    expect(projectFolderName("a/b\\c:d")).toBe("a b c d");
    expect(projectFolderName("..hidden")).toBe("hidden");
    expect(projectFolderName("trailing. ")).toBe("trailing");
    expect(projectFolderName("CON")).toBe("CON project");
    expect(projectFolderName("///")).toBe("Untitled project");
    expect(projectFolderName("x".repeat(300))).toHaveLength(100);
  });
});

describe.each(MODES)("project folders ($name)", (mode) => {
  beforeEach(() => {
    process.env["NODETOOL_WORKSPACE_STORAGE"] = mode.name;
    setWorkspaceCloudStorage(
      mode.name === "cloud" ? new InMemoryStorageAdapter() : null
    );
  });

  it("creates a folder with a manifest naming the project", async () => {
    const project = await insertProject("My Film");

    const row = await ensureProjectFolder(project);

    expect(row.origin).toBe("created");
    expect(row.project_id).toBe(project.id);
    expect((await Project.get<Project>(project.id))?.workspace_id).toBe(row.id);
    expect(await manifestOf(row)).toEqual({
      format: "nodetool.project",
      version: 1,
      id: project.id,
      name: "My Film"
    });
    if (mode.name === "local") {
      expect(row.path).toBe(join(root, "NodeTool", "My Film"));
      expect(row.isVirtual()).toBe(false);
    } else {
      const segment = createHash("sha256").update(project.id).digest("hex");
      expect(row.path).toBe(`workspaces/${USER}/projects/${segment}`);
      expect(row.isVirtual()).toBe(true);
    }
  });

  it("gives every project a folder, and a second run changes nothing", async () => {
    const first = await insertProject("Aurora");
    const second = await insertProject("Borealis");
    const personal = await Project.ensurePersonal(USER);

    const report = await migrateProjectFolders();

    expect(report).toEqual({ checked: 3, assigned: 3, failed: 0 });
    for (const project of [first, second, personal]) {
      expect((await Project.get<Project>(project.id))?.workspace_id).toBeTruthy();
    }
    const before = await snapshot();
    expect(await migrateProjectFolders()).toEqual({
      checked: 0,
      assigned: 0,
      failed: 0
    });
    expect(await snapshot()).toEqual(before);
  });

  it("keeps the older of two workspaces and leaves the other alone", async () => {
    const project = await insertProject("Two folders");
    const newer = await legacyWorkspace(mode, project.id, "newer", "2026-02-01T00:00:00.000Z");
    const older = await legacyWorkspace(mode, project.id, "older", "2026-01-01T00:00:00.000Z");
    const newerBefore = await WorkspaceRow.find(USER, newer.id);

    await migrateProjectFolders();

    const migrated = await Project.get<Project>(project.id);
    expect(migrated?.workspace_id).toBe(older.id);
    expect(await manifestOf(older)).toMatchObject({ id: project.id });
    expect(await rowFolder(older).readText("notes.txt")).toBe("older notes");
    // The other row, and its files, are exactly as they were.
    expect(await WorkspaceRow.find(USER, newer.id)).toEqual(newerBefore);
    expect(await rowFolder(newer).list("", { recursive: true })).toEqual([
      expect.objectContaining({ path: "notes.txt" })
    ]);
    expect(await WorkspaceRow.listByProject(USER, project.id)).toHaveLength(2);
  });

  it("never chooses a workspace a game uses", async () => {
    const project = await insertProject("Game project");
    const gameRow = await legacyWorkspace(mode, project.id, "game", "2026-01-01T00:00:00.000Z");
    await Game.insertNew({
      id: "a".repeat(32),
      userId: USER,
      projectId: project.id,
      workspaceId: gameRow.id,
      name: "Game",
      revision: "b".repeat(32)
    });
    const plain = await legacyWorkspace(mode, project.id, "plain", "2026-03-01T00:00:00.000Z");

    await migrateProjectFolders();

    expect((await Project.get<Project>(project.id))?.workspace_id).toBe(plain.id);
    expect(await nodetoolDir(gameRow).exists(MANIFEST_FILE)).toBe(false);
  });

  it("creates a folder when a game's workspace is the only one", async () => {
    const project = await insertProject("Only a game");
    const gameRow = await legacyWorkspace(mode, project.id, "game", "2026-01-01T00:00:00.000Z");
    await Game.insertNew({
      id: "c".repeat(32),
      userId: USER,
      projectId: project.id,
      workspaceId: gameRow.id,
      name: "Game",
      revision: "d".repeat(32)
    });

    await migrateProjectFolders();

    const folderId = (await Project.get<Project>(project.id))?.workspace_id;
    expect(folderId).toBeTruthy();
    expect(folderId).not.toBe(gameRow.id);
    expect((await WorkspaceRow.find(USER, folderId ?? ""))?.origin).toBe("created");
  });

  it("makes Personal's folder the previous default workspace, files and all", async () => {
    const defaultRow = await WorkspaceRow.ensureDefault(USER);
    await rowFolder(defaultRow).write("draft.md", "kept");
    const personal = await Project.ensurePersonal(USER);

    await migrateProjectFolders();

    const migrated = await Project.get<Project>(personal.id);
    expect(migrated?.workspace_id).toBe(defaultRow.id);
    const row = await WorkspaceRow.find(USER, defaultRow.id);
    expect(row?.path).toBe(defaultRow.path);
    expect(row?.project_id).toBe(personal.id);
    expect(await rowFolder(defaultRow).readText("draft.md")).toBe("kept");
    expect(await manifestOf(defaultRow)).toMatchObject({ id: personal.id, name: "Personal" });
  });

  it("never gives Personal another project's or a game's workspace", async () => {
    const other = await insertProject("Games");
    // The user's only workspace belongs to another project and a game uses it.
    // `ensureDefault` promotes it to the default workspace.
    const gameRow = await legacyWorkspace(mode, other.id, "game", "2026-01-01T00:00:00.000Z");
    await Game.insertNew({
      id: "e".repeat(32),
      userId: USER,
      projectId: other.id,
      workspaceId: gameRow.id,
      name: "Game",
      revision: "f".repeat(32)
    });
    const personal = await Project.ensurePersonal(USER);

    const folder = await ensureProjectFolder(personal);

    expect(folder.id).not.toBe(gameRow.id);
    expect(folder.project_id).toBe(personal.id);
    expect((await WorkspaceRow.find(USER, gameRow.id))?.project_id).toBe(other.id);
  });

  it("keeps a manifest that is already there", async () => {
    const project = await insertProject("Has manifest");
    const row = await legacyWorkspace(mode, project.id, "existing", "2026-01-01T00:00:00.000Z");
    await nodetoolDir(row).write(MANIFEST_FILE, "{\"kept\":true}");

    await migrateProjectFolders();

    expect(await manifestOf(row)).toEqual({ kept: true });
  });

  it("replaces a folder whose row is gone", async () => {
    const project = await insertProject("Dangling", { workspace_id: "missing-row" });

    const row = await ensureProjectFolder(project);

    expect(row.id).not.toBe("missing-row");
    expect((await Project.get<Project>(project.id))?.workspace_id).toBe(row.id);
  });
});

describe("cloud project folders", () => {
  it("leaves no row when the folder cannot be written", async () => {
    process.env["NODETOOL_WORKSPACE_STORAGE"] = "cloud";
    // No object storage: the row is created, then the manifest write fails.
    setWorkspaceCloudStorage(null);
    const project = await insertProject("No storage");

    await expect(ensureProjectFolder(project)).rejects.toThrow(/storage/);

    expect(await WorkspaceRow.listByProject(USER, project.id)).toEqual([]);
    expect((await Project.get<Project>(project.id))?.workspace_id).toBeNull();
  });
});

describe("local project folders", () => {
  beforeEach(() => {
    process.env["NODETOOL_WORKSPACE_STORAGE"] = "local";
  });

  it("adds a numeric suffix when the name is taken", async () => {
    const first = await ensureProjectFolder(await insertProject("My Film"));
    const second = await ensureProjectFolder(await insertProject("My Film"));
    const third = await ensureProjectFolder(await insertProject("My Film"));

    expect(first.path).toBe(join(root, "NodeTool", "My Film"));
    expect(second.path).toBe(join(root, "NodeTool", "My Film 2"));
    expect(third.path).toBe(join(root, "NodeTool", "My Film 3"));
  });

  it("leaves no row or directory when the folder cannot be created", async () => {
    // A regular file where the parent directory should be.
    const blocker = join(root, "blocker");
    await rowFolder(
      new WorkspaceRow({ user_id: USER, path: root })
    ).write("blocker", "not a directory");
    setProjectsDir(join(blocker, "projects"));
    const project = await insertProject("Unwritable");

    await expect(ensureProjectFolder(project)).rejects.toThrow();

    expect(await WorkspaceRow.listByProject(USER, project.id)).toEqual([]);
    expect((await Project.get<Project>(project.id))?.workspace_id).toBeNull();
  });

  it("counts a project whose folder cannot be created as failed and goes on", async () => {
    const blocked = await insertProject("Blocked");
    await rowFolder(new WorkspaceRow({ user_id: USER, path: root })).write(
      "blocker",
      "not a directory"
    );
    setProjectsDir(join(root, "blocker", "projects"));
    const report = await migrateProjectFolders();

    expect(report).toEqual({ checked: 1, assigned: 0, failed: 1 });
    expect((await Project.get<Project>(blocked.id))?.workspace_id).toBeNull();
  });
});
