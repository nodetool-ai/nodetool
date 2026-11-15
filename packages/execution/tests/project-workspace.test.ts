/**
 * Runs work in the folder of their own project (PRD D3, T2, US4).
 *
 * Every case runs twice, once with project folders in local directories and
 * once in object storage, because a project folder is either.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
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
  type ProcessingContext
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  ensurePersonalProject,
  ensureProjectFolder
} from "../src/service/project-folder.js";
import {
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

  it("refuses a project that has no folder, and creates none", async () => {
    const project = await Project.insertNew({ user_id: USER, name: "Bare" });
    if (!project) throw new Error("insert failed");

    expect(await resolveProjectWorkspace(project.id, USER)).toEqual({
      ok: false,
      projectId: project.id,
      reason: 'Project folder not found: project "Bare" has no folder'
    });
    expect(await WorkspaceRow.listByProject(USER, project.id)).toEqual([]);
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

  it("refuses to start a run whose project has no folder", async () => {
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

    expect(outcome).toEqual({
      kind: "error",
      status: 409,
      detail: 'Project folder not found: project "Bare" has no folder'
    });
    expect(await jobCount()).toBe(0);
    expect(personalFolder && (await outputIn(personalFolder))).toBeNull();
  });
});

describe("a run whose local project folder is missing", () => {
  beforeEach(() => {
    process.env["NODETOOL_WORKSPACE_STORAGE"] = "local";
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
