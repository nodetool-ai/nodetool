/**
 * The hook that keeps a workflow's file in step with its row. Every write of
 * a workflow row goes through the model, and each one calls the installed
 * sync: create, save, the conditional update and delete. Folders are reached
 * by the sync, so these cases install a recording one.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ModelObserver,
  Workflow,
  computeEtag,
  initTestDb,
  setWorkflowFileSync,
  type DocumentFileLocation
} from "../src/index.js";

const USER = "owner";

interface Call {
  kind: "saved" | "deleted";
  id: string;
  name: string;
  previous?: DocumentFileLocation | null;
}

let calls: Call[];

/** A sync that records each call and files the row under its name. */
function recordingSync(): void {
  setWorkflowFileSync({
    async saved(row, previous) {
      calls.push({ kind: "saved", id: row.id, name: row.name, previous });
      const state = {
        file_path: `Workflows/${row.name}.workflow.json`,
        file_hash: `hash of ${row.name}`
      };
      await Workflow.setFileState(row.id, state);
      Object.assign(row, state);
    },
    async deleted(row) {
      calls.push({ kind: "deleted", id: row.id, name: row.name });
    }
  });
}

function makeWorkflow(fields: Record<string, unknown> = {}): Promise<Workflow> {
  return Workflow.create<Workflow>({
    user_id: USER,
    name: "Fox",
    graph: { nodes: [], edges: [] },
    ...fields
  });
}

async function reload(id: string): Promise<Workflow> {
  const found = (await Workflow.getManyByIds([id])).get(id);
  if (!found) throw new Error(`workflow ${id} is gone`);
  return found;
}

beforeEach(() => {
  initTestDb();
  calls = [];
  recordingSync();
});

afterEach(() => {
  setWorkflowFileSync(null);
  ModelObserver.clear();
});

describe("the workflow file sync hook", () => {
  it("is called after create, save, conditional update and delete", async () => {
    const workflow = await makeWorkflow();
    workflow.description = "saved";
    await workflow.save();
    const updated = await Workflow.updateFieldsIfUnchanged(
      workflow.id,
      workflow.updated_at,
      { name: "Arctic fox" }
    );
    await updated?.delete();

    expect(calls).toEqual([
      { kind: "saved", id: workflow.id, name: "Fox", previous: null },
      { kind: "saved", id: workflow.id, name: "Fox", previous: null },
      { kind: "saved", id: workflow.id, name: "Arctic fox", previous: null },
      { kind: "deleted", id: workflow.id, name: "Arctic fox" }
    ]);
    // The returned row carries what the sync recorded.
    expect(updated?.file_path).toBe("Workflows/Arctic fox.workflow.json");
  });

  it("is not called when a conditional update finds the row changed", async () => {
    const workflow = await makeWorkflow();
    calls = [];

    const stale = await Workflow.updateFieldsIfUnchanged(
      workflow.id,
      "1999-01-01T00:00:00.000Z",
      { name: "Never" }
    );

    expect(stale).toBeNull();
    expect(calls).toEqual([]);
  });

  it("names the file a workflow had in the project it left", async () => {
    const workflow = await makeWorkflow({ project_id: "project-a" });
    calls = [];

    // Through the conditional update, which reads the row first.
    const moved = await Workflow.updateFieldsIfUnchanged(
      workflow.id,
      workflow.updated_at,
      { project_id: "project-b" }
    );
    // Through an instance loaded from the database.
    const loaded = await reload(workflow.id);
    loaded.project_id = "project-c";
    await loaded.save();
    // A save that keeps the project names no previous file.
    await loaded.save();

    const location = { file_path: "Workflows/Fox.workflow.json" };
    expect(moved).not.toBeNull();
    expect(calls.map((call) => call.previous)).toEqual([
      { project_id: "project-a", ...location },
      { project_id: "project-b", ...location },
      null
    ]);
  });

  it("records the file without changing updated_at or announcing a change", async () => {
    const workflow = await makeWorkflow();
    const events: string[] = [];
    ModelObserver.subscribe((_instance, event) => events.push(event), "Workflow");

    await Workflow.setFileState(workflow.id, {
      file_path: "Workflows/Fox.workflow.json",
      file_hash: "a".repeat(64),
      file_error: "File missing"
    });

    const stored = await reload(workflow.id);
    expect(stored).toMatchObject({
      file_path: "Workflows/Fox.workflow.json",
      file_hash: "a".repeat(64),
      file_error: "File missing"
    });
    expect(stored.updated_at).toBe(workflow.updated_at);
    expect(events).toEqual([]);
  });

  it("keeps the recorded file state when no sync is installed", async () => {
    const workflow = await makeWorkflow();
    expect(workflow.file_hash).toBe("hash of Fox");
    setWorkflowFileSync(null);

    // The hash still names the file as it was last synced. A reconcile on a
    // host that has the sync compares the file with it and never takes an
    // edited file for an untouched one.
    const updated = await Workflow.updateFieldsIfUnchanged(
      workflow.id,
      workflow.updated_at,
      { description: "from a host that writes no files" }
    );
    expect(updated).toMatchObject({
      file_path: "Workflows/Fox.workflow.json",
      file_hash: "hash of Fox"
    });
    const again = await reload(workflow.id);
    again.description = "saved without a sync";
    await again.save();
    expect(await reload(workflow.id)).toMatchObject({
      description: "saved without a sync",
      file_path: "Workflows/Fox.workflow.json",
      file_hash: "hash of Fox"
    });
  });

  it("leaves the file state out of the etag", async () => {
    setWorkflowFileSync(null);
    const workflow = await makeWorkflow();
    const etag = workflow.getEtag();
    // The etag a workflow had before it had a file: the row without the
    // three columns that describe the file.
    const {
      file_path: _path,
      file_hash: _hash,
      file_error: _error,
      ...content
    } = workflow.toRow();
    expect(etag).toBe(computeEtag(content));

    // Writing, importing and losing the file change the row, not the etag.
    await Workflow.setFileState(workflow.id, {
      file_path: "Workflows/Fox.workflow.json",
      file_hash: "a".repeat(64)
    });
    expect((await reload(workflow.id)).getEtag()).toBe(etag);
    await Workflow.setFileState(workflow.id, { file_error: "File missing" });
    expect((await reload(workflow.id)).getEtag()).toBe(etag);

    // The sync records the file on the instance after the save was announced.
    recordingSync();
    const announced: string[] = [];
    ModelObserver.subscribe(
      (instance) => announced.push(instance.getEtag()),
      "Workflow"
    );
    const created = await makeWorkflow({ name: "Owl" });
    expect(created.file_path).toBe("Workflows/Owl.workflow.json");
    expect(announced).toEqual([created.getEtag()]);
    expect((await reload(created.id)).getEtag()).toBe(created.getEtag());

    // Content still changes it.
    const changed = await Workflow.updateFieldsIfUnchanged(
      workflow.id,
      workflow.updated_at,
      { description: "changed" }
    );
    expect(changed?.getEtag()).not.toBe(etag);
  });

  it("lists the projects that hold a workflow with no file", async () => {
    setWorkflowFileSync(null);
    await makeWorkflow({ project_id: "project-a" });
    await makeWorkflow({ project_id: "project-a" });
    await makeWorkflow({ project_id: "project-b" });
    recordingSync();
    await makeWorkflow({ project_id: "project-c" });

    const projects = await Workflow.projectsWithUnwrittenFiles();

    expect(
      projects.map((project) => project.project_id).sort()
    ).toEqual(["project-a", "project-b"]);
    expect(projects.every((project) => project.user_id === USER)).toBe(true);
    expect(
      (await Workflow.listForProjects(USER, ["project-a", "project-c"])).length
    ).toBe(3);
    expect(await Workflow.listForProjects(USER, [])).toEqual([]);
  });
});
