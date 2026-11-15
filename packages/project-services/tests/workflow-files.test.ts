/**
 * Workflows as files in the project folder (PRD T5, D8, US8):
 * `Workflows/<name>.workflow.json`.
 *
 * Saving in NodeTool writes the file. Editing the file updates the workflow.
 * The cases cover the write paths of the model, one test per row of the
 * reconcile table, version restore, the agent's file tools, and the
 * migration of workflows from before project folders.
 *
 * Every case runs against a local directory and against a storage-backed
 * folder (a key prefix in an object store), through the same `Workspace`
 * interface.
 */
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNGATED, createCapabilityRun } from "@nodetool-ai/agents";
import {
  ModelChangeEvent,
  ModelObserver,
  Workflow,
  WorkflowVersion,
  initTestDb,
  setWorkflowFileSync,
  type ModelChangeMeta
} from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  createLocalWorkspace,
  createWorkspace,
  setProjectFolderResolver,
  type ProcessingContext,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  DOCUMENT_FILE_MISSING,
  documentFileStem,
  documentFileSync,
  reconcileDocumentFiles,
  type DocumentFilesReport
} from "../src/document-file-sync.js";
import {
  COPY_GRACE_MS,
  cancelProjectReconciles,
  flushProjectReconciles,
  scheduleProjectReconcile
} from "../src/project-index.js";
import {
  WORKFLOW_FILE_EDIT_VERSION_NAME,
  migrateWorkflowFiles,
  setWorkflowFileNodeRegistry,
  workflowFileAdapter
} from "../src/workflow-file.js";

const USER = "owner";
const PROJECT = "project-a";
const OTHER_PROJECT = "project-b";
const KNOWN_NODE = "nodetool.constant.String";

interface TestNode {
  id: string;
  type: string;
  data: { value: string };
  ui_properties: { position: { x: number; y: number } };
}

/** A node in the stored shape, with the position an editor gave it. */
function node(id: string, value: string, type = KNOWN_NODE): TestNode {
  return { id, type, data: { value }, ui_properties: { position: { x: 40, y: 80 } } };
}

function graphOf(...nodes: TestNode[]): { nodes: TestNode[]; edges: never[] } {
  return { nodes, edges: [] };
}

/** A registry that has one node type. */
const registry = {
  availability: (type: string) =>
    type === KNOWN_NODE ? "executable" : "unknown",
  has: (type: string) => type === KNOWN_NODE,
  getMetadata: () => undefined,
  validateNode: () => []
} as unknown as NodeRegistry;

let root: string;
let rawStore: InMemoryStorageAdapter;
let workspaces: Map<string, Workspace>;
let unreachable: boolean;

const kinds = {
  /** A real directory on this host. */
  local: (projectId: string): Workspace =>
    createLocalWorkspace(join(root, "projects", projectId)),
  /** A key prefix in an object store. */
  storage: (projectId: string): Workspace =>
    createWorkspace(rawStore, { prefix: `workspaces/${USER}/${projectId}` })
} as const;

type Kind = keyof typeof kinds;

/** The project's folder. Writes through it stand for another app's. */
function folder(kind: Kind, projectId = PROJECT): Workspace {
  let workspace = workspaces.get(projectId);
  if (!workspace) {
    workspace = kinds[kind](projectId);
    workspaces.set(projectId, workspace);
  }
  return workspace;
}

function useFolders(kind: Kind): void {
  setProjectFolderResolver(
    async (projectId): Promise<ProjectFolderResolution> => {
      const id = projectId ?? "personal";
      if (unreachable) {
        return { ok: false, projectId: id, reason: `Project folder not found: ${id}` };
      }
      return { ok: true, projectId: id, workspace: folder(kind, id) };
    }
  );
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function pathOf(name: string): string {
  return `Workflows/${name}.workflow.json`;
}

function makeWorkflow(
  name: string,
  fields: Record<string, unknown> = {}
): Promise<Workflow> {
  return Workflow.create<Workflow>({
    user_id: USER,
    project_id: PROJECT,
    name,
    graph: graphOf(node("a", "hello")),
    ...fields
  });
}

async function reload(id: string): Promise<Workflow> {
  const [found] = [...(await Workflow.getManyByIds([id])).values()];
  if (!found) throw new Error(`workflow ${id} is gone`);
  return found;
}

async function rows(projectId = PROJECT): Promise<Workflow[]> {
  return Workflow.listForProjects(USER, [projectId]);
}

async function fileNames(kind: Kind, projectId = PROJECT): Promise<string[]> {
  const entries = await folder(kind, projectId)
    .list("Workflows")
    .catch(() => []);
  return entries.map((entry) => entry.name).sort();
}

async function textOf(kind: Kind, path: string): Promise<string> {
  const text = await folder(kind).readText(path);
  if (text === null) throw new Error(`no file at ${path}`);
  return text;
}

interface WorkflowFileJson {
  format: string;
  version: number;
  id?: string;
  description: string;
  tags: string[];
  run_mode: string | null;
  settings: Record<string, unknown>;
  graph: { nodes: TestNode[]; edges: unknown[] };
}

async function jsonOf(kind: Kind, path: string): Promise<WorkflowFileJson> {
  return JSON.parse(await textOf(kind, path)) as WorkflowFileJson;
}

/** Change the file at `path` as a text editor would. */
async function editFile(
  kind: Kind,
  path: string,
  change: (file: WorkflowFileJson) => void
): Promise<string> {
  const file = await jsonOf(kind, path);
  change(file);
  const text = `${JSON.stringify(file, null, 2)}\n`;
  await folder(kind).write(path, text);
  return text;
}

function reconcile(projectId = PROJECT): Promise<DocumentFilesReport> {
  return reconcileDocumentFiles([workflowFileAdapter], projectId, USER);
}

/** A run of the agent tools for `USER`, in the project's folder. */
function agentRun(kind: Kind): ReturnType<typeof createCapabilityRun> {
  const variables = new Map<string, unknown>();
  const context = {
    userId: USER,
    workspace: folder(kind),
    threadId: "thread-workflow-files",
    workflowId: null,
    get: (key: string) => variables.get(key),
    set: (key: string, value: unknown) => void variables.set(key, value),
    postMessage: () => undefined
  } as unknown as ProcessingContext;
  return createCapabilityRun({ context, gate: UNGATED, nodeRegistry: registry });
}

/** Let the time a copy waits to be told apart from a move pass. */
function passCopyGrace(): void {
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + COPY_GRACE_MS + 1);
}

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-workflow-files-"));
  rawStore = new InMemoryStorageAdapter();
  workspaces = new Map();
  unreachable = false;
  setWorkflowFileSync(documentFileSync(workflowFileAdapter));
  setWorkflowFileNodeRegistry(() => registry);
});

afterEach(async () => {
  cancelProjectReconciles();
  ModelObserver.clear();
  setProjectFolderResolver(null);
  setWorkflowFileNodeRegistry(null);
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe.each(["local", "storage"] as const)("workflow files (%s folder)", (kind) => {
  beforeEach(() => useFolders(kind));

  describe("saving in NodeTool", () => {
    it("writes Workflows/<name>.workflow.json in the fixed format", async () => {
      const workflow = await makeWorkflow("Fox in snow", {
        description: "A fox",
        tags: ["animals"],
        settings: { speed: 2 }
      });

      const text = await textOf(kind, pathOf("Fox in snow"));
      expect(text).toBe(
        `${JSON.stringify(
          {
            format: "nodetool.workflow",
            version: 1,
            id: workflow.id,
            description: "A fox",
            tags: ["animals"],
            run_mode: "workflow",
            settings: { speed: 2 },
            graph: graphOf(node("a", "hello"))
          },
          null,
          2
        )}\n`
      );
      // The file name is the name. The file holds no name field, and nothing
      // the database alone keeps.
      expect(Object.keys(JSON.parse(text) as object)).toEqual([
        "format",
        "version",
        "id",
        "description",
        "tags",
        "run_mode",
        "settings",
        "graph"
      ]);
      const stored = await reload(workflow.id);
      expect(stored.file_path).toBe(pathOf("Fox in snow"));
      expect(stored.file_hash).toBe(sha256(text));
      expect(stored.file_error).toBeNull();
      // The caller's instance carries the same state as the row.
      expect(workflow.file_path).toBe(stored.file_path);
      expect(workflow.file_hash).toBe(stored.file_hash);
    });

    it("leaves the file byte-identical when saved again without changes", async () => {
      const workflow = await makeWorkflow("Fox");
      const path = pathOf("Fox");
      const before = await folder(kind).read(path);
      const stat = await folder(kind).stat(path);
      const write = vi.spyOn(folder(kind), "write");

      await workflow.save();
      const saved = await Workflow.updateFieldsIfUnchanged(
        workflow.id,
        workflow.updated_at,
        { graph: graphOf(node("a", "hello")) }
      );

      expect(saved).not.toBeNull();
      expect(await folder(kind).read(path)).toEqual(before);
      expect(write).not.toHaveBeenCalled();
      expect((await folder(kind).stat(path))?.modifiedAt).toBe(stat?.modifiedAt);
      expect((await reload(workflow.id)).file_hash).toBe(workflow.file_hash);
    });

    it("writes the file on every write path of the model", async () => {
      // Workflow.create: REST and tRPC create, create_workflow, the CLI.
      const workflow = await makeWorkflow("Fox");
      const path = pathOf("Fox");
      expect((await jsonOf(kind, path)).graph.nodes[0]?.data.value).toBe("hello");

      // Instance save: every caller that loads, changes and saves the row.
      workflow.graph = graphOf(node("a", "saved"));
      await workflow.save();
      expect((await jsonOf(kind, path)).graph.nodes[0]?.data.value).toBe("saved");

      // Instance update, which is a save.
      await workflow.update({ description: "updated" });
      expect((await jsonOf(kind, path)).description).toBe("updated");

      // Conditional update: the web editor's autosave, REST and tRPC update,
      // update_workflow, the workflow links, version restore.
      const updated = await Workflow.updateFieldsIfUnchanged(
        workflow.id,
        workflow.updated_at,
        { graph: graphOf(node("a", "conditional")) }
      );
      expect(updated?.file_hash).toBe(sha256(await textOf(kind, path)));
      expect((await jsonOf(kind, path)).graph.nodes[0]?.data.value).toBe(
        "conditional"
      );
      expect((await reload(workflow.id)).file_hash).toBe(updated?.file_hash);
    });

    it("does not change updated_at when it records the file", async () => {
      const workflow = await makeWorkflow("Fox");
      const stored = await reload(workflow.id);

      expect(stored.updated_at).toBe(workflow.updated_at);
      // The row an editor read is still the row a conditional save expects.
      const saved = await Workflow.updateFieldsIfUnchanged(
        workflow.id,
        workflow.updated_at,
        { description: "next" }
      );
      expect(saved).not.toBeNull();
    });

    it("renames the file when the workflow is renamed", async () => {
      const workflow = await makeWorkflow("Fox");

      const renamed = await Workflow.updateFieldsIfUnchanged(
        workflow.id,
        workflow.updated_at,
        { name: "Arctic fox" }
      );

      expect(await fileNames(kind)).toEqual(["Arctic fox.workflow.json"]);
      expect(renamed?.file_path).toBe(pathOf("Arctic fox"));
      expect((await jsonOf(kind, pathOf("Arctic fox"))).id).toBe(workflow.id);
      // The rename is not an outside edit.
      expect(await reconcile()).toMatchObject({ unchanged: 1, renamed: [], created: [] });
      expect(await rows()).toHaveLength(1);
    });

    it("deletes the file when the workflow is deleted", async () => {
      const first = await makeWorkflow("Fox");
      const second = await makeWorkflow("Owl");

      await first.delete();
      expect(await fileNames(kind)).toEqual(["Owl.workflow.json"]);

      expect(await Workflow.deleteOwned(USER, second.id)).toBe(true);
      expect(await fileNames(kind)).toEqual([]);
      expect(await reconcile()).toMatchObject({ files: 0, created: [] });
      expect(await rows()).toHaveLength(0);
    });

    it("gives a name another file has a numeric suffix", async () => {
      const first = await makeWorkflow("Fox");
      const second = await makeWorkflow("Fox");
      // Names compare without case, as macOS and Windows folders do.
      const third = await makeWorkflow("fox");

      expect(await fileNames(kind)).toEqual([
        "Fox-2.workflow.json",
        "Fox.workflow.json",
        "fox-3.workflow.json"
      ]);
      expect(first.file_path).toBe(pathOf("Fox"));
      expect(second.file_path).toBe(pathOf("Fox-2"));
      expect(third.file_path).toBe(pathOf("fox-3"));
      expect((await jsonOf(kind, pathOf("Fox"))).id).toBe(first.id);
      expect((await jsonOf(kind, pathOf("Fox-2"))).id).toBe(second.id);

      // A later save keeps each file where it is, and the names stay.
      second.description = "second";
      await second.save();
      expect(second.file_path).toBe(pathOf("Fox-2"));
      expect(await reconcile()).toMatchObject({ unchanged: 3, renamed: [] });
      expect((await reload(second.id)).name).toBe("Fox");
    });

    it("gives a renamed workflow a suffix when its new name is taken", async () => {
      await makeWorkflow("Fox");
      const owl = await makeWorkflow("Owl");

      const renamed = await Workflow.updateFieldsIfUnchanged(owl.id, owl.updated_at, {
        name: "Fox"
      });

      expect(renamed?.file_path).toBe(pathOf("Fox-2"));
      expect(await fileNames(kind)).toEqual([
        "Fox-2.workflow.json",
        "Fox.workflow.json"
      ]);
    });

    it("writes a name a file cannot carry as a valid file name", async () => {
      const workflow = await makeWorkflow('Cut: "A/B" test?');

      expect(workflow.file_path).toBe(pathOf("Cut A B test"));
      expect(documentFileStem("  ..hidden. ", "Untitled")).toBe("hidden");
      expect(documentFileStem("///", "Untitled")).toBe("Untitled");
      expect(documentFileStem("CON", "Untitled")).toBe("CON-file");
    });

    it("takes the file along when the workflow changes project", async () => {
      const workflow = await makeWorkflow("Fox");

      const moved = await Workflow.updateFieldsIfUnchanged(
        workflow.id,
        workflow.updated_at,
        { project_id: OTHER_PROJECT }
      );

      expect(await fileNames(kind, PROJECT)).toEqual([]);
      expect(await fileNames(kind, OTHER_PROJECT)).toEqual(["Fox.workflow.json"]);
      expect(moved?.file_path).toBe(pathOf("Fox"));
      // Neither folder takes the move for a new or a missing document.
      expect(await reconcile(PROJECT)).toMatchObject({ files: 0, missing: [] });
      expect(await reconcile(OTHER_PROJECT)).toMatchObject({
        unchanged: 1,
        created: []
      });

      // The same through a loaded instance.
      const loaded = await reload(workflow.id);
      loaded.project_id = PROJECT;
      await loaded.save();
      expect(await fileNames(kind, OTHER_PROJECT)).toEqual([]);
      expect(await fileNames(kind, PROJECT)).toEqual(["Fox.workflow.json"]);
    });

    it("writes no file for a template or a workflow outside every folder", async () => {
      // An example or package workflow is read from its package and is not
      // saved as a row.
      Workflow.fromDict({
        id: "example-1",
        name: "Example",
        package_name: "nodetool-base",
        graph: graphOf(node("a", "hello"))
      });
      // A loose workflow of a user with no Personal project has no folder.
      const loose = await makeWorkflow("Loose", { project_id: "default" });

      expect(loose.file_path).toBeNull();
      expect(await fileNames(kind)).toEqual([]);
      expect(await fileNames(kind, "personal")).toEqual([]);
    });

    it("saves the row when the folder is away and writes the file later", async () => {
      const workflow = await makeWorkflow("Fox");
      unreachable = true;

      const saved = await Workflow.updateFieldsIfUnchanged(
        workflow.id,
        workflow.updated_at,
        { graph: graphOf(node("a", "offline edit")) }
      );

      // The row is saved and marked newer than its file.
      expect(saved?.graph.nodes[0]).toMatchObject({ data: { value: "offline edit" } });
      expect((await reload(workflow.id)).file_hash).toBeNull();
      expect((await jsonOf(kind, pathOf("Fox"))).graph.nodes[0]?.data.value).toBe(
        "hello"
      );

      unreachable = false;
      const report = await reconcile();

      // The row wins: nothing is imported and no version is made.
      expect(report).toMatchObject({ written: [workflow.id], imported: [] });
      expect((await jsonOf(kind, pathOf("Fox"))).graph.nodes[0]?.data.value).toBe(
        "offline edit"
      );
      expect(await WorkflowVersion.listForWorkflow(workflow.id)).toHaveLength(0);
      expect((await reload(workflow.id)).file_hash).toBe(
        sha256(await textOf(kind, pathOf("Fox")))
      );
    });

    it("marks the row newer than its file when a host without the sync saves it", async () => {
      const workflow = await makeWorkflow("Fox");
      setWorkflowFileSync(null);

      const saved = await Workflow.updateFieldsIfUnchanged(
        workflow.id,
        workflow.updated_at,
        { graph: graphOf(node("a", "from the cli")) }
      );
      expect(saved?.file_hash).toBeNull();
      const loaded = await reload(workflow.id);
      loaded.description = "saved without the sync";
      await loaded.save();
      expect((await reload(workflow.id)).file_hash).toBeNull();

      setWorkflowFileSync(documentFileSync(workflowFileAdapter));
      expect(await reconcile()).toMatchObject({ written: [workflow.id], imported: [] });
      const file = await jsonOf(kind, pathOf("Fox"));
      expect(file.graph.nodes[0]?.data.value).toBe("from the cli");
      expect(file.description).toBe("saved without the sync");
    });
  });

  describe("the reconcile table", () => {
    it("hash equals file_hash: changes nothing", async () => {
      const workflow = await makeWorkflow("Fox");
      const before = await reload(workflow.id);
      const events: ModelChangeEvent[] = [];
      ModelObserver.subscribe((_instance, event) => events.push(event), "Workflow");

      const report = await reconcile();

      expect(report).toMatchObject({
        files: 1,
        unchanged: 1,
        imported: [],
        invalid: [],
        missing: [],
        renamed: [],
        created: [],
        reassigned: [],
        written: []
      });
      expect(events).toEqual([]);
      expect((await reload(workflow.id)).toRow()).toEqual(before.toRow());
      expect(await WorkflowVersion.listForWorkflow(workflow.id)).toHaveLength(0);
    });

    it("hash differs and the file validates: snapshots the row, imports the file, announces it", async () => {
      const workflow = await makeWorkflow("Fox");
      const announced: Array<{ id: unknown; meta?: ModelChangeMeta }> = [];
      ModelObserver.subscribe((instance, event, meta) => {
        if (event === ModelChangeEvent.UPDATED) announced.push({ id: instance.id, meta });
      }, "Workflow");

      const text = await editFile(kind, pathOf("Fox"), (file) => {
        file.graph.nodes[0]!.data.value = "edited on disk";
        file.graph.nodes.push(node("b", "added on disk"));
        file.description = "edited";
        file.tags = ["hand"];
      });
      const report = await reconcile();

      expect(report).toMatchObject({ imported: [workflow.id], invalid: [] });
      const stored = await reload(workflow.id);
      expect(stored.graph.nodes).toEqual([
        node("a", "edited on disk"),
        node("b", "added on disk")
      ]);
      expect(stored.description).toBe("edited");
      expect(stored.tags).toEqual(["hand"]);
      expect(stored.name).toBe("Fox");
      // The file is left as it was written, and its hash is the row's.
      expect(await textOf(kind, pathOf("Fox"))).toBe(text);
      expect(stored.file_hash).toBe(sha256(text));
      // The previous graph exists as a version.
      const versions = await WorkflowVersion.listForWorkflow(workflow.id);
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        name: WORKFLOW_FILE_EDIT_VERSION_NAME,
        save_type: "checkpoint",
        graph: graphOf(node("a", "hello"))
      });
      // Open editors hear of it as they hear of an update_workflow.
      expect(announced).toEqual([
        { id: workflow.id, meta: { ops: [{ tool: "update_graph", input: {} }] } }
      ]);
      expect(await reconcile()).toMatchObject({ unchanged: 1, imported: [] });
    });

    it("hash differs and the file fails validation: keeps the row and records the error", async () => {
      const workflow = await makeWorkflow("Fox");
      const before = await reload(workflow.id);

      await folder(kind).write(pathOf("Fox"), "{ not json");
      const report = await reconcile();

      expect(report).toMatchObject({ invalid: [workflow.id], imported: [] });
      const stored = await reload(workflow.id);
      expect(stored.file_error).toMatch(/^The file is not valid JSON/);
      expect(stored.graph).toEqual(before.graph);
      expect(stored.updated_at).toBe(before.updated_at);
      expect(stored.file_hash).toBe(before.file_hash);
      expect(await WorkflowVersion.listForWorkflow(workflow.id)).toHaveLength(0);
      // The file is not overwritten: the edit is the user's to fix.
      expect(await textOf(kind, pathOf("Fox"))).toBe("{ not json");

      // A wrong field type is refused the same way.
      await folder(kind).write(
        pathOf("Fox"),
        JSON.stringify({
          format: "nodetool.workflow",
          version: 1,
          id: workflow.id,
          tags: "not a list",
          graph: graphOf()
        })
      );
      await reconcile();
      expect((await reload(workflow.id)).file_error).toBe(
        '"tags" must be a list of strings'
      );

      // Fixing the file clears the error and imports it.
      await folder(kind).write(
        pathOf("Fox"),
        JSON.stringify({
          format: "nodetool.workflow",
          version: 1,
          id: workflow.id,
          graph: graphOf(node("a", "fixed"))
        })
      );
      expect(await reconcile()).toMatchObject({ imported: [workflow.id] });
      const fixed = await reload(workflow.id);
      expect(fixed.file_error).toBeNull();
      expect(fixed.graph.nodes[0]).toMatchObject({ data: { value: "fixed" } });
    });

    it("file absent: records that the file is missing and keeps the row", async () => {
      const workflow = await makeWorkflow("Fox");
      const before = await reload(workflow.id);

      await folder(kind).delete(pathOf("Fox"));
      const report = await reconcile();

      expect(report).toMatchObject({ missing: [workflow.id], written: [] });
      const stored = await reload(workflow.id);
      expect(stored.file_error).toBe(DOCUMENT_FILE_MISSING);
      expect(stored.graph).toEqual(before.graph);
      expect(stored.file_path).toBe(pathOf("Fox"));
      // Nothing is restored behind the user's back.
      expect(await fileNames(kind)).toEqual([]);

      // Saving the workflow in NodeTool writes the file again.
      const saved = await Workflow.updateFieldsIfUnchanged(
        workflow.id,
        stored.updated_at,
        { description: "kept" }
      );
      expect(saved?.file_error).toBeNull();
      expect(await fileNames(kind)).toEqual(["Fox.workflow.json"]);
      expect((await reload(workflow.id)).file_error).toBeNull();
    });

    it("file renamed, same ID: renames the workflow", async () => {
      const workflow = await makeWorkflow("Fox");

      await folder(kind).move(pathOf("Fox"), pathOf("Arctic fox"));
      const report = await reconcile();

      expect(report).toMatchObject({
        renamed: [workflow.id],
        created: [],
        reassigned: [],
        missing: []
      });
      const stored = await reload(workflow.id);
      expect(stored.name).toBe("Arctic fox");
      expect(stored.file_path).toBe(pathOf("Arctic fox"));
      expect(stored.file_error).toBeNull();
      expect(await rows()).toHaveLength(1);
      // The rename alone is no change of content.
      expect(await WorkflowVersion.listForWorkflow(workflow.id)).toHaveLength(0);

      // A file moved to another directory keeps its workflow and its name.
      await folder(kind).move(pathOf("Arctic fox"), "Archive/Arctic fox.workflow.json");
      expect(await reconcile()).toMatchObject({ renamed: [workflow.id] });
      const moved = await reload(workflow.id);
      expect(moved.file_path).toBe("Archive/Arctic fox.workflow.json");
      expect(moved.name).toBe("Arctic fox");
      // A later save writes where the file is.
      await Workflow.updateFieldsIfUnchanged(workflow.id, moved.updated_at, {
        description: "kept in place"
      });
      expect(
        (await jsonOf(kind, "Archive/Arctic fox.workflow.json")).description
      ).toBe("kept in place");
      expect(await fileNames(kind)).toEqual([]);
    });

    it("new file with an unknown ID: creates the workflow in this project", async () => {
      const text = `${JSON.stringify(
        {
          format: "nodetool.workflow",
          version: 1,
          id: "0123456789abcdef0123456789abcdef",
          description: "From git",
          tags: ["imported"],
          run_mode: null,
          settings: {},
          graph: graphOf(node("a", "from a file"))
        },
        null,
        2
      )}\n`;
      await folder(kind).write(pathOf("From git"), text);

      const report = await reconcile();

      expect(report.created).toEqual(["0123456789abcdef0123456789abcdef"]);
      const created = await reload("0123456789abcdef0123456789abcdef");
      expect(created).toMatchObject({
        user_id: USER,
        project_id: PROJECT,
        name: "From git",
        description: "From git",
        tags: ["imported"],
        file_path: pathOf("From git"),
        file_hash: sha256(text),
        file_error: null
      });
      expect(created.graph.nodes).toEqual([node("a", "from a file")]);
      // The file keeps its ID and its bytes.
      expect(await textOf(kind, pathOf("From git"))).toBe(text);
      expect(await reconcile()).toMatchObject({ unchanged: 1, created: [] });
      expect(await rows()).toHaveLength(1);
    });

    it("new file whose ID belongs to another file: assigns a new ID and rewrites the file", async () => {
      const workflow = await makeWorkflow("Fox");
      // A copy that was edited afterwards: it cannot be the other half of a move.
      const file = await jsonOf(kind, pathOf("Fox"));
      file.graph.nodes[0]!.data.value = "the copy";
      await folder(kind).write(pathOf("Fox copy"), JSON.stringify(file));

      const report = await reconcile();

      expect(report).toMatchObject({ unchanged: 1, created: [], renamed: [] });
      expect(report.reassigned).toHaveLength(1);
      const [copyId] = report.reassigned;
      expect(copyId).not.toBe(workflow.id);
      const copy = await reload(copyId!);
      expect(copy).toMatchObject({ name: "Fox copy", project_id: PROJECT });
      expect(copy.graph.nodes[0]).toMatchObject({ data: { value: "the copy" } });
      // The file now carries the new ID, in the canonical format.
      const rewritten = await textOf(kind, pathOf("Fox copy"));
      expect((JSON.parse(rewritten) as WorkflowFileJson).id).toBe(copyId);
      expect(copy.file_hash).toBe(sha256(rewritten));
      // The original is untouched.
      const original = await reload(workflow.id);
      expect(original.graph.nodes[0]).toMatchObject({ data: { value: "hello" } });
      expect((await jsonOf(kind, pathOf("Fox"))).id).toBe(workflow.id);
      expect(await reconcile()).toMatchObject({ unchanged: 2, reassigned: [] });
    });

    it("assigns a new ID to a file whose ID belongs to a workflow of another project", async () => {
      const elsewhere = await makeWorkflow("Fox", { project_id: OTHER_PROJECT });
      const text = await folder(kind, OTHER_PROJECT).readText(pathOf("Fox"));
      await folder(kind).write(pathOf("Fox"), text ?? "");

      const report = await reconcile();

      expect(report.reassigned).toHaveLength(1);
      expect(report.reassigned[0]).not.toBe(elsewhere.id);
      expect((await reload(elsewhere.id)).project_id).toBe(OTHER_PROJECT);
      expect((await jsonOf(kind, pathOf("Fox"))).id).toBe(report.reassigned[0]);
    });
  });

  describe("editing a workflow file", () => {
    it("updates the workflow from an edited graph and keeps the previous graph as a version", async () => {
      const workflow = await makeWorkflow("Fox");

      await editFile(kind, pathOf("Fox"), (file) => {
        file.graph.nodes[0]!.data.value = "edited";
      });
      await reconcile();

      expect((await reload(workflow.id)).graph.nodes[0]).toMatchObject({
        data: { value: "edited" }
      });
      const versions = await WorkflowVersion.listForWorkflow(workflow.id);
      expect(versions.map((version) => version.graph)).toEqual([
        graphOf(node("a", "hello"))
      ]);
    });

    it("collapses the edits made between two reconciles into one version", async () => {
      const workflow = await makeWorkflow("Fox");

      for (const value of ["first", "second", "third"]) {
        await editFile(kind, pathOf("Fox"), (file) => {
          file.graph.nodes[0]!.data.value = value;
        });
      }
      await reconcile();

      expect((await reload(workflow.id)).graph.nodes[0]).toMatchObject({
        data: { value: "third" }
      });
      const versions = await WorkflowVersion.listForWorkflow(workflow.id);
      expect(versions).toHaveLength(1);
      expect(versions[0]?.graph).toEqual(graphOf(node("a", "hello")));
    });

    it("makes no version for an edit that changes no content", async () => {
      const workflow = await makeWorkflow("Fox");
      const before = await reload(workflow.id);
      const compact = JSON.stringify(await jsonOf(kind, pathOf("Fox")));

      await folder(kind).write(pathOf("Fox"), compact);
      const report = await reconcile();

      expect(report).toMatchObject({ imported: [], invalid: [] });
      const stored = await reload(workflow.id);
      expect(stored.updated_at).toBe(before.updated_at);
      expect(stored.file_hash).toBe(sha256(compact));
      expect(await WorkflowVersion.listForWorkflow(workflow.id)).toHaveLength(0);
      expect(await reconcile()).toMatchObject({ unchanged: 1 });
    });

    it("keeps the positions the file gives and places a node that has none", async () => {
      const workflow = await makeWorkflow("Fox");

      await editFile(kind, pathOf("Fox"), (file) => {
        file.graph.nodes[0]!.ui_properties.position = { x: 512, y: 256 };
        // Written the way an agent authors a node: no layout, `properties`.
        file.graph.nodes.push({
          id: "b",
          type: KNOWN_NODE,
          properties: { value: "new" }
        } as unknown as TestNode);
      });
      await reconcile();

      const [first, second] = (await reload(workflow.id)).graph.nodes;
      expect(first).toMatchObject({ ui_properties: { position: { x: 512, y: 256 } } });
      expect(second).toMatchObject({
        id: "b",
        data: { value: "new" },
        ui_properties: { position: { x: expect.any(Number), y: expect.any(Number) } }
      });
      expect(second).not.toHaveProperty("properties");
    });

    it("rejects an unknown node type with the error update_workflow gives, and keeps the graph", async () => {
      const workflow = await makeWorkflow("Fox");
      const before = await reload(workflow.id);
      const unknownGraph = graphOf(
        node("a", "hello"),
        node("b", "nope", "nodetool.missing.Node")
      );
      const refused = (await agentRun(kind).invoke("update_workflow", {
        workflow_id: workflow.id,
        graph: unknownGraph
      })) as { error: string; issues: Array<{ message: string }> };
      expect(refused.error).toMatch(/node types that do not exist/);
      expect(refused.issues.map((issue) => issue.message)).toEqual([
        'Unknown node type "nodetool.missing.Node" on node "b"'
      ]);

      await editFile(kind, pathOf("Fox"), (file) => {
        file.graph = unknownGraph;
      });
      const report = await reconcile();

      expect(report).toMatchObject({ invalid: [workflow.id], imported: [] });
      const stored = await reload(workflow.id);
      expect(stored.file_error).toBe(
        [refused.error, ...refused.issues.map((issue) => issue.message)].join("\n")
      );
      // The previous graph is still the one a run reads.
      expect(stored.graph).toEqual(before.graph);
      expect(stored.updated_at).toBe(before.updated_at);
      expect(await WorkflowVersion.listForWorkflow(workflow.id)).toHaveLength(0);
    });

    it("restores a changed id in a known file", async () => {
      const workflow = await makeWorkflow("Fox");

      await editFile(kind, pathOf("Fox"), (file) => {
        file.id = "ffffffffffffffffffffffffffffffff";
        file.graph.nodes[0]!.data.value = "edited with a new id";
      });
      const report = await reconcile();

      expect(report).toMatchObject({ imported: [workflow.id], created: [], reassigned: [] });
      expect(await rows()).toHaveLength(1);
      const stored = await reload(workflow.id);
      expect(stored.graph.nodes[0]).toMatchObject({
        data: { value: "edited with a new id" }
      });
      const rewritten = await textOf(kind, pathOf("Fox"));
      expect((JSON.parse(rewritten) as WorkflowFileJson).id).toBe(workflow.id);
      expect(stored.file_hash).toBe(sha256(rewritten));
      expect(await reconcile()).toMatchObject({ unchanged: 1, imported: [] });
    });

    it("gives the same result when an agent edits the file with its file tools", async () => {
      const byHand = await makeWorkflow("By hand");
      const byAgent = await makeWorkflow("By agent");
      const run = agentRun(kind);

      await editFile(kind, pathOf("By hand"), (file) => {
        file.graph.nodes[0]!.data.value = "edited";
      });
      const edited = (await run.invoke("edit_file", {
        path: pathOf("By agent"),
        old_string: '"value": "hello"',
        new_string: '"value": "edited"'
      })) as Record<string, unknown>;
      expect(edited["error"]).toBeUndefined();
      const report = await reconcile();

      expect(report.imported.sort()).toEqual([byHand.id, byAgent.id].sort());
      const [hand, agent] = [await reload(byHand.id), await reload(byAgent.id)];
      expect(agent.graph).toEqual(hand.graph);
      expect(agent.graph.nodes[0]).toMatchObject({ data: { value: "edited" } });
      expect(
        (await WorkflowVersion.listForWorkflow(byAgent.id)).map((v) => v.graph)
      ).toEqual((await WorkflowVersion.listForWorkflow(byHand.id)).map((v) => v.graph));

      // A file the agent writes from scratch becomes a workflow.
      const written = (await run.invoke("write_file", {
        file_path: pathOf("Agent made"),
        content: JSON.stringify({
          format: "nodetool.workflow",
          version: 1,
          graph: graphOf(node("a", "made by an agent"))
        })
      })) as Record<string, unknown>;
      expect(written["error"]).toBeUndefined();
      const second = await reconcile();
      expect(second.reassigned).toHaveLength(1);
      const made = await reload(second.reassigned[0]!);
      expect(made).toMatchObject({ name: "Agent made", project_id: PROJECT });
      expect((await jsonOf(kind, pathOf("Agent made"))).id).toBe(made.id);

      // An unknown node type is refused for the agent's file as for a hand edit.
      await run.invoke("edit_file", {
        path: pathOf("By agent"),
        old_string: KNOWN_NODE,
        new_string: "nodetool.missing.Node"
      });
      expect(await reconcile()).toMatchObject({ invalid: [byAgent.id] });
      expect((await reload(byAgent.id)).graph).toEqual(agent.graph);
    });
  });

  describe("duplicating and moving a file", () => {
    it("makes a second workflow with a new ID from a duplicated file", async () => {
      const workflow = await makeWorkflow("Fox");
      await folder(kind).copy(pathOf("Fox"), pathOf("Fox copy"));

      // An exact copy first waits to be told apart from a move.
      const first = await reconcile();
      expect(first).toMatchObject({ deferred: [pathOf("Fox copy")], reassigned: [] });
      expect(await rows()).toHaveLength(1);

      passCopyGrace();
      const report = await reconcile();

      expect(report.reassigned).toHaveLength(1);
      const copy = await reload(report.reassigned[0]!);
      expect(copy.id).not.toBe(workflow.id);
      expect(copy).toMatchObject({ name: "Fox copy", project_id: PROJECT });
      expect(copy.graph).toEqual((await reload(workflow.id)).graph);
      expect((await jsonOf(kind, pathOf("Fox copy"))).id).toBe(copy.id);
      expect((await jsonOf(kind, pathOf("Fox"))).id).toBe(workflow.id);
      expect(await rows()).toHaveLength(2);
      expect(await reconcile()).toMatchObject({ unchanged: 2, reassigned: [], deferred: [] });
    });

    it("follows a move seen half done: a copy, then the delete", async () => {
      const workflow = await makeWorkflow("Fox");
      await folder(kind).copy(pathOf("Fox"), pathOf("Arctic fox"));

      expect(await reconcile()).toMatchObject({
        deferred: [pathOf("Arctic fox")],
        reassigned: []
      });
      await folder(kind).delete(pathOf("Fox"));
      const report = await reconcile();

      expect(report).toMatchObject({ renamed: [workflow.id], reassigned: [], missing: [] });
      expect(await rows()).toHaveLength(1);
      expect(await reload(workflow.id)).toMatchObject({
        name: "Arctic fox",
        file_path: pathOf("Arctic fox"),
        file_error: null
      });
    });
  });

  describe("version restore", () => {
    it("writes the row and the file, so the next reconcile changes nothing", async () => {
      const workflow = await makeWorkflow("Fox");
      const run = agentRun(kind);
      await run.invoke("create_workflow_version", {
        workflow_id: workflow.id,
        name: "v1"
      });
      const changed = await Workflow.updateFieldsIfUnchanged(
        workflow.id,
        workflow.updated_at,
        { graph: graphOf(node("a", "second draft")) }
      );
      expect(changed).not.toBeNull();

      const restored = (await run.invoke("restore_workflow_version", {
        workflow_id: workflow.id,
        version: 1
      })) as Record<string, unknown>;
      expect(restored).toMatchObject({ ok: true, restored_version: 1 });
      const after = await reload(workflow.id);
      const versions = await WorkflowVersion.listForWorkflow(workflow.id);

      // The file holds the restored graph and the row records its hash.
      expect((await jsonOf(kind, pathOf("Fox"))).graph).toEqual(
        graphOf(node("a", "hello"))
      );
      expect(after.file_hash).toBe(sha256(await textOf(kind, pathOf("Fox"))));

      const report = await reconcile();

      expect(report).toMatchObject({ unchanged: 1, imported: [], written: [] });
      const stored = await reload(workflow.id);
      expect(stored.graph).toEqual(graphOf(node("a", "hello")));
      expect(stored.updated_at).toBe(after.updated_at);
      expect(
        (await WorkflowVersion.listForWorkflow(workflow.id)).map((v) => v.id)
      ).toEqual(versions.map((v) => v.id));
    });
  });

  describe("triggers", () => {
    it("imports an edited file on the reconcile the asset triggers schedule", async () => {
      const workflow = await makeWorkflow("Fox");
      await editFile(kind, pathOf("Fox"), (file) => {
        file.graph.nodes[0]!.data.value = "seen by the trigger";
      });

      scheduleProjectReconcile(PROJECT, USER);
      await flushProjectReconciles();

      expect((await reload(workflow.id)).graph.nodes[0]).toMatchObject({
        data: { value: "seen by the trigger" }
      });
    });

    it("looks only at the changed paths it is given", async () => {
      const fox = await makeWorkflow("Fox");
      const owl = await makeWorkflow("Owl");
      await editFile(kind, pathOf("Fox"), (file) => {
        file.graph.nodes[0]!.data.value = "fox edit";
      });
      await editFile(kind, pathOf("Owl"), (file) => {
        file.graph.nodes[0]!.data.value = "owl edit";
      });
      const list = vi.spyOn(folder(kind), "list");

      const report = await reconcileDocumentFiles(
        [workflowFileAdapter],
        PROJECT,
        USER,
        { paths: [pathOf("Fox")] }
      );

      expect(report).toMatchObject({ files: 1, imported: [fox.id], missing: [] });
      expect(list).not.toHaveBeenCalled();
      expect((await reload(owl.id)).graph.nodes[0]).toMatchObject({
        data: { value: "hello" }
      });

      // A changed path with nothing at it marks its row missing, and no other.
      await folder(kind).delete(pathOf("Owl"));
      const gone = await reconcileDocumentFiles([workflowFileAdapter], PROJECT, USER, {
        paths: [pathOf("Owl")]
      });
      expect(gone).toMatchObject({ files: 0, missing: [owl.id] });
      expect((await reload(fox.id)).file_error).toBeNull();
    });
  });

  describe("migration", () => {
    /** Workflows as a database from before project folders holds them. */
    async function legacyWorkflows(names: string[]): Promise<Workflow[]> {
      setWorkflowFileSync(null);
      const made: Workflow[] = [];
      for (const name of names) made.push(await makeWorkflow(name));
      setWorkflowFileSync(documentFileSync(workflowFileAdapter));
      return made;
    }

    it("writes one file per project workflow, and a second run writes nothing", async () => {
      const made = await legacyWorkflows(["Fox", "Owl", "Fox"]);
      const elsewhere = await makeWorkflow("Elsewhere", { project_id: OTHER_PROJECT });
      expect(await fileNames(kind)).toEqual([]);

      expect(await migrateWorkflowFiles()).toBe(3);

      expect(await fileNames(kind)).toEqual([
        "Fox-2.workflow.json",
        "Fox.workflow.json",
        "Owl.workflow.json"
      ]);
      for (const workflow of made) {
        const stored = await reload(workflow.id);
        expect(stored.file_path).not.toBeNull();
        const text = await textOf(kind, stored.file_path ?? "");
        expect((JSON.parse(text) as WorkflowFileJson).id).toBe(workflow.id);
        expect(stored.file_hash).toBe(sha256(text));
        // Writing the file is not an edit of the workflow.
        expect(stored.updated_at).toBe(workflow.updated_at);
      }
      expect(await fileNames(kind, OTHER_PROJECT)).toEqual([
        "Elsewhere.workflow.json"
      ]);
      expect((await reload(elsewhere.id)).file_hash).toBe(elsewhere.file_hash);

      const write = vi.spyOn(folder(kind), "write");
      const writeNew = vi.spyOn(folder(kind), "writeNew");
      expect(await migrateWorkflowFiles()).toBe(0);
      expect(write).not.toHaveBeenCalled();
      expect(writeNew).not.toHaveBeenCalled();
      expect(await reconcile()).toMatchObject({ unchanged: 3, written: [], created: [] });
    });

    it("skips a project whose folder is away and writes its files on the next run", async () => {
      await legacyWorkflows(["Fox"]);
      unreachable = true;

      expect(await migrateWorkflowFiles()).toBe(0);

      unreachable = false;
      expect(await migrateWorkflowFiles()).toBe(1);
      expect(await fileNames(kind)).toEqual(["Fox.workflow.json"]);
    });

    it("writes the files of legacy workflows when the project is reconciled", async () => {
      const [fox] = await legacyWorkflows(["Fox"]);

      const report = await reconcile();

      expect(report.written).toEqual([fox?.id]);
      expect(await fileNames(kind)).toEqual(["Fox.workflow.json"]);
      expect(await reconcile()).toMatchObject({ unchanged: 1, written: [] });
    });
  });
});
