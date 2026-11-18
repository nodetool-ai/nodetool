/**
 * A native game created by an agent keeps its own workspace row. The project's
 * folder (`projects.workspace_id`) belongs to the project, so the game's
 * sources never land in it.
 */

import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { Game, ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { z } from "zod";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const USER = "folder-owner";
const PROJECT = "folder-project";
const reply = z.object({ game: z.object({ id: z.string() }) });

let root: string;
let savedWorkspacesDir: string | undefined;

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "game-project-folder-"));
  savedWorkspacesDir = process.env["NODETOOL_WORKSPACES_DIR"];
  process.env["NODETOOL_WORKSPACES_DIR"] = join(root, "managed");
});

afterEach(async () => {
  ModelObserver.clear();
  if (savedWorkspacesDir === undefined) delete process.env["NODETOOL_WORKSPACES_DIR"];
  else process.env["NODETOOL_WORKSPACES_DIR"] = savedWorkspacesDir;
  await rm(root, { recursive: true, force: true });
});

it("creates a game in its own workspace, not in the project folder", async () => {
  await Project.insertNew({ id: PROJECT, user_id: USER, name: "Folder" });
  const folderDir = join(root, "Folder");
  await mkdir(folderDir);
  const folder = await Workspace.create<Workspace>({
    user_id: USER,
    project_id: PROJECT,
    name: "Folder",
    path: folderDir
  });
  await Project.claimWorkspace(USER, PROJECT, folder.id);
  const agent = createCapabilityRun({
    context: new ProcessingContext({ jobId: "game-folder", userId: USER }),
    gate: UNGATED
  });

  const created = reply.parse(
    await agent.invoke("create_native_game", { project_id: PROJECT, name: "Room" })
  );

  const game = await Game.findOwned(USER, created.game.id);
  const gameRow = await Workspace.find(USER, game?.workspace_id ?? "");
  expect(gameRow?.id).not.toBe(folder.id);
  expect(gameRow?.isManaged()).toBe(true);
  expect(await readdir(folderDir)).toEqual([]);
});
