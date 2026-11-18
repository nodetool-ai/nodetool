/**
 * The guest reads workflow ids in their 12-character form (`compactResourceIds`
 * shortens every id a capability returns), so every workflow capability must
 * accept that form back. Looking the workflow up by prefix is not enough: the
 * write, and every version row keyed on the workflow, must use the row's full
 * id. A guarded write keyed on the prefix matched no row and answered
 * "changed since you read it" on every attempt.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Workflow, WorkflowVersion, initTestDb } from "@nodetool-ai/models";
import { shortResourceId } from "@nodetool-ai/protocol";
import {
  addWorkflowLink,
  createWorkflowVersion,
  getWorkflowVersion,
  listWorkflowVersions,
  removeWorkflowLink,
  restoreWorkflowVersion,
  deleteWorkflowVersion,
  setWorkflowAccess,
  updateWorkflow
} from "../src/capabilities/workflows.js";
import {
  UNGATED,
  createCapabilityRun,
  toolFromCapability
} from "../src/capabilities/index.js";
import type { CapabilityExport } from "../src/capabilities/types.js";

const USER = "user-short-ids";
const ctx = { userId: USER } as unknown as ProcessingContext;

const NODES = [
  { id: "a", type: "nodetool.constant.String", data: {} },
  { id: "b", type: "nodetool.constant.String", data: {} }
];

function call(entry: CapabilityExport, args: Record<string, unknown>) {
  return toolFromCapability(entry.spec, entry.impl, () =>
    createCapabilityRun({ context: ctx, gate: UNGATED })
  ).process(ctx, args) as Promise<Record<string, unknown>>;
}

async function makeWorkflow(): Promise<Workflow> {
  return (await Workflow.create({
    user_id: USER,
    name: "Cover Art",
    description: "",
    tags: [],
    access: "private",
    graph: { nodes: NODES, edges: [] },
    run_mode: "workflow"
  })) as Workflow;
}

beforeEach(() => {
  initTestDb();
});

describe("workflow capabilities called with a 12-character id", () => {
  it("update_workflow writes the row, twice in a row", async () => {
    const wf = await makeWorkflow();
    const short = shortResourceId(wf.id);
    expect(short).not.toBe(wf.id);

    const first = await call(updateWorkflow, { workflow_id: short, name: "Daily Digest" });
    expect(first.error).toBeUndefined();
    const second = await call(updateWorkflow, { workflow_id: short, tags: ["v2"] });
    expect(second.error).toBeUndefined();

    const stored = await Workflow.get<Workflow>(wf.id);
    expect(stored?.name).toBe("Daily Digest");
    expect(stored?.tags).toEqual(["v2"]);
  });

  it("add_workflow_link and remove_workflow_link write the row", async () => {
    const wf = await makeWorkflow();
    const short = shortResourceId(wf.id);
    const added = await call(addWorkflowLink, { workflow_id: short, source: "a", target: "b" });
    expect(added.error).toBeUndefined();
    const linkId = (added.link as { id: string }).id;
    const removed = await call(removeWorkflowLink, { workflow_id: short, link_id: linkId });
    expect(removed.error).toBeUndefined();
  });

  it("set_workflow_access writes the row", async () => {
    const wf = await makeWorkflow();
    const answer = await call(setWorkflowAccess, { workflow_id: shortResourceId(wf.id), access: "public" });
    expect(answer.error).toBeUndefined();
    expect((await Workflow.get<Workflow>(wf.id))?.access).toBe("public");
  });

  it("keys versions on the full id and restores through the short one", async () => {
    const wf = await makeWorkflow();
    const short = shortResourceId(wf.id);

    const saved = await call(createWorkflowVersion, { workflow_id: short, name: "first" });
    expect(saved.error).toBeUndefined();
    const listedByFull = await WorkflowVersion.listForWorkflow(wf.id, { limit: 10 });
    expect(listedByFull.map((v) => v.version)).toEqual([saved.version]);

    const listed = await call(listWorkflowVersions, { workflow_id: short });
    expect((listed.versions as unknown[]).length).toBe(1);
    const got = await call(getWorkflowVersion, { workflow_id: short, version: saved.version });
    expect(got.error).toBeUndefined();

    await call(updateWorkflow, { workflow_id: short, graph: { nodes: [NODES[0]], edges: [] } });
    const restored = await call(restoreWorkflowVersion, { workflow_id: short, version: saved.version });
    expect(restored.error).toBeUndefined();
    const graph = (await Workflow.get<Workflow>(wf.id))?.graph as { nodes: unknown[] };
    expect(graph.nodes).toHaveLength(2);

    const deleted = await call(deleteWorkflowVersion, { workflow_id: short, version: saved.version });
    expect(deleted.error).toBeUndefined();
  });
});
