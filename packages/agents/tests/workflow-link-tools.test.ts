/**
 * Lineage links: `add_workflow_link` / `remove_workflow_link` and the way
 * `update_workflow` treats `graph.links`. A link carries no value, so the
 * stored nodes and edges must be untouched by every call here.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Workflow, initTestDb } from "@nodetool-ai/models";
import {
  addWorkflowLink,
  removeWorkflowLink,
  updateWorkflow
} from "../src/capabilities/workflows.js";
import {
  UNGATED,
  createCapabilityRun,
  toolFromCapability
} from "../src/capabilities/index.js";
import type { CapabilityExport } from "../src/capabilities/types.js";

const USER = "user-links";
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

async function makeWorkflow(userId = USER): Promise<Workflow> {
  return (await Workflow.create({
    user_id: userId,
    name: "wf",
    description: "",
    tags: [],
    access: "private",
    graph: { nodes: NODES, edges: [] },
    run_mode: "workflow"
  })) as Workflow;
}

async function storedGraph(id: string) {
  return (await Workflow.get<Workflow>(id))?.graph as unknown as {
    nodes: unknown[];
    edges: unknown[];
    links?: Array<{ id: string; source: string; target: string }>;
  };
}

beforeEach(() => {
  initTestDb();
});

describe("add_workflow_link", () => {
  it("stores a link beside nodes and edges and returns its id", async () => {
    const wf = await makeWorkflow();
    const answer = await call(addWorkflowLink, {
      workflow_id: wf.id,
      source: "a",
      target: "b",
      label: "reference"
    });
    expect(answer.error).toBeUndefined();
    const link = answer.link as { id: string };
    expect(link.id).toMatch(/^[0-9a-f]{32}$/);

    const graph = await storedGraph(wf.id);
    expect(graph.links).toHaveLength(1);
    expect(graph.links?.[0]).toMatchObject({ source: "a", target: "b" });
    expect(graph.nodes).toEqual(NODES);
    expect(graph.edges).toEqual([]);
  });

  it("returns the existing link for a repeated source, target and kind", async () => {
    const wf = await makeWorkflow();
    const first = await call(addWorkflowLink, {
      workflow_id: wf.id,
      source: "a",
      target: "b"
    });
    const second = await call(addWorkflowLink, {
      workflow_id: wf.id,
      source: "a",
      target: "b"
    });
    expect((second.link as { id: string }).id).toBe(
      (first.link as { id: string }).id
    );
    expect((await storedGraph(wf.id)).links).toHaveLength(1);
  });

  it("refuses an unknown node and a self link", async () => {
    const wf = await makeWorkflow();
    const unknown = await call(addWorkflowLink, {
      workflow_id: wf.id,
      source: "a",
      target: "missing"
    });
    expect(String(unknown.error)).toContain("missing");
    const self = await call(addWorkflowLink, {
      workflow_id: wf.id,
      source: "a",
      target: "a"
    });
    expect(String(self.error)).toContain("two different nodes");
    expect((await storedGraph(wf.id)).links).toBeUndefined();
  });

  it("refuses a workflow the caller does not own", async () => {
    const theirs = await makeWorkflow("someone-else");
    const answer = await call(addWorkflowLink, {
      workflow_id: theirs.id,
      source: "a",
      target: "b"
    });
    expect(String(answer.error)).toContain("not yours");
  });
});

describe("remove_workflow_link", () => {
  it("removes by id and reports an unknown id", async () => {
    const wf = await makeWorkflow();
    const added = await call(addWorkflowLink, {
      workflow_id: wf.id,
      source: "a",
      target: "b"
    });
    const linkId = (added.link as { id: string }).id;

    const missing = await call(removeWorkflowLink, {
      workflow_id: wf.id,
      link_id: "nope"
    });
    expect(String(missing.error)).toContain("not found");

    const removed = await call(removeWorkflowLink, {
      workflow_id: wf.id,
      link_id: linkId
    });
    expect(removed.removed).toBe(true);
    expect((await storedGraph(wf.id)).links).toBeUndefined();
  });
});

describe("update_workflow with links", () => {
  async function linked() {
    const wf = await makeWorkflow();
    await call(addWorkflowLink, { workflow_id: wf.id, source: "a", target: "b" });
    return wf;
  }

  it("keeps stored links when the replacement graph names none", async () => {
    const wf = await linked();
    const answer = await call(updateWorkflow, {
      workflow_id: wf.id,
      graph: { nodes: NODES, edges: [] }
    });
    expect(answer.error).toBeUndefined();
    expect((await storedGraph(wf.id)).links).toHaveLength(1);
  });

  it("drops links whose node the replacement graph removed", async () => {
    const wf = await linked();
    await call(updateWorkflow, {
      workflow_id: wf.id,
      graph: { nodes: [NODES[0]], edges: [] }
    });
    expect((await storedGraph(wf.id)).links).toBeUndefined();
  });
});
