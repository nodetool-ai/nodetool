/**
 * The `nodes` capability module.
 *
 * Same three obligations as every ported namespace — drift-clean, classified
 * the way the gate's own map classifies it, wire-identical to the deprecated
 * `Tool` subclasses — plus the one thing the port changed: the registry is a
 * run field now, so a run without one has to refuse rather than crash.
 */

import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeMetadata, NodeRegistry } from "@nodetool-ai/node-sdk";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import {
  NODE_CAPABILITIES,
  module as nodesModule
} from "../src/capabilities/nodes.js";
import { capabilityModuleIssues } from "../src/capabilities/registry.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import type { CapabilityRun } from "../src/capabilities/types.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import type { Tool } from "../src/tools/base-tool.js";

/**
 * One capability as a `Tool`. The registry that used to be a constructor
 * argument is a run field, read at call time.
 */
function capTool(name: string, registry?: NodeRegistry): Tool {
  return toolForCapabilityName(name, (context) =>
    createCapabilityRun({ context, gate: UNGATED, nodeRegistry: registry })
  );
}

const ctx = {} as unknown as ProcessingContext;

function createMetadata(overrides: Partial<NodeMetadata> = {}): NodeMetadata {
  return {
    title: "Test Node",
    description: "A test node for unit testing.",
    namespace: "test",
    node_type: "test.TestNode",
    properties: [
      {
        name: "input",
        type: { type: "str", type_args: [] },
        default: "",
        title: "Input"
      }
    ],
    outputs: [{ name: "output", type: { type: "str", type_args: [] } }],
    ...overrides
  } as NodeMetadata;
}

/** The structural registry the local-tool tests already drive these with. */
function mockRegistry(metadataList: NodeMetadata[]): NodeRegistry {
  return {
    listMetadata: () => metadataList,
    getMetadata: (nodeType: string) =>
      metadataList.find((m) => m.node_type === nodeType) ?? undefined
  } as unknown as NodeRegistry;
}

const NODES = [
  createMetadata({
    node_type: "nodetool.text.Concat",
    namespace: "nodetool.text",
    title: "Concat"
  }),
  createMetadata({
    node_type: "nodetool.image.Resize",
    namespace: "nodetool.image",
    title: "Resize"
  })
];

function runWith(registry?: NodeRegistry): CapabilityRun {
  return createCapabilityRun({
    context: ctx,
    gate: UNGATED,
    nodeRegistry: registry
  });
}

function capability(name: string) {
  const entry = NODE_CAPABILITIES.find((e) => e.spec.name === name);
  if (!entry) throw new Error(`no capability named ${name}`);
  return entry;
}

describe("nodes module shape", () => {
  it("is drift-clean", () => {
    expect(capabilityModuleIssues("nodes", nodesModule)).toEqual([]);
  });

  it("classifies every export the way the gate's own map does", () => {
    for (const entry of NODE_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("exports the three catalog capabilities", () => {
    // `run_node` is the namespace's fourth. Its single-node runner is a
    // closure only `packages/websocket` can build, so the host supplies it
    // through the run's `capabilities` option instead of the registry.
    expect(NODE_CAPABILITIES.map((e) => e.spec.name)).toEqual([
      "list_nodes",
      "search_nodes",
      "get_node_info"
    ]);
  });
});

describe("wire identity: a Tool built from the spec", () => {
  const registry = mockRegistry(NODES);
  const pairs: Array<[string, Tool]> = [
    ["list_nodes", capTool("list_nodes", registry)],
    ["search_nodes", capTool("search_nodes", registry)],
    ["get_node_info", capTool("get_node_info", registry)]
  ];

  for (const [name, tool] of pairs) {
    it(`${name} keeps its name, description and input schema`, () => {
      const { spec } = capability(name);
      expect(tool.name).toBe(spec.name);
      expect(tool.description).toBe(spec.description);
      expect(tool.inputSchema).toEqual(spec.inputSchema);
    });
  }

  it("carries the userMessage templates over", () => {
    expect(
      capTool("list_nodes", registry).userMessage({
        namespace: "nodetool.text"
      })
    ).toBe("Listing nodes in namespace nodetool.text");
    expect(capTool("list_nodes", registry).userMessage({})).toBe(
      "Listing available nodes"
    );
    expect(
      capTool("search_nodes", registry).userMessage({ query: ["a", "b"] })
    ).toBe("Searching for nodes: a, b");
    expect(
      capTool("get_node_info", registry).userMessage({
        node_type: "nodetool.text.Concat"
      })
    ).toBe("Getting info for node type nodetool.text.Concat");
  });
});

describe("the node capabilities read the run's registry", () => {
  it("lists node types and counts namespaces", async () => {
    const result = (await capability("list_nodes").impl(
      runWith(mockRegistry(NODES)),
      {}
    )) as Record<string, unknown>;
    expect(result["total"]).toBe(2);
    expect(result["namespaces"]).toEqual({
      "nodetool.text": 1,
      "nodetool.image": 1
    });
  });

  it("filters by namespace prefix", async () => {
    const result = (await capability("list_nodes").impl(
      runWith(mockRegistry(NODES)),
      { namespace: "nodetool.text" }
    )) as { total: number };
    expect(result.total).toBe(1);
  });

  it("ranks a search and rejects an empty query", async () => {
    const run = runWith(mockRegistry(NODES));
    const ranked = (await capability("search_nodes").impl(run, {
      query: ["concat"]
    })) as { total: number; results: Array<{ type: string }> };
    expect(ranked.results[0].type).toBe("nodetool.text.Concat");

    expect(await capability("search_nodes").impl(run, { query: [] })).toEqual({
      status: "error",
      errors: ["query must be a non-empty array"]
    });
  });

  it("returns full metadata, and an error for an unknown type", async () => {
    const run = runWith(mockRegistry(NODES));
    const info = (await capability("get_node_info").impl(run, {
      node_type: "nodetool.text.Concat"
    })) as Record<string, unknown>;
    expect(info["node_type"]).toBe("nodetool.text.Concat");
    expect(info["properties"]).toEqual([
      {
        name: "input",
        type: "str",
        default: "",
        description: undefined,
        required: false,
        min: undefined,
        max: undefined,
        values: undefined
      }
    ]);

    const missing = (await capability("get_node_info").impl(run, {
      node_type: "nope.Nope"
    })) as { status: string };
    expect(missing.status).toBe("error");
  });

  it("refuses when the run carries no registry", async () => {
    for (const name of ["list_nodes", "search_nodes", "get_node_info"]) {
      const result = (await capability(name).impl(runWith(), {
        query: ["x"],
        node_type: "a.B"
      })) as Record<string, unknown>;
      expect(result["error"]).toMatch(/no node registry is available/);
      expect(result["ran"]).toBe(false);
    }
  });

  it("runs through a Tool whose run binds the registry", async () => {
    const result = (await capTool("list_nodes", mockRegistry(NODES)).process(
      ctx,
      {}
    )) as { total: number };
    expect(result.total).toBe(2);
  });
});
