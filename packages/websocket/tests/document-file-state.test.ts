/**
 * The file state of workflows and timelines, as the web reads it (PRD T5, T8,
 * US8): `projects.documents` reports each file as ok, invalid with the error,
 * or missing. `projects.documentByFile` finds the document a file in Files
 * belongs to. `projects.restoreDocumentFile` writes a missing file again from
 * the row. A change of the state reaches the owner's clients as a
 * `documentfile` resource change.
 *
 * The folders are real project folders, resolved the way the server resolves
 * them, as local directories and as key prefixes in object storage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ModelObserver,
  Workflow,
  Workspace as WorkspaceRow,
  initTestDb
} from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import type { Workspace } from "@nodetool-ai/runtime";
import {
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "@nodetool-ai/execution/service";
import { reconcileDocumentFiles } from "@nodetool-ai/project-services/document-file-sync";
import {
  cancelProjectReconciles,
  flushProjectReconciles
} from "@nodetool-ai/project-services/project-index";
import { workflowFileAdapter } from "@nodetool-ai/project-services/workflow-file";
import { timelineFileAdapter } from "@nodetool-ai/project-services/timeline-file";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { initWorkspaceChangeEvents } from "../src/lib/workflow-workspace.js";
import {
  resourceEvents,
  type ResourceChangePayload
} from "../src/resource-events.js";
import {
  personalWithFolder,
  projectWithFolder,
  useProjectFolders,
  type ProjectFolderFixture
} from "./project-folder-fixture.js";

const createCaller = createCallerFactory(appRouter);
const USER = "1";

function makeCtx(userId = USER): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const GRAPH = {
  nodes: [
    {
      id: "a",
      type: "nodetool.constant.String",
      data: { value: "hello" },
      ui_properties: { position: { x: 40, y: 80 } }
    }
  ],
  edges: []
};

/** The project's folder, unobserved: writes through it are another app's. */
function folderOf(row: WorkspaceRow): Workspace {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return workspace;
}

function reconcile(projectId: string): Promise<unknown> {
  return reconcileDocumentFiles(
    [workflowFileAdapter, timelineFileAdapter],
    projectId,
    USER
  );
}

let folders: ProjectFolderFixture;
const notices: ResourceChangePayload[] = [];
const recordNotice = (payload: ResourceChangePayload): void => {
  if (payload.resource_type === "documentfile") notices.push(payload);
};

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER, "2"]);
  vi.stubEnv("NODETOOL_ENV", "development");
  notices.length = 0;
  resourceEvents.on("change", recordNotice);
  initWorkspaceChangeEvents();
});

afterEach(async () => {
  resourceEvents.off("change", recordNotice);
  await flushProjectReconciles();
  cancelProjectReconciles();
  vi.unstubAllEnvs();
  ModelObserver.clear();
  setWorkspaceCloudStorage(null);
  await folders.cleanup();
});

describe.each(["local", "cloud"] as const)("document file state (%s)", (mode) => {
  beforeEach(() => {
    vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", mode);
    setWorkspaceCloudStorage(mode === "cloud" ? new InMemoryStorageAdapter() : null);
  });

  /** A project with one workflow and one timeline, each with its file. */
  async function setUp(): Promise<{
    projectId: string;
    folder: Workspace;
    workflowId: string;
    timelineId: string;
  }> {
    const { project, folder } = await projectWithFolder(USER, "Film");
    const caller = createCaller(makeCtx());
    const workflow = await caller.workflows.create({
      name: "Fox",
      access: "private",
      graph: GRAPH,
      project_id: project.id
    });
    const timeline = await caller.timeline.create({
      projectId: project.id,
      name: "Cut"
    });
    return {
      projectId: project.id,
      folder: folderOf(folder),
      workflowId: workflow.id,
      timelineId: timeline.id
    };
  }

  async function fileOf(
    projectId: string,
    ref: string
  ): Promise<{ type: string; file?: unknown } | undefined> {
    const documents = await createCaller(makeCtx()).projects.documents({
      id: projectId
    });
    return documents.find((document) => document.ref === ref);
  }

  it("lists workflows and timelines with the state of their files: ok, invalid, missing", async () => {
    const { projectId, folder, workflowId, timelineId } = await setUp();

    expect(await fileOf(projectId, workflowId)).toMatchObject({
      type: "workflow",
      file: { path: "Workflows/Fox.workflow.json", state: "ok", error: null }
    });
    expect(await fileOf(projectId, timelineId)).toMatchObject({
      type: "timeline",
      file: { path: "Timelines/Cut.timeline.json", state: "ok", error: null }
    });

    await folder.write("Workflows/Fox.workflow.json", "{ not json");
    await folder.delete("Timelines/Cut.timeline.json");
    await reconcile(projectId);

    expect(await fileOf(projectId, workflowId)).toMatchObject({
      file: {
        path: "Workflows/Fox.workflow.json",
        state: "invalid",
        error: expect.stringMatching(/^The file is not valid JSON/)
      }
    });
    expect(await fileOf(projectId, timelineId)).toMatchObject({
      file: {
        path: "Timelines/Cut.timeline.json",
        state: "missing",
        error: "File missing"
      }
    });
  });

  it("tells the owner's clients when a file breaks, is fixed, and goes missing", async () => {
    const { projectId, folder, workflowId } = await setUp();
    const path = "Workflows/Fox.workflow.json";
    const good = await folder.readText(path);
    if (good === null) throw new Error("no workflow file");

    await folder.write(path, "{ not json");
    await reconcile(projectId);
    // A second pass over the same broken file announces nothing new.
    await reconcile(projectId);
    await folder.write(path, good);
    await reconcile(projectId);
    await folder.delete(path);
    await reconcile(projectId);

    expect(notices).toEqual([
      {
        event: "updated",
        resource_type: "documentfile",
        resource: {
          id: workflowId,
          type: "workflow",
          project_id: projectId,
          file_path: path,
          file_error: expect.stringMatching(/^The file is not valid JSON/)
        },
        userId: USER
      },
      expect.objectContaining({
        resource: expect.objectContaining({ id: workflowId, file_error: null })
      }),
      expect.objectContaining({
        resource: expect.objectContaining({
          id: workflowId,
          file_error: "File missing"
        })
      })
    ]);
  });

  it("finds the document a file belongs to, and nothing for any other file", async () => {
    const { projectId, folder, workflowId, timelineId } = await setUp();
    await folder.write("notes.md", "# notes");
    const caller = createCaller(makeCtx());

    await expect(
      caller.projects.documentByFile({
        id: projectId,
        path: "Workflows/Fox.workflow.json"
      })
    ).resolves.toMatchObject({ type: "workflow", ref: workflowId, name: "Fox" });
    await expect(
      caller.projects.documentByFile({
        id: projectId,
        path: "Timelines/Cut.timeline.json"
      })
    ).resolves.toMatchObject({ type: "timeline", ref: timelineId, name: "Cut" });
    await expect(
      caller.projects.documentByFile({ id: projectId, path: "notes.md" })
    ).resolves.toBeNull();
    // Another user's project is not found at all.
    await expect(
      createCaller(makeCtx("2")).projects.documentByFile({
        id: projectId,
        path: "Workflows/Fox.workflow.json"
      })
    ).rejects.toThrow(/Project not found/);
  });

  it("finds a document in no project by its file in the Personal folder", async () => {
    const { project, folder } = await personalWithFolder(USER);
    const loose = await Workflow.create<Workflow>({
      user_id: USER,
      project_id: "default",
      name: "Loose",
      graph: GRAPH
    });
    await reconcile(project.id);
    const stored = (await Workflow.getManyByIds([loose.id])).get(loose.id);
    expect(stored?.file_path).toBe("Workflows/Loose.workflow.json");
    expect(await folderOf(folder).readText("Workflows/Loose.workflow.json")).not.toBeNull();

    await expect(
      createCaller(makeCtx()).projects.documentByFile({
        id: project.id,
        path: "Workflows/Loose.workflow.json"
      })
    ).resolves.toMatchObject({ type: "workflow", ref: loose.id });
  });

  it("restores a missing file byte for byte, and Delete removes the workflow", async () => {
    const { projectId, folder, workflowId, timelineId } = await setUp();
    const caller = createCaller(makeCtx());
    const workflowText = await folder.readText("Workflows/Fox.workflow.json");
    const timelineText = await folder.readText("Timelines/Cut.timeline.json");

    await folder.delete("Workflows/Fox.workflow.json");
    await folder.delete("Timelines/Cut.timeline.json");
    await reconcile(projectId);
    expect(await fileOf(projectId, workflowId)).toMatchObject({
      file: { state: "missing" }
    });

    await expect(
      caller.projects.restoreDocumentFile({ type: "workflow", ref: workflowId })
    ).resolves.toMatchObject({
      type: "workflow",
      ref: workflowId,
      file: { path: "Workflows/Fox.workflow.json", state: "ok", error: null }
    });
    await caller.projects.restoreDocumentFile({ type: "timeline", ref: timelineId });

    expect(await folder.readText("Workflows/Fox.workflow.json")).toBe(workflowText);
    expect(await folder.readText("Timelines/Cut.timeline.json")).toBe(timelineText);
    expect(await fileOf(projectId, workflowId)).toMatchObject({
      file: { state: "ok" }
    });
    expect(await fileOf(projectId, timelineId)).toMatchObject({
      file: { state: "ok" }
    });
    // The restored files are the documents' own: the next pass changes nothing.
    await expect(reconcile(projectId)).resolves.toMatchObject({
      unchanged: 2,
      imported: [],
      created: []
    });

    // Delete, the other action on a missing file, removes the document.
    await folder.delete("Workflows/Fox.workflow.json");
    await reconcile(projectId);
    await caller.workflows.delete({ id: workflowId });
    expect((await Workflow.getManyByIds([workflowId])).get(workflowId)).toBeUndefined();
    expect(await fileOf(projectId, workflowId)).toBeUndefined();
  });

  it("refuses to restore over an invalid file edit, and restores nothing for another user", async () => {
    const { folder, workflowId } = await setUp();
    await folder.write("Workflows/Fox.workflow.json", "{ not json");

    await expect(
      createCaller(makeCtx()).projects.restoreDocumentFile({
        type: "workflow",
        ref: workflowId
      })
    ).rejects.toThrow(/was edited and is not valid, so it was kept/);
    expect(await folder.readText("Workflows/Fox.workflow.json")).toBe("{ not json");

    await expect(
      createCaller(makeCtx("2")).projects.restoreDocumentFile({
        type: "workflow",
        ref: workflowId
      })
    ).rejects.toThrow(/Document not found/);
  });
});
