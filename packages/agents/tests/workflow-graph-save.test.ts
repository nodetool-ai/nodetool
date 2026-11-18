/**
 * The checks a workflow graph passes before it is stored
 * (`workflow-graph-save.ts`). `create_workflow`, `update_workflow` and the
 * import of a workflow file in a project folder share them, so each refuses
 * the same graph with the same error.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Workflow, initTestDb } from "@nodetool-ai/models";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  prepareWorkflowGraphForSave,
  unknownNodeTypeError
} from "../src/workflow-graph-save.js";

const USER = "user-graph-save";
const KNOWN = "nodetool.constant.String";

const registry = {
  availability: (type: string) =>
    type === KNOWN
      ? "executable"
      : type === "pack.Installable"
        ? "catalog"
        : type === "python.Node"
          ? "python"
          : "unknown",
  has: (type: string) => type === KNOWN,
  getMetadata: () => undefined,
  validateNode: () => []
} as unknown as NodeRegistry;

function run(): ReturnType<typeof createCapabilityRun> {
  return createCapabilityRun({
    context: { userId: USER } as unknown as ProcessingContext,
    gate: UNGATED,
    nodeRegistry: registry
  });
}

const UNKNOWN_GRAPH = {
  nodes: [
    { id: "a", type: KNOWN, properties: { value: "x" } },
    { id: "b", type: "nodetool.missing.Node", properties: {} }
  ],
  edges: []
};

beforeEach(() => {
  initTestDb();
});

describe("unknownNodeTypeError", () => {
  it("refuses a type the registry does not have and a node with no type", () => {
    expect(
      unknownNodeTypeError(
        { nodes: [{ id: "a", type: "nodetool.missing.Node" }, { id: "b" }] },
        registry
      )
    ).toEqual({
      error:
        "The graph names node types that do not exist. Use search_nodes to " +
        "find the node type and retry.",
      issues: [
        {
          code: "unknown_node",
          node_id: "a",
          node_type: "nodetool.missing.Node",
          message: 'Unknown node type "nodetool.missing.Node" on node "a"'
        },
        { code: "unknown_node", node_id: "b", message: 'Node "b" has no type' }
      ]
    });
  });

  it("accepts installed, Python, installable-pack and editor-only nodes", () => {
    expect(
      unknownNodeTypeError(
        {
          nodes: [
            { id: "a", type: KNOWN },
            { id: "b", type: "python.Node" },
            { id: "c", type: "pack.Installable" },
            { id: "d", type: "nodetool.workflows.base_node.Comment" }
          ]
        },
        registry
      )
    ).toBeNull();
  });
});

describe("create_workflow and update_workflow", () => {
  it("refuse a graph with an unknown node type, with one error", async () => {
    const created = (await run().invoke("create_workflow", {
      name: "wf",
      graph: UNKNOWN_GRAPH
    })) as Record<string, unknown>;
    const existing = await Workflow.create<Workflow>({
      user_id: USER,
      name: "wf",
      graph: { nodes: [], edges: [] }
    });
    const updated = (await run().invoke("update_workflow", {
      workflow_id: existing.id,
      graph: UNKNOWN_GRAPH
    })) as Record<string, unknown>;

    expect(created["error"]).toMatch(/node types that do not exist/);
    expect(updated).toEqual(created);
    // Nothing was stored.
    expect((await Workflow.paginate(USER))[0]).toHaveLength(1);
    const [stored] = (await Workflow.getManyByIds([existing.id])).values();
    expect(stored?.graph.nodes).toEqual([]);
  });

  it("store edge handles given in snake_case under their camelCase names", async () => {
    // validate_workflow reads `source_handle` and `target_handle`, so a graph
    // it accepts must not lose them on save: the stored edge once read
    // sourceHandle "output" and had no targetHandle at all.
    const node = UNKNOWN_GRAPH.nodes[0];
    const created = (await run().invoke("create_workflow", {
      name: "snake",
      graph: {
        nodes: [node, { ...node, id: "b" }],
        edges: [{ id: "e1", source: node.id, source_handle: "text", target: "b", target_handle: "value" }]
      }
    })) as Record<string, unknown>;
    expect(created["error"]).toBeUndefined();

    const [stored] = (await Workflow.getManyByIds([String(created["id"])])).values();
    const [edge] = stored?.graph.edges ?? [];
    expect(edge).toMatchObject({ source: node.id, sourceHandle: "text", target: "b", targetHandle: "value" });
    expect(edge).not.toHaveProperty("source_handle");
    expect(edge).not.toHaveProperty("target_handle");
  });

  it("store a graph whose node types the registry has", async () => {
    const created = (await run().invoke("create_workflow", {
      name: "wf",
      graph: { nodes: [UNKNOWN_GRAPH.nodes[0]], edges: [] }
    })) as Record<string, unknown>;

    expect(created["error"]).toBeUndefined();
  });
});

describe("prepareWorkflowGraphForSave", () => {
  const authored = {
    nodes: [
      {
        id: "a",
        type: KNOWN,
        data: { value: "x" },
        ui_properties: { position: { x: 512, y: 256 }, color: "red" }
      },
      { id: "b", type: KNOWN, properties: { value: "y" } }
    ],
    edges: []
  };

  it("lays every node out anew for an authored graph", async () => {
    const prepared = await prepareWorkflowGraphForSave(authored, {
      nodeRegistry: registry
    });

    expect(prepared).toMatchObject({
      ok: true,
      graph: {
        nodes: [
          { id: "a", ui_properties: { position: { x: 0, y: 0 }, color: "red" } },
          { id: "b", data: { value: "y" } }
        ]
      }
    });
  });

  it("keeps the layout a graph came with, and places a node that has none", async () => {
    const prepared = await prepareWorkflowGraphForSave(authored, {
      nodeRegistry: registry,
      keepLayout: true
    });

    expect(prepared.ok).toBe(true);
    const nodes = (prepared as { graph: { nodes: Array<Record<string, unknown>> } })
      .graph.nodes;
    // Written as it was: no default is added to it.
    expect(nodes[0]?.["ui_properties"]).toEqual({
      position: { x: 512, y: 256 },
      color: "red"
    });
    expect(nodes[1]).toMatchObject({
      data: { value: "y" },
      ui_properties: { position: { x: expect.any(Number), y: expect.any(Number) } }
    });
  });

  it("drops the links of the stored graph only when the graph names its own", async () => {
    const stored = {
      links: [{ id: "l1", source: "a", target: "b", label: null, kind: null }]
    };
    const kept = await prepareWorkflowGraphForSave(authored, { stored });
    const replaced = await prepareWorkflowGraphForSave(
      { ...authored, links: [] },
      { stored }
    );
    const whole = await prepareWorkflowGraphForSave(authored, { stored: undefined });

    expect(kept).toMatchObject({ ok: true, graph: { links: stored.links } });
    expect(replaced.ok && replaced.graph).not.toHaveProperty("links");
    expect(whole.ok && whole.graph).not.toHaveProperty("links");
  });
});
