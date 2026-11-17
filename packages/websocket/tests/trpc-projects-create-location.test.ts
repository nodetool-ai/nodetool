/**
 * projects.create with a `location`: the new project's folder is created in a
 * directory the caller chose instead of the projects folder.
 *
 * The location may lie outside the projects folder. It is refused when it is
 * or lies inside another project's folder, compared by real path, and when it
 * is not an existing writable directory the caller may reach. A refused
 * location leaves no project behind.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initTestDb, ModelObserver } from "@nodetool-ai/models";
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

describe("projects.create with a location", () => {
  let saved: Record<string, string | undefined> = {};
  let root = "";

  beforeEach(async () => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    // The real path, so expectations match on macOS where /var is a link.
    root = await realpath(
      await mkdtemp(join(tmpdir(), "nodetool-create-location-"))
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
    ModelObserver.clear();
    await rm(root, { recursive: true, force: true });
  });

  const projectNames = async (): Promise<string[]> =>
    (await caller().projects.list({})).map((p) => p.name).sort();

  it("creates the folder in a location outside the projects folder", async () => {
    const location = join(root, "Work", "Clients");
    await mkdir(location, { recursive: true });

    const project = await caller().projects.create({ name: "Aurora", location });

    const folder = join(location, "Aurora");
    expect(project.folder).toMatchObject({
      path: folder,
      origin: "created",
      is_accessible: true
    });
    expect(
      JSON.parse(
        await readFile(join(folder, ".nodetool", "project.json"), "utf8")
      )
    ).toMatchObject({ id: project.id, name: "Aurora" });
    const projectsDir = await readdir(join(root, "NodeTool")).catch(() => []);
    expect(projectsDir).not.toContain("Aurora");
  });

  it("adds a suffix when the name is taken in the location", async () => {
    const location = join(root, "Elsewhere");
    await mkdir(join(location, "Aurora"), { recursive: true });

    const project = await caller().projects.create({ name: "Aurora", location });

    expect(project.folder?.path).toBe(join(location, "Aurora 2"));
  });

  it("accepts the projects folder itself, which holds other project folders", async () => {
    await caller().projects.create({ name: "First" });

    const project = await caller().projects.create({
      name: "Second",
      location: join(root, "NodeTool")
    });

    expect(project.folder?.path).toBe(join(root, "NodeTool", "Second"));
  });

  it("refuses a location inside another project's folder and keeps no project", async () => {
    const existing = await caller().projects.create({ name: "Aurora" });
    const existingPath = existing.folder?.path ?? "";
    await mkdir(join(existingPath, "renders"));

    await expect(
      caller().projects.create({ name: "Inner", location: existingPath })
    ).rejects.toThrow('This location is inside the folder of project "Aurora"');
    await expect(
      caller().projects.create({
        name: "Inner",
        location: join(existingPath, "renders")
      })
    ).rejects.toThrow('This location is inside the folder of project "Aurora"');

    const link = join(root, "shortcut");
    await symlink(join(existingPath, "renders"), link, "dir");
    await expect(
      caller().projects.create({ name: "Inner", location: link })
    ).rejects.toThrow(/project "Aurora"/);

    expect(await projectNames()).toEqual(["Aurora", "Personal"]);
    expect(await readdir(join(existingPath, "renders"))).toEqual([]);
  });

  it("refuses a missing location and one outside the allowed roots", async () => {
    await expect(
      caller().projects.create({ name: "Aurora", location: join(root, "missing") })
    ).rejects.toThrow("Folder not found");

    const outside = await mkdtemp(join(tmpdir(), "nodetool-outside-"));
    try {
      await expect(
        caller().projects.create({ name: "Aurora", location: outside })
      ).rejects.toThrow(/outside the allowed roots/);
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
    expect(await projectNames()).toEqual(["Personal"]);
  });

  it("refuses a location on a production server", async () => {
    const location = join(root, "Elsewhere");
    await mkdir(location);
    process.env["NODETOOL_ENV"] = "production";

    await expect(
      caller().projects.create({ name: "Aurora", location })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await readdir(location)).toEqual([]);
  });
});
