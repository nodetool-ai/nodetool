/**
 * projects router: what delete and archive do to the project folder (PRD D12,
 * T7, US13).
 *
 * A folder NodeTool created goes to the trash, or its key prefix is deleted
 * in object storage. A folder the user brought keeps every file except
 * `.nodetool/`. Workspace rows that are not the project folder go as rows and
 * their files stay. Archive touches nothing.
 */

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import {
  getManagedWorkspaceDir,
  managedWorkspaceKey
} from "@nodetool-ai/config";
import {
  initTestDb,
  ModelObserver,
  Project,
  Workspace
} from "@nodetool-ai/models";
import {
  ensureProjectFolder,
  nodetoolDirFromRow,
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "@nodetool-ai/execution/service";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCallerFor = createCallerFactory(appRouter);

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const caller = (userId = "user-1") => createCallerFor(makeCtx(userId));

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false
  );

/** Every file under `dir`, as a relative `/` path mapped to its sha256. */
async function digests(dir: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  for (const entry of await readdir(dir, {
    recursive: true,
    withFileTypes: true
  })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    found[relative(dir, path).split(sep).join("/")] = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  }
  return found;
}

/** Bytes that are not valid UTF-8, so a text round trip would change them. */
const BINARY = new Uint8Array([0, 255, 254, 128, 10, 13, 0, 1]);

describe("projects router: delete and archive", () => {
  const ENV_KEYS = [
    "PROJECTS_DIR",
    "NODETOOL_WORKSPACE_STORAGE",
    "NODETOOL_ENV",
    "XDG_DATA_HOME",
    "HOME"
  ] as const;
  let saved: Record<string, string | undefined> = {};
  let root = "";
  let projectsDir = "";
  let cloud: InMemoryStorageAdapter | null = null;

  function useCloud(): InMemoryStorageAdapter {
    process.env["NODETOOL_WORKSPACE_STORAGE"] = "cloud";
    cloud = new InMemoryStorageAdapter();
    setWorkspaceCloudStorage(cloud);
    return cloud;
  }

  /** Put the OS trash out of this process's reach on every platform. */
  async function loseOsTrash(): Promise<void> {
    const file = join(root, "not-a-directory");
    await writeFile(file, "");
    // Linux: the home trash cannot be created under a file.
    process.env["XDG_DATA_HOME"] = join(file, "data");
    // macOS: a home directory with no `.Trash` in it.
    process.env["HOME"] = await mkdtemp(join(root, "home-"));
  }

  async function folderRow(projectId: string): Promise<Workspace> {
    const project = await Project.get<Project>(projectId);
    const row = await Workspace.find("user-1", project?.workspace_id ?? "");
    if (!row) throw new Error("project has no folder");
    return row;
  }

  function filesOf(row: Workspace) {
    const workspace = workspaceFromRow(row);
    if (!workspace) throw new Error("no workspace for row");
    return workspace;
  }

  /** A project over a folder the user brought, as `openFolder` records one. */
  async function adoptFolder(
    name: string,
    path: string,
    origin: "adopted" | "created" = "adopted"
  ): Promise<{ project: Project; row: Workspace }> {
    // Personal and the default workspace come first, as on a real install.
    // Otherwise this row is the user's first and is promoted to the default.
    await caller().projects.list({});
    const project = await Project.insertNew({ user_id: "user-1", name });
    if (!project) throw new Error("could not create the project");
    const row = await Workspace.create<Workspace>({
      user_id: "user-1",
      project_id: project.id,
      name,
      path,
      origin
    });
    // Claims the row as the project's folder and writes the manifest.
    const folder = await ensureProjectFolder(project);
    expect(folder.id).toBe(row.id);
    expect(folder.is_default).toBe(false);
    return { project, row };
  }

  beforeEach(async () => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    root = await mkdtemp(join(tmpdir(), "nodetool-project-delete-"));
    projectsDir = join(root, "NodeTool");
    process.env["PROJECTS_DIR"] = projectsDir;
    // The trash of this test, so nothing lands in the real one.
    process.env["XDG_DATA_HOME"] = join(root, "xdg-data");
    initTestDb();
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    setWorkspaceCloudStorage(null);
    cloud = null;
    ModelObserver.clear();
    await rm(root, { recursive: true, force: true });
  });

  it("moves a created folder to the trash and leaves nothing at its path", async () => {
    const project = await caller().projects.create({ name: "My Film" });
    const path = join(projectsDir, "My Film");
    await mkdir(join(path, "footage"));
    await writeFile(join(path, "footage", "take.bin"), BINARY);
    const before = await digests(path);
    expect(Object.keys(before).sort()).toEqual([
      ".nodetool/project.json",
      "footage/take.bin"
    ]);

    const result = await caller().projects.delete({ id: project.id });

    expect(await exists(path)).toBe(false);
    // Windows has no trash a server process can reach, so the folder goes to
    // the projects directory's own.
    expect(result.folder.action).toBe(
      process.platform === "win32" ? "moved_aside" : "trashed"
    );
    const trashed = result.folder.path;
    if (!trashed) throw new Error("the result names no trash location");
    expect(trashed).not.toBe(path);
    // The whole folder is in the trash, manifest included, byte for byte.
    expect(await digests(trashed)).toEqual(before);
    expect(await Workspace.listByProject("user-1", project.id)).toEqual([]);
    expect((await caller().projects.list({})).map((p) => p.name)).toEqual([
      "Personal"
    ]);
  });

  it.runIf(process.platform === "linux")(
    "records the folder's original path in the home trash",
    async () => {
      const project = await caller().projects.create({ name: "My Film" });
      const path = join(projectsDir, "My Film");

      const result = await caller().projects.delete({ id: project.id });

      const trash = join(root, "xdg-data", "Trash");
      expect(result.folder).toEqual({
        action: "trashed",
        path: join(trash, "files", "My Film")
      });
      const info = (
        await readFile(join(trash, "info", "My Film.trashinfo"), "utf8")
      ).split("\n");
      expect(info[0]).toBe("[Trash Info]");
      // "My Film" has a space, which the record percent-encodes.
      expect(info[1]).toBe(
        `Path=${path.split("/").map(encodeURIComponent).join("/")}`
      );
      expect(info[1]).toContain("My%20Film");
      expect(info[2]).toMatch(/^DeletionDate=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/);
    }
  );

  it.runIf(process.platform === "linux")(
    "keeps an earlier trashed folder of the same name",
    async () => {
      const trash = join(root, "xdg-data", "Trash", "files");
      for (const content of ["first", "second"]) {
        const project = await caller().projects.create({ name: "My Film" });
        await writeFile(join(projectsDir, "My Film", "cut.txt"), content);
        await caller().projects.delete({ id: project.id });
      }

      expect(await readFile(join(trash, "My Film", "cut.txt"), "utf8")).toBe(
        "first"
      );
      expect(await readFile(join(trash, "My Film 2", "cut.txt"), "utf8")).toBe(
        "second"
      );
    }
  );

  it("moves a created folder to <PROJECTS_DIR>/.trash when the OS trash is out of reach, and says so", async () => {
    const project = await caller().projects.create({ name: "My Film" });
    const path = join(projectsDir, "My Film");
    await writeFile(join(path, "cut.bin"), BINARY);
    const before = await digests(path);
    await loseOsTrash();

    const result = await caller().projects.delete({ id: project.id });

    expect(result.folder.action).toBe("moved_aside");
    const moved = result.folder.path ?? "";
    expect(moved).toMatch(/My Film-\d{8}-\d{6}$/);
    expect(relative(join(projectsDir, ".trash"), moved)).not.toContain("..");
    expect(await exists(path)).toBe(false);
    expect(await digests(moved)).toEqual(before);
  });

  it("leaves a created folder untouched when it cannot be moved to either trash", async () => {
    const project = await caller().projects.create({ name: "My Film" });
    const path = join(projectsDir, "My Film");
    await writeFile(join(path, "cut.bin"), BINARY);
    const before = await digests(path);
    await loseOsTrash();
    // A file where the projects directory's trash would be created.
    await writeFile(join(projectsDir, ".trash"), "");

    const result = await caller().projects.delete({ id: project.id });

    expect(result.folder).toEqual({ action: "trash_failed", path });
    expect(await digests(path)).toEqual(before);
    // The records are gone all the same.
    expect((await caller().projects.list({})).map((p) => p.name)).toEqual([
      "Personal"
    ]);
  });

  it("keeps every file of an adopted folder byte-identical and removes .nodetool/ (local)", async () => {
    const brought = join(root, "brought");
    await mkdir(join(brought, "footage", "day 1"), { recursive: true });
    await writeFile(join(brought, "footage", "day 1", "take.bin"), BINARY);
    await writeFile(join(brought, "notes.md"), "keep me\r\n");
    await writeFile(join(brought, ".hidden"), "dotfile");
    const before = await digests(brought);
    const { project } = await adoptFolder("Brought", brought);
    expect(await exists(join(brought, ".nodetool", "project.json"))).toBe(true);
    expect(
      (await caller().projects.get({ id: project.id })).project.folder
    ).toMatchObject({ origin: "adopted", on_delete: "keep" });

    const result = await caller().projects.delete({ id: project.id });

    expect(result.folder).toEqual({ action: "kept", path: brought });
    expect(await exists(join(brought, ".nodetool"))).toBe(false);
    expect(Object.keys(before).length).toBe(3);
    expect(await digests(brought)).toEqual(before);
    expect(await Workspace.listByProject("user-1", project.id)).toEqual([]);
  });

  it("keeps every file of an adopted folder byte-identical and removes .nodetool/ (cloud)", async () => {
    const storage = useCloud();
    // A managed key, where NodeTool creates folders itself, so only the
    // row's origin says this one was brought.
    const prefix = `${managedWorkspaceKey("user-1")}/projects/${"a".repeat(64)}`;
    const { project, row } = await adoptFolder("Brought", prefix);
    expect(row.isManaged()).toBe(true);
    await filesOf(row).write("footage/take.bin", BINARY);
    await filesOf(row).write("notes.md", "keep me\r\n");
    const keysBefore = (await storage.list(`${prefix}/`)).entries
      .map((entry) => entry.key)
      .sort();
    expect(keysBefore).toEqual([
      `${prefix}/.nodetool/project.json`,
      `${prefix}/footage/take.bin`,
      `${prefix}/notes.md`
    ]);

    const result = await caller().projects.delete({ id: project.id });

    expect(result.folder).toEqual({ action: "kept", path: null });
    expect(
      (await storage.list(`${prefix}/`)).entries.map((entry) => entry.key).sort()
    ).toEqual([`${prefix}/footage/take.bin`, `${prefix}/notes.md`]);
    expect(await filesOf(row).read("footage/take.bin")).toEqual(BINARY);
    expect(await filesOf(row).readText("notes.md")).toBe("keep me\r\n");
  });

  it("keeps an adopted folder that sits inside the projects directory", async () => {
    // Where NodeTool creates folders itself, so only the row's origin says
    // this one was brought.
    const brought = join(projectsDir, "Old Shoot");
    await mkdir(brought, { recursive: true });
    await writeFile(join(brought, "take.bin"), BINARY);
    const before = await digests(brought);
    const { project } = await adoptFolder("Old Shoot", brought);

    const result = await caller().projects.delete({ id: project.id });

    expect(result.folder).toEqual({ action: "kept", path: brought });
    expect(await digests(brought)).toEqual(before);
  });

  it("keeps a folder from before project folders whose origin is only the column default", async () => {
    // A workspace the user added by hand before project folders existed. The
    // migration gave it `origin = created`, and it became the project's folder.
    const added = join(root, "my-own-footage");
    await mkdir(added, { recursive: true });
    await writeFile(join(added, "take.bin"), BINARY);
    const before = await digests(added);
    const { project } = await adoptFolder("Legacy", added, "created");

    const result = await caller().projects.delete({ id: project.id });

    expect(result.folder).toEqual({ action: "kept", path: added });
    expect(await digests(added)).toEqual(before);
  });

  it("never moves the user's default workspace, whatever project it is filed under", async () => {
    const project = await caller().projects.create({ name: "Promoted" });
    const path = join(projectsDir, "Promoted");
    await writeFile(join(path, "take.bin"), BINARY);
    const before = await digests(path);
    const row = await folderRow(project.id);
    await Workspace.unsetOtherDefaults("user-1");
    row.is_default = true;
    await row.save();

    const result = await caller().projects.delete({ id: project.id });

    expect(result.folder).toEqual({ action: "kept", path });
    expect(await digests(path)).toEqual({ "take.bin": before["take.bin"] });
  });

  it("never moves the managed root, which holds every managed folder", async () => {
    const managedRoot = getManagedWorkspaceDir("user-1");
    const nested = join(managedRoot, "projects", "b".repeat(64));
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "game.json"), "{}");
    const { project } = await adoptFolder("Rooted", managedRoot, "created");

    const result = await caller().projects.delete({ id: project.id });

    expect(result.folder).toEqual({ action: "kept", path: managedRoot });
    expect(await readFile(join(nested, "game.json"), "utf8")).toBe("{}");
  });

  it("deletes every object under a cloud project's prefix and no other project's", async () => {
    const storage = useCloud();
    const doomed = await caller().projects.create({ name: "Doomed" });
    const other = await caller().projects.create({ name: "Other" });
    const doomedRow = await folderRow(doomed.id);
    const otherRow = await folderRow(other.id);
    await filesOf(doomedRow).write("Generated/fox.bin", BINARY);
    await filesOf(doomedRow).write("footage/a/b/take.txt", "gone");
    await filesOf(otherRow).write("footage/take.txt", "stays");
    expect(
      (await storage.list(`${doomedRow.path}/`)).entries.length
    ).toBeGreaterThanOrEqual(3);

    const result = await caller().projects.delete({ id: doomed.id });

    expect(result.folder).toEqual({ action: "removed", path: null });
    expect((await storage.list(`${doomedRow.path}/`)).entries).toEqual([]);
    expect(await filesOf(otherRow).readText("footage/take.txt")).toBe("stays");
    expect(await nodetoolDirFromRow(otherRow)?.exists("project.json")).toBe(
      true
    );
  });

  it("refuses to delete Personal and leaves its folder alone", async () => {
    const personal = (await caller().projects.list({})).find(
      (p) => p.isPersonal
    );
    const path = personal?.folder?.path;
    if (!personal || !path) throw new Error("Personal has no folder");
    await writeFile(join(path, "draft.md"), "kept");
    const before = await digests(path);

    await expect(
      caller().projects.delete({ id: personal.id })
    ).rejects.toThrow(/Personal cannot be deleted/i);

    expect(await digests(path)).toEqual(before);
    expect(await exists(join(path, ".nodetool", "project.json"))).toBe(true);
    expect((await caller().projects.list({})).map((p) => p.id)).toContain(
      personal.id
    );
  });

  it.each(["local", "cloud"] as const)(
    "removes a workspace row that is not the project folder and keeps its files (%s)",
    async (mode) => {
      if (mode === "cloud") useCloud();
      const project = await caller().projects.create({ name: "Doomed" });
      const extra = await Workspace.create<Workspace>({
        user_id: "user-1",
        project_id: project.id,
        name: "extra",
        path:
          mode === "cloud"
            ? "workspaces/user-1/extra"
            : await mkdtemp(join(root, "extra-"))
      });
      await filesOf(extra).write("scratch.txt", "untouched");

      await caller().projects.delete({ id: project.id });

      expect(await Workspace.find("user-1", extra.id)).toBeNull();
      expect(await filesOf(extra).readText("scratch.txt")).toBe("untouched");
    }
  );

  it.each(["local", "cloud"] as const)(
    "leaves the folder in place when the project is archived (%s)",
    async (mode) => {
      if (mode === "cloud") useCloud();
      const project = await caller().projects.create({ name: "Shelved" });
      const row = await folderRow(project.id);
      await filesOf(row).write("footage/take.txt", "kept");

      const archived = await caller().projects.archive({ id: project.id });

      expect(archived.archivedAt).toEqual(expect.any(String));
      expect(archived.folder).toEqual(project.folder);
      expect(await filesOf(row).readText("footage/take.txt")).toBe("kept");
      expect(await nodetoolDirFromRow(row)?.exists("project.json")).toBe(true);
      expect((await folderRow(project.id)).path).toBe(row.path);
    }
  );

  it("names no server path in the delete result of a production server", async () => {
    process.env["NODETOOL_ENV"] = "production";
    process.env["NODETOOL_WORKSPACE_STORAGE"] = "local";
    const project = await caller().projects.create({ name: "Hosted" });
    const path = join(projectsDir, "Hosted");
    expect(await exists(path)).toBe(true);

    const result = await caller().projects.delete({ id: project.id });

    expect(result.folder.path).toBeNull();
    expect(["trashed", "moved_aside"]).toContain(result.folder.action);
    expect(await exists(path)).toBe(false);
  });
});
