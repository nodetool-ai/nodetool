/**
 * projects.openFolder and projects.relocate against temporary directories.
 *
 * Opening a folder adopts it without moving a file. A folder that is, holds,
 * or sits inside another project's folder is refused by real path, so a
 * symlink cannot slip one project folder inside another. Locate repoints a
 * project whose folder moved. See docs/project-folders/prd.md (US2, US11).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  initTestDb,
  ModelObserver,
  Project,
  Workspace
} from "@nodetool-ai/models";
import {
  resolveProjectWorkspace,
  setWorkspaceCloudStorage
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

const ENV_KEYS = [
  "PROJECTS_DIR",
  "NODETOOL_ENV",
  "NODETOOL_LOCAL_FILE_ROOTS",
  "NODETOOL_WORKSPACE_STORAGE"
] as const;

/** Every file under `dir` with its bytes and modification time. */
async function snapshot(
  dir: string
): Promise<Record<string, { bytes: string; mtimeMs: number }>> {
  const out: Record<string, { bytes: string; mtimeMs: number }> = {};
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    out[relative(dir, path)] = {
      bytes: (await readFile(path)).toString("base64"),
      mtimeMs: (await stat(path)).mtimeMs
    };
  }
  return out;
}

async function readManifest(folder: string): Promise<unknown> {
  return JSON.parse(
    await readFile(join(folder, ".nodetool", "project.json"), "utf8")
  ) as unknown;
}

async function writeManifest(
  folder: string,
  manifest: { id: string; name: string }
): Promise<void> {
  await mkdir(join(folder, ".nodetool"), { recursive: true });
  await writeFile(
    join(folder, ".nodetool", "project.json"),
    JSON.stringify({ format: "nodetool.project", version: 1, ...manifest })
  );
}

describe("projects.openFolder and projects.relocate", () => {
  let saved: Record<string, string | undefined> = {};
  let root = "";

  beforeEach(async () => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    // The real path, so expectations match on macOS where /var is a link.
    root = await realpath(
      await mkdtemp(join(tmpdir(), "nodetool-open-folder-"))
    );
    process.env["PROJECTS_DIR"] = join(root, "NodeTool");
    process.env["NODETOOL_LOCAL_FILE_ROOTS"] = root;
    delete process.env["NODETOOL_ENV"];
    delete process.env["NODETOOL_WORKSPACE_STORAGE"];
    initTestDb();
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    setWorkspaceCloudStorage(null);
    ModelObserver.clear();
    await rm(root, { recursive: true, force: true });
  });

  it("adopts a folder with files and changes nothing but the new manifest", async () => {
    const folder = join(root, "Footage Film");
    await mkdir(join(folder, "footage", "day 1"), { recursive: true });
    await writeFile(join(folder, "notes.md"), "# Shot list");
    await writeFile(join(folder, "footage", "day 1", "a.wav"), "RIFF....");
    const before = await snapshot(folder);

    const project = await caller().projects.openFolder({ path: folder });

    expect(project.name).toBe("Footage Film");
    expect(project.folder).toEqual({
      path: folder,
      origin: "adopted",
      is_accessible: true
    });
    const after = await snapshot(folder);
    const manifestPath = join(".nodetool", "project.json");
    expect(Object.keys(after).sort()).toEqual(
      [...Object.keys(before), manifestPath].sort()
    );
    for (const [path, file] of Object.entries(before)) {
      expect(after[path]).toEqual(file);
    }
    expect(await readManifest(folder)).toEqual({
      format: "nodetool.project",
      version: 1,
      id: project.id,
      name: "Footage Film"
    });
    const row = await Workspace.find(
      "user-1",
      (await Project.get<Project>(project.id))?.workspace_id ?? ""
    );
    expect(row?.origin).toBe("adopted");
    expect(row?.project_id).toBe(project.id);
  });

  it("takes the name the caller gives", async () => {
    const folder = join(root, "raw");
    await mkdir(folder);

    const project = await caller().projects.openFolder({
      path: folder,
      name: "My Film"
    });

    expect(project.name).toBe("My Film");
  });

  it("refuses a folder inside, equal to, or holding another project's folder, naming it", async () => {
    const existing = await caller().projects.create({ name: "Aurora" });
    const existingPath = existing.folder?.path ?? "";
    await mkdir(join(existingPath, "renders"));

    await expect(
      caller().projects.openFolder({ path: join(existingPath, "renders") })
    ).rejects.toThrow('This folder is inside the folder of project "Aurora"');
    await expect(
      caller().projects.openFolder({ path: existingPath })
    ).rejects.toThrow(/project "Aurora"/);
    await expect(
      caller().projects.openFolder({ path: join(root, "NodeTool") })
    ).rejects.toThrow('This folder contains the folder of project "Aurora"');
    expect(
      (await caller().projects.list({})).map((p) => p.name).sort()
    ).toEqual(["Aurora", "Personal"]);
  });

  it("refuses a symlinked path that resolves into another project's folder", async () => {
    const existing = await caller().projects.create({ name: "Aurora" });
    const existingPath = existing.folder?.path ?? "";
    await mkdir(join(existingPath, "renders"));
    const link = join(root, "shortcut");
    await symlink(join(existingPath, "renders"), link, "dir");

    await expect(
      caller().projects.openFolder({ path: link })
    ).rejects.toThrow('This folder is inside the folder of project "Aurora"');
    await expect(
      caller().projects.openFolder({ path: join(root, "shortcut") })
    ).rejects.toThrow(/Aurora/);
  });

  it("refuses a path outside the allowed roots and a missing folder", async () => {
    const outside = await mkdtemp(join(tmpdir(), "nodetool-outside-"));
    try {
      await expect(
        caller().projects.openFolder({ path: outside })
      ).rejects.toThrow(/outside the allowed roots/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
    await expect(
      caller().projects.openFolder({ path: join(root, "missing") })
    ).rejects.toThrow("Folder not found");
  });

  it("refuses openFolder and relocate on a production server", async () => {
    const project = await caller().projects.create({ name: "Aurora" });
    const folder = join(root, "adopt me");
    await mkdir(folder);
    process.env["NODETOOL_ENV"] = "production";

    await expect(
      caller().projects.openFolder({ path: folder })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller().projects.relocate({ project_id: project.id, path: folder })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await readdir(folder)).toEqual([]);
  });

  it("restores a project under the id of a manifest unknown on this install", async () => {
    const folder = join(root, "copied");
    await mkdir(folder);
    await writeManifest(folder, { id: "abc123", name: "Travelled" });
    const before = await snapshot(folder);

    const project = await caller().projects.openFolder({ path: folder });

    expect(project.id).toBe("abc123");
    expect(project.name).toBe("Travelled");
    expect(project.folder?.origin).toBe("adopted");
    expect(await snapshot(folder)).toEqual(before);
  });

  it("relocates the project a manifest names when its recorded folder is gone", async () => {
    const created = await caller().projects.create({ name: "Aurora" });
    const oldPath = created.folder?.path ?? "";
    const moved = join(root, "Moved Aurora");
    await rename(oldPath, moved);

    const opened = await caller().projects.openFolder({ path: moved });

    expect(opened.id).toBe(created.id);
    expect(opened.folder).toEqual({
      path: moved,
      origin: "created",
      is_accessible: true
    });
    expect(
      (await caller().projects.list({})).map((p) => p.name).sort()
    ).toEqual(["Aurora", "Personal"]);
  });

  it("refuses a copy of a project whose folder still exists", async () => {
    const created = await caller().projects.create({ name: "Aurora" });
    const copy = join(root, "Aurora copy");
    await mkdir(copy);
    await writeManifest(copy, { id: created.id, name: "Aurora" });

    await expect(
      caller().projects.openFolder({ path: copy })
    ).rejects.toThrow('This folder is a copy of project "Aurora"');
  });

  it("refuses a folder whose manifest belongs to another user's project", async () => {
    const foreign = await caller("user-2").projects.create({ name: "Secret" });
    const folder = join(root, "found");
    await mkdir(folder);
    await writeManifest(folder, { id: foreign.id, name: "Secret" });

    const failure = caller().projects.openFolder({ path: folder });
    await expect(failure).rejects.toThrow(
      "This folder belongs to a project that cannot be opened here"
    );
    await expect(failure).rejects.not.toThrow(/Secret/);
  });

  it("refuses a folder whose manifest is not a project file, and leaves it alone", async () => {
    const folder = join(root, "odd");
    await mkdir(join(folder, ".nodetool"), { recursive: true });
    await writeFile(join(folder, ".nodetool", "project.json"), "{ not json");

    await expect(
      caller().projects.openFolder({ path: folder })
    ).rejects.toThrow(/not a NodeTool project file/);
    expect(
      await readFile(join(folder, ".nodetool", "project.json"), "utf8")
    ).toBe("{ not json");
  });

  it("shows a renamed folder as not found, and Locate makes runs start again", async () => {
    const created = await caller().projects.create({ name: "Aurora" });
    const oldPath = created.folder?.path ?? "";
    await writeFile(join(oldPath, "draft.md"), "kept");
    const renamed = join(root, "Aurora renamed");
    await rename(oldPath, renamed);

    const lost = await caller().projects.get({ id: created.id });
    expect(lost.project.folder?.is_accessible).toBe(false);
    const refused = await resolveProjectWorkspace(created.id, "user-1");
    expect(refused.ok).toBe(false);

    const located = await caller().projects.relocate({
      project_id: created.id,
      path: renamed
    });

    expect(located.folder).toEqual({
      path: renamed,
      origin: "created",
      is_accessible: true
    });
    const resolved = await resolveProjectWorkspace(created.id, "user-1");
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(await resolved.workspace.readText("draft.md")).toBe("kept");
    }
  });

  it("writes the manifest into a located folder that has none", async () => {
    const created = await caller().projects.create({ name: "Aurora" });
    const elsewhere = join(root, "elsewhere");
    await mkdir(elsewhere);

    await caller().projects.relocate({
      project_id: created.id,
      path: elsewhere
    });

    expect(await readManifest(elsewhere)).toEqual({
      format: "nodetool.project",
      version: 1,
      id: created.id,
      name: "Aurora"
    });
  });

  it("refuses to locate a project at a folder that names another project", async () => {
    const aurora = await caller().projects.create({ name: "Aurora" });
    const borealis = await caller().projects.create({ name: "Borealis" });
    const borealisPath = borealis.folder?.path ?? "";
    const loose = join(root, "loose copy");
    await mkdir(loose);
    await writeManifest(loose, { id: borealis.id, name: "Borealis" });

    await expect(
      caller().projects.relocate({ project_id: aurora.id, path: loose })
    ).rejects.toThrow('This folder belongs to project "Borealis"');
    await expect(
      caller().projects.relocate({
        project_id: aurora.id,
        path: join(borealisPath, "..")
      })
    ).rejects.toThrow(/contains the folder of project/);
  });

  it("hides another user's project from relocate", async () => {
    const foreign = await caller("user-2").projects.create({ name: "Secret" });
    const folder = join(root, "mine");
    await mkdir(folder);

    await expect(
      caller().projects.relocate({ project_id: foreign.id, path: folder })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("ignores cloud folders, which have no host path, when comparing", async () => {
    process.env["NODETOOL_WORKSPACE_STORAGE"] = "cloud";
    setWorkspaceCloudStorage(new InMemoryStorageAdapter());
    const cloud = await caller().projects.create({ name: "Cloud" });
    expect(cloud.folder?.path).toBeNull();
    const folder = join(root, "local");
    await mkdir(folder);

    const opened = await caller().projects.openFolder({ path: folder });

    expect(opened.folder?.path).toBe(folder);
    expect(opened.folder?.origin).toBe("adopted");
  });
});
