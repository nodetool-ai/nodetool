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
import {
  NODE_CAPABILITIES,
  module as nodesModule
} from "../src/capabilities/nodes.js";
import {
  capabilityCategoryFor,
  capabilityModuleIssues
} from "../src/capabilities/registry.js";
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
        capabilityCategoryFor(entry.spec.name)
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
      errors: [
        "query must be a search string or a non-empty array of them, " +
          'e.g. ["web search"] or "web search".'
      ]
    });
  });

  /**
   * The schema says `string[]`, so a model that sent the bare string
   * `"serpapi"` used to have it accepted and scored one **character** at a
   * time: a string is iterable, and every node whose text held an "s", an "e"
   * or an "r" matched. The live registry answered that query with 322 results
   * led by `CompareImages` at score 133 — noise the caller could not tell
   * from a ranked answer.
   */
  it("reads a lone string query as one term, not as its characters", async () => {
    const run = runWith(mockRegistry(NODES));
    const chars = (await capability("search_nodes").impl(run, {
      query: "serpapi"
    })) as { total: number; note?: string };
    expect(chars.total).toBe(0);
    expect(chars.note).toContain("No node matched 'serpapi'");

    const phrase = (await capability("search_nodes").impl(run, {
      query: "concat"
    })) as { total: number; results: Array<{ type: string }> };
    expect(phrase.results[0].type).toBe("nodetool.text.Concat");
  });

  it("refuses a query that is neither a string nor an array", async () => {
    const run = runWith(mockRegistry(NODES));
    const answer = (await capability("search_nodes").impl(run, {
      query: { term: "concat" }
    })) as { status: string };
    expect(answer.status).toBe("error");
  });

  it("says why a search found nothing", async () => {
    const run = runWith(mockRegistry(NODES));
    const answer = (await capability("search_nodes").impl(run, {
      query: ["serpapi"]
    })) as { total: number; results: unknown[]; note?: string };
    expect(answer.total).toBe(0);
    expect(answer.results).toEqual([]);
    expect(answer.note).toContain("include_provider_nodes");
  });

  /**
   * `{total: 0, namespaces: {}, nodes: []}` reads the same whether the
   * namespace is empty or does not exist, and leaves the caller nowhere to go
   * — the transcript this came from asked for `nodetool.web`, got that, and
   * never recovered.
   */
  it("names the real namespaces when the filter matches nothing", async () => {
    const answer = (await capability("list_nodes").impl(
      runWith(mockRegistry(NODES)),
      { namespace: "nodetool.web" }
    )) as { total: number; note?: string; available_namespaces?: string[] };
    expect(answer.total).toBe(0);
    expect(answer.note).toContain(
      "No node type is registered under namespace 'nodetool.web'"
    );
    expect(answer.available_namespaces).toContain("nodetool.text");
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
