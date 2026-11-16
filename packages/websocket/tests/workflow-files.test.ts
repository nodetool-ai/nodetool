/**
 * Workflows as files in the project folder (PRD T5), through the server's own
 * write paths: the tRPC workflow router, which shares its create, update and
 * delete with the REST routes (`lib/workflow-service.ts`), the editor's
 * autosave, and version restore. Each saves through the `Workflow` model,
 * which writes `Workflows/<name>.workflow.json`.
 *
 * The folders are real project folders, resolved the way the server resolves
 * them, as local directories and as key prefixes in object storage.
 */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ModelObserver,
  Workflow,
  WorkflowVersion,
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
  flushProjectReconciles,
  reconcileProjectOnOpen
} from "@nodetool-ai/project-services/project-index";
import { workflowFileAdapter } from "@nodetool-ai/project-services/workflow-file";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import {
  projectWithFolder,
  useProjectFolders,
  type ProjectFolderFixture
} from "./project-folder-fixture.js";

const createCaller = createCallerFactory(appRouter);
const USER = "1";

function makeCtx(): Context {
  return {
    userId: USER,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

function graphWith(value: string): {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
} {
  return {
    nodes: [
      {
        id: "a",
        type: "nodetool.constant.String",
        data: { value },
        ui_properties: { position: { x: 40, y: 80 } }
      }
    ],
    edges: []
  };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** The project's folder, unobserved: writes through it are another app's. */
function folderOf(row: WorkspaceRow): Workspace {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return workspace;
}

async function workflowFiles(row: WorkspaceRow): Promise<string[]> {
  const entries = await folderOf(row)
    .list("Workflows")
    .catch(() => []);
  return entries.map((entry) => entry.path).sort();
}

async function fileGraphValue(row: WorkspaceRow, path: string): Promise<unknown> {
  const text = await folderOf(row).readText(path);
  const file = JSON.parse(text ?? "{}") as {
    graph?: { nodes?: Array<{ data?: { value?: unknown } }> };
  };
  return file.graph?.nodes?.[0]?.data?.value;
}

async function reload(id: string): Promise<Workflow> {
  const found = (await Workflow.getManyByIds([id])).get(id);
  if (!found) throw new Error(`workflow ${id} is gone`);
  return found;
}

let folders: ProjectFolderFixture;

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER]);
  vi.stubEnv("NODETOOL_ENV", "development");
});

afterEach(async () => {
  await flushProjectReconciles();
  cancelProjectReconciles();
  vi.unstubAllEnvs();
  ModelObserver.clear();
  setWorkspaceCloudStorage(null);
  await folders.cleanup();
});

describe.each(["local", "cloud"] as const)(
  "workflow files through the server's write paths (%s)",
  (mode) => {
    beforeEach(() => {
      vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", mode);
      setWorkspaceCloudStorage(
        mode === "cloud" ? new InMemoryStorageAdapter() : null
      );
    });

    it("writes, renames and deletes the file as the workflow is created, saved, renamed and deleted", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const caller = createCaller(makeCtx());

      const created = await caller.workflows.create({
        name: "Fox",
        access: "private",
        graph: graphWith("created"),
        project_id: project.id
      });
      expect(await workflowFiles(folder)).toEqual(["Workflows/Fox.workflow.json"]);
      expect(await fileGraphValue(folder, "Workflows/Fox.workflow.json")).toBe(
        "created"
      );

      // The editor's autosave.
      await caller.workflows.autosave({
        id: created.id,
        graph: graphWith("autosaved"),
        force: true
      });
      expect(await fileGraphValue(folder, "Workflows/Fox.workflow.json")).toBe(
        "autosaved"
      );

      // Update, with a new name: the file is renamed.
      await caller.workflows.update({
        id: created.id,
        name: "Arctic fox",
        access: "private",
        graph: graphWith("updated")
      });
      expect(await workflowFiles(folder)).toEqual([
        "Workflows/Arctic fox.workflow.json"
      ]);
      expect(
        await fileGraphValue(folder, "Workflows/Arctic fox.workflow.json")
      ).toBe("updated");
      const stored = await reload(created.id);
      expect(stored.file_path).toBe("Workflows/Arctic fox.workflow.json");
      expect(stored.file_hash).toBe(
        sha256(
          (await folderOf(folder).readText("Workflows/Arctic fox.workflow.json")) ??
            ""
        )
      );

      // None of these saves reads as an outside edit.
      expect(
        await reconcileDocumentFiles([workflowFileAdapter], project.id, USER)
      ).toMatchObject({ unchanged: 1, imported: [], created: [], renamed: [] });

      await caller.workflows.delete({ id: created.id });
      expect(await workflowFiles(folder)).toEqual([]);
    });

    it("restores a version to the row and the file, and the next reconcile keeps it", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const caller = createCaller(makeCtx());
      const created = await caller.workflows.create({
        name: "Fox",
        access: "private",
        graph: graphWith("first"),
        project_id: project.id
      });
      const version = await caller.workflows.versions.create({ id: created.id });
      await caller.workflows.autosave({
        id: created.id,
        graph: graphWith("second"),
        force: true
      });
      const versionsBefore = await WorkflowVersion.listForWorkflow(created.id);

      await caller.workflows.versions.restore({
        id: created.id,
        version: version.version
      });

      const restored = await reload(created.id);
      expect(restored.graph.nodes[0]).toMatchObject({ data: { value: "first" } });
      const text = await folderOf(folder).readText("Workflows/Fox.workflow.json");
      expect(await fileGraphValue(folder, "Workflows/Fox.workflow.json")).toBe(
        "first"
      );
      expect(restored.file_hash).toBe(sha256(text ?? ""));

      const report = await reconcileDocumentFiles(
        [workflowFileAdapter],
        project.id,
        USER
      );

      expect(report).toMatchObject({ unchanged: 1, imported: [], written: [] });
      const after = await reload(created.id);
      expect(after.graph.nodes[0]).toMatchObject({ data: { value: "first" } });
      expect(after.updated_at).toBe(restored.updated_at);
      expect(
        (await WorkflowVersion.listForWorkflow(created.id)).map((v) => v.id)
      ).toEqual(versionsBefore.map((v) => v.id));
    });

    it("imports a file edited on disk when the project is opened", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const caller = createCaller(makeCtx());
      const created = await caller.workflows.create({
        name: "Fox",
        access: "private",
        graph: graphWith("first"),
        project_id: project.id
      });
      const path = "Workflows/Fox.workflow.json";
      const text = (await folderOf(folder).readText(path)) ?? "";
      await folderOf(folder).write(path, text.replace('"first"', '"edited on disk"'));

      reconcileProjectOnOpen(project.id, USER);
      await flushProjectReconciles();

      const fetched = await caller.workflows.get({ id: created.id });
      expect(fetched.graph?.nodes?.[0]).toMatchObject({
        data: { value: "edited on disk" }
      });
      expect(
        (await WorkflowVersion.listForWorkflow(created.id)).map(
          (v) => v.graph.nodes[0]
        )
      ).toEqual([expect.objectContaining({ data: { value: "first" } })]);
    });
  }
);
