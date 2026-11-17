/**
 * Runs work in the folder of their own project (PRD D3, T2, US4).
 *
 * Every case runs twice, once with project folders in local directories and
 * once in object storage, because a project folder is either.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  getManagedWorkspaceDir,
  managedWorkspaceKey
} from "@nodetool-ai/config";
import {
  Game,
  Project,
  Workflow,
  Workspace as WorkspaceRow,
  clearSecretCache,
  getPortableDb,
  initTestDb,
  jobs
} from "@nodetool-ai/models";
import { BaseNode, NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  WorkspaceReservedPathError,
  getProjectFolderResolver,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  ensurePersonalProject,
  ensureProjectFolder
} from "../src/service/project-folder.js";
import {
  folderKeyInside,
  nodetoolDirFromRow,
  resolveProjectWorkspace,
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "../src/service/workflow-workspace.js";
import { runWorkflow } from "../src/service/workflow-run.js";

const USER = "user-1";
const OUTPUT = "run-output.txt";
const ENV_KEYS = [
  "NODETOOL_WORKSPACE_STORAGE",
  "NODETOOL_WORKSPACES_DIR",
  "PROJECTS_DIR"
] as const;

let root = "";
let savedEnv: Record<string, string | undefined> = {};

/** Released by a test to let {@link WriteOutput} write its file. */
let gate: Promise<void> = Promise.resolve();
/** Called by {@link WriteOutput} once it is running. */
let entered: () => void = () => {};

/** Writes one file into the run's workspace, after the test's gate opens. */
class WriteOutput extends BaseNode {
  static readonly nodeType = "test.folder.WriteOutput";
  static readonly title = "Write output";
  static readonly description = "Writes a file into the run's workspace";
  static readonly metadataOutputTypes = { output: "str" };

  async process(context: ProcessingContext): Promise<Record<string, unknown>> {
    entered();
    await gate;
    if (!context.workspace) throw new Error("The run has no workspace");
    await context.workspace.write(OUTPUT, "written by the run");
    return { output: "ok" };
  }
}

function registry(): NodeRegistry {
  const nodes = new NodeRegistry();
  nodes.register(WriteOutput);
  return nodes;
}

async function projectWithFolder(
  name: string
): Promise<{ project: Project; folder: WorkspaceRow }> {
  const project = await Project.insertNew({ user_id: USER, name });
  if (!project) throw new Error("insert failed");
  return { project, folder: await ensureProjectFolder(project) };
}

async function workflowIn(projectId: string): Promise<Workflow> {
  return (await Workflow.create({
    user_id: USER,
    name: "Writes a file",
    project_id: projectId,
    graph: {
      nodes: [{ id: "write", type: WriteOutput.nodeType, properties: {} }],
      edges: []
    }
  })) as Workflow;
}

async function outputIn(row: WorkspaceRow): Promise<string | null> {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return workspace.readText(OUTPUT);
}

async function jobCount(): Promise<number> {
  const rows = await getPortableDb()
    .select()
    .from(jobs)
    .where(eq(jobs.user_id, USER));
  return rows.length;
}

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  root = await mkdtemp(join(tmpdir(), "nodetool-project-workspace-"));
  process.env["PROJECTS_DIR"] = join(root, "NodeTool");
  clearSecretCache(USER, "PROJECTS_DIR");
  process.env["NODETOOL_WORKSPACES_DIR"] = join(root, "workspaces");
  initTestDb();
  gate = Promise.resolve();
  entered = () => {};
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

describe.each(["local", "cloud"] as const)("project folders for runs (%s)", (mode) => {
  beforeEach(() => {
    process.env["NODETOOL_WORKSPACE_STORAGE"] = mode;
    setWorkspaceCloudStorage(
      mode === "cloud" ? new InMemoryStorageAdapter() : null
    );
  });

  it("resolves the folder named by the project's workspace_id", async () => {
    const { project, folder } = await projectWithFolder("Film A");
    await projectWithFolder("Film B");

    const resolved = await resolveProjectWorkspace(project.id, USER);
    if (!resolved.ok) throw new Error(resolved.reason);
    await resolved.workspace.write("notes.md", "in A");

    expect(resolved.projectId).toBe(project.id);
    const own = workspaceFromRow(folder);
    expect(await own?.readText("notes.md")).toBe("in A");
    expect(await own?.list("")).toEqual([
      expect.objectContaining({ path: "notes.md" })
    ]);
  });

  it("gives a run with no project of its own the Personal folder", async () => {
    const personal = await ensurePersonalProject(USER);
    const folder = await WorkspaceRow.find(USER, personal.workspace_id ?? "");
    if (!folder) throw new Error("Personal has no folder");

    for (const projectId of [null, "default", personal.id]) {
      const resolved = await resolveProjectWorkspace(projectId, USER);
      expect(resolved).toMatchObject({ ok: true, projectId: personal.id });
    }
  });

  it("gives Personal its folder when it is created after startup", async () => {
    // Whatever first needs Personal creates it: no list, no migration ran.
    const personal = await Project.ensurePersonal(USER);

    expect(personal.workspace_id).toBeTruthy();
    const resolved = await resolveProjectWorkspace(null, USER);
    expect(resolved).toMatchObject({ ok: true, projectId: personal.id });
  });

  it("refuses a project that has no folder where asked to create none", async () => {
    const project = await Project.insertNew({ user_id: USER, name: "Bare" });
    if (!project) throw new Error("insert failed");

    expect(
      await resolveProjectWorkspace(project.id, USER, { createMissing: false })
    ).toEqual({
      ok: false,
      projectId: project.id,
      reason: 'Project folder not found: project "Bare" has no folder'
    });
    // The resolver the asset and document services use creates none either.
    expect(await getProjectFolderResolver()?.(project.id, USER)).toMatchObject({
      ok: false
    });
    expect(await WorkspaceRow.listByProject(USER, project.id)).toEqual([]);
  });

  it("gives a run in a project from before project folders that project's folder", async () => {
    // The migration of every project waits for the user's confirmation
    // (docs/project-folders/migration-ux.md). A run must not.
    const project = await Project.insertNew({ user_id: USER, name: "Bare" });
    if (!project) throw new Error("insert failed");

    const resolved = await resolveProjectWorkspace(project.id, USER);

    expect(resolved).toMatchObject({ ok: true, projectId: project.id });
    const rows = await WorkspaceRow.listByProject(USER, project.id);
    expect(rows).toHaveLength(1);
    expect((await Project.get<Project>(project.id))?.workspace_id).toBe(rows[0].id);
  });

  it("keeps .nodetool/ out of the run's reach and open to NodeTool's writer", async () => {
    const { project, folder } = await projectWithFolder("Reserved");
    const resolved = await resolveProjectWorkspace(project.id, USER);
    if (!resolved.ok) throw new Error(resolved.reason);
    const run = resolved.workspace;

    await expect(run.read(".nodetool/project.json")).rejects.toThrow(
      WorkspaceReservedPathError
    );
    await expect(run.write(".nodetool/project.json", "{}")).rejects.toThrow(
      WorkspaceReservedPathError
    );
    expect(await run.list("", { recursive: true })).toEqual([]);

    // The manifest writer from PF01 still wrote it, through its own entry point.
    const manifest = await nodetoolDirFromRow(folder)?.readText("project.json");
    expect(JSON.parse(manifest ?? "null")).toMatchObject({
      format: "nodetool.project",
      id: project.id
    });
  });

  it("names the folders of other projects and of games inside Personal's folder", async () => {
    const personal = await ensurePersonalProject(USER);
    const managed =
      mode === "cloud" ? managedWorkspaceKey(USER) : getManagedWorkspaceDir(USER);
    // Where cloud projects, imported projects and games keep their folder.
    const managedFolder = (segment: string): string =>
      mode === "cloud"
        ? `${managed}/projects/${segment}`
        : join(managed, "projects", segment);
    const row = (path: string, projectId: string): Promise<WorkspaceRow> =>
      WorkspaceRow.create<WorkspaceRow>({
        user_id: USER,
        project_id: projectId,
        name: "Inner",
        path,
        origin: "created"
      });
    const project = await Project.insertNew({ user_id: USER, name: "Imported" });
    if (!project) throw new Error("insert failed");
    const projectDir = "a".repeat(64);
    const projectFolder = await row(managedFolder(projectDir), project.id);
    await Project.claimWorkspace(USER, project.id, projectFolder.id);
    const gameDir = "b".repeat(64);
    const gameFolder = await row(managedFolder(gameDir), personal.id);
    await Game.create({
      user_id: USER,
      project_id: personal.id,
      workspace_id: gameFolder.id,
      name: "Tetris",
      current_revision: "r1"
    });
    // A workspace row that is nobody's folder names no folder of its own.
    const looseFolder = await row(managedFolder("c".repeat(64)), personal.id);
    // Each folder gets a file through its own workspace, as its owner writes.
    for (const folder of [projectFolder, gameFolder, looseFolder]) {
      await workspaceFromRow(folder)?.write("media/cover.png", "bytes");
    }

    const resolved = await resolveProjectWorkspace(personal.id, USER);
    if (!resolved.ok) throw new Error(resolved.reason);
    const outer = resolved.workspace;

    // Neither folder has a .nodetool/ directory here: the rows name them.
    expect(await outer.isNestedFolder(`projects/${projectDir}`)).toBe(true);
    expect(await outer.isNestedFolder(`projects/${gameDir}`)).toBe(true);
    expect(await outer.isNestedFolder(`projects/${"c".repeat(64)}`)).toBe(false);
    expect(await outer.isNestedFolder("projects")).toBe(false);
    // A run in Personal reaches no file of the project or of the game.
    for (const dir of [projectDir, gameDir]) {
      await expect(
        outer.read(`projects/${dir}/media/cover.png`)
      ).rejects.toThrow(WorkspaceReservedPathError);
      await expect(
        outer.write(`projects/${dir}/media/cover.png`, "overwritten")
      ).rejects.toThrow(WorkspaceReservedPathError);
    }
    expect(
      (await outer.list("", { recursive: true })).map((entry) => entry.path)
    ).toEqual([`projects/${"c".repeat(64)}/media/cover.png`]);
    expect(await outer.deleteAll("projects")).toBe(1);
    for (const folder of [projectFolder, gameFolder]) {
      expect(await workspaceFromRow(folder)?.readText("media/cover.png")).toBe(
        "bytes"
      );
    }
    // The inner folder has no folder inside it, and is not inside itself.
    const inner = await resolveProjectWorkspace(project.id, USER);
    if (!inner.ok) throw new Error(inner.reason);
    expect(await inner.workspace.isNestedFolder("media")).toBe(false);
  });

  it("runs a workflow of project A in A's folder", async () => {
    const a = await projectWithFolder("Film A");
    const b = await projectWithFolder("Film B");
    const workflow = await workflowIn(a.project.id);

    const outcome = await runWorkflow({
      workflowId: workflow.id,
      userId: USER,
      environment: { registry: registry() }
    });

    expect(outcome.kind).toBe("payload");
    expect(await outputIn(a.folder)).toBe("written by the run");
    expect(await outputIn(b.folder)).toBeNull();
  });

  it("keeps writing to A when the workflow moves to B mid-run", async () => {
    const a = await projectWithFolder("Film A");
    const b = await projectWithFolder("Film B");
    const workflow = await workflowIn(a.project.id);
    let release: () => void = () => {};
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = new Promise<void>((resolve) => {
      entered = resolve;
    });

    const outcome = runWorkflow({
      workflowId: workflow.id,
      userId: USER,
      environment: { registry: registry() }
    });
    await running;
    workflow.project_id = b.project.id;
    await workflow.save();
    release();

    expect((await outcome).kind).toBe("payload");
    expect((await Workflow.find(USER, workflow.id))?.project_id).toBe(b.project.id);
    expect(await outputIn(a.folder)).toBe("written by the run");
    expect(await outputIn(b.folder)).toBeNull();
  });

  it("runs a workflow of a project from before project folders in a folder of its own", async () => {
    const project = await Project.insertNew({ user_id: USER, name: "Bare" });
    if (!project) throw new Error("insert failed");
    const personal = await ensurePersonalProject(USER);
    const personalFolder = await WorkspaceRow.find(USER, personal.workspace_id ?? "");
    const workflow = await workflowIn(project.id);

    const outcome = await runWorkflow({
      workflowId: workflow.id,
      userId: USER,
      environment: { registry: registry() }
    });

    expect(outcome.kind).toBe("payload");
    const [own] = await WorkspaceRow.listByProject(USER, project.id);
    expect(own && (await outputIn(own))).toBe("written by the run");
    // No other folder stands in for it.
    expect(personalFolder && (await outputIn(personalFolder))).toBeNull();
  });

});

describe("a run whose local project folder is missing", () => {
  beforeEach(() => {
    process.env["NODETOOL_WORKSPACE_STORAGE"] = "local";
  });

  it("refuses to start a run whose project has no folder and cannot get one", async () => {
    const project = await Project.insertNew({ user_id: USER, name: "Bare" });
    if (!project) throw new Error("insert failed");
    const personal = await ensurePersonalProject(USER);
    const personalFolder = await WorkspaceRow.find(USER, personal.workspace_id ?? "");
    const workflow = await workflowIn(project.id);
    // New project folders go in a directory that cannot exist.
    await writeFile(join(root, "blocker"), "not a directory");
    process.env["PROJECTS_DIR"] = join(root, "blocker", "projects");
    clearSecretCache(USER, "PROJECTS_DIR");

    const outcome = await runWorkflow({
      workflowId: workflow.id,
      userId: USER,
      environment: { registry: registry() }
    });

    expect(outcome).toMatchObject({ kind: "error", status: 409 });
    expect(outcome.kind === "error" && outcome.detail).toMatch(
      /^Project folder not found: /
    );
    expect(await jobCount()).toBe(0);
    expect(await WorkspaceRow.listByProject(USER, project.id)).toEqual([]);
    expect(personalFolder && (await outputIn(personalFolder))).toBeNull();
  });

  it("fails to start, names the folder, and writes nowhere", async () => {
    const a = await projectWithFolder("Unplugged");
    const b = await projectWithFolder("Other");
    const personal = await ensurePersonalProject(USER);
    const personalFolder = await WorkspaceRow.find(USER, personal.workspace_id ?? "");
    const workflow = await workflowIn(a.project.id);
    await rm(a.folder.path, { recursive: true, force: true });

    const outcome = await runWorkflow({
      workflowId: workflow.id,
      userId: USER,
      environment: { registry: registry() }
    });

    expect(outcome).toEqual({
      kind: "error",
      status: 409,
      detail: `Project folder not found: ${a.folder.path}`
    });
    expect(await jobCount()).toBe(0);
    // Not recreated, and no other folder took the run.
    expect(existsSync(a.folder.path)).toBe(false);
    expect(await outputIn(b.folder)).toBeNull();
    expect(personalFolder && (await outputIn(personalFolder))).toBeNull();
  });
});

describe("folderKeyInside", () => {
  it("answers the key of a folder that lies inside another, and null otherwise", () => {
    expect(folderKeyInside("workspaces/u", "workspaces/u/projects/abc")).toBe(
      "projects/abc"
    );
    expect(folderKeyInside("workspaces/u", "workspaces/u")).toBeNull();
    expect(folderKeyInside("workspaces/u", "workspaces/u2/projects/abc")).toBeNull();
    expect(folderKeyInside("workspaces/u/projects/abc", "workspaces/u")).toBeNull();

    const outer = join(tmpdir(), "outer");
    expect(folderKeyInside(outer, join(outer, "projects", "abc"))).toBe(
      "projects/abc"
    );
    expect(folderKeyInside(outer, outer)).toBeNull();
    expect(folderKeyInside(outer, join(tmpdir(), "outer2", "abc"))).toBeNull();
    expect(folderKeyInside(join(outer, "projects"), outer)).toBeNull();
    // A local folder and one in object storage are never inside each other.
    expect(folderKeyInside(outer, "workspaces/u")).toBeNull();
    expect(folderKeyInside("workspaces/u", join(outer, "workspaces", "u"))).toBeNull();
  });
});
