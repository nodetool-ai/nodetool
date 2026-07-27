/**
 * Typed dynamic slots — kernel enforcement (Phase 2 of
 * docs/superpowers/specs/2026-07-26-typed-dynamic-slots-design.md).
 *
 * Covers the helper, the actor's merge points, graph round-tripping of
 * `dynamic_inputs`, and the graph-utils type lookup.
 */

import { describe, it, expect } from "vitest";
import type { NodeDescriptor } from "@nodetool-ai/protocol";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import type { NodeAnalysis } from "../src/correlation-analysis.js";
import { Graph } from "../src/graph.js";
import { getInputTypeString } from "../src/graph-utils.js";
import {
  applyDynamicSlotTypes,
  dynamicSlotPropertyTypes,
  dynamicSlotTypeString,
  getDynamicSlotTypeString
} from "../src/dynamic-slots.js";

const EMPTY_ANALYSIS: NodeAnalysis = {
  invocationScope: [],
  inputs: new Map(),
  outputs: new Map()
};

function makeNode(overrides: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return { id: "dyn_node", type: "test.Dynamic", ...overrides };
}

function trackingExecutor(): {
  executor: NodeExecutor;
  calls: Array<Record<string, unknown>>;
} {
  const calls: Array<Record<string, unknown>> = [];
  return {
    executor: {
      async process(inputs) {
        calls.push(inputs);
        return { result: "ok" };
      }
    },
    calls
  };
}

async function runWithEdgeValue(
  node: NodeDescriptor,
  handle: string,
  value: unknown
): Promise<{
  calls: Array<Record<string, unknown>>;
  error: string | undefined;
}> {
  const inbox = new NodeInbox();
  inbox.addUpstream(handle, 1);
  const { executor, calls } = trackingExecutor();
  const actor = new NodeActor({
    node,
    inbox,
    executor,
    correlation: EMPTY_ANALYSIS,
    sendOutputs: async () => {},
    emitMessage: () => {}
  });
  await inbox.put(handle, value);
  inbox.markSourceDone(handle);
  const result = await actor.run();
  return { calls, error: result.error };
}

describe("dynamicSlotTypeString", () => {
  it("reads the wire form, nested args included", () => {
    expect(
      dynamicSlotTypeString({
        type: { type: "list", type_args: [{ type: "image" }] }
      })
    ).toBe("list[image]");
  });

  it("reads a bare type string", () => {
    expect(dynamicSlotTypeString({ type: "str" as never })).toBe("str");
  });

  it("returns undefined for a declaration with no usable type", () => {
    expect(dynamicSlotTypeString(undefined)).toBeUndefined();
    expect(dynamicSlotTypeString({ type: {} })).toBeUndefined();
  });

  it("maps declarations to a propertyTypes-shaped record", () => {
    expect(
      dynamicSlotPropertyTypes({
        pic: { type: { type: "image" } },
        broken: { type: {} }
      })
    ).toEqual({ pic: "image" });
  });

  it("resolves a slot type by handle, undefined for undeclared", () => {
    const node = makeNode({
      dynamic_inputs: { pic: { type: { type: "image" } } }
    });
    expect(getDynamicSlotTypeString(node, "pic")).toBe("image");
    expect(getDynamicSlotTypeString(node, "other")).toBeUndefined();
  });
});

describe("applyDynamicSlotTypes", () => {
  it("passes an untouched bag through when nothing is declared", () => {
    const node = makeNode();
    const inputs = { a: 1, b: "x" };
    expect(applyDynamicSlotTypes(node, inputs)).toBe(inputs);
  });

  it("leaves undeclared keys alone on a node with other declarations", () => {
    const node = makeNode({
      dynamic_inputs: { pic: { type: { type: "image" } } }
    });
    const inputs = { legacy: "anything" };
    expect(applyDynamicSlotTypes(node, inputs)).toBe(inputs);
  });

  it("treats an `any` slot as untyped", () => {
    const node = makeNode({
      dynamic_inputs: { slot: { type: { type: "any" } } }
    });
    const inputs = { slot: 42 };
    expect(applyDynamicSlotTypes(node, inputs)).toBe(inputs);
  });

  it("skips a slot whose value is null", () => {
    const node = makeNode({
      dynamic_inputs: { pic: { type: { type: "image" } } }
    });
    expect(applyDynamicSlotTypes(node, { pic: null })).toEqual({ pic: null });
  });
});

describe("NodeActor – typed dynamic slots", () => {
  it("errors on an incompatible edge value, naming slot/expected/received", async () => {
    const node = makeNode({
      dynamic_inputs: { pic: { type: { type: "image" } } }
    });
    const { calls, error } = await runWithEdgeValue(
      node,
      "pic",
      "not-an-image"
    );

    expect(calls).toHaveLength(0);
    expect(error).toBe(
      'Dynamic input "pic" on node "dyn_node" (test.Dynamic) expects type ' +
        "image but received str"
    );
  });

  it("accepts an int for a float slot (numeric widening)", async () => {
    const node = makeNode({
      dynamic_inputs: { amount: { type: { type: "float" } } }
    });
    const { calls, error } = await runWithEdgeValue(node, "amount", 3);

    expect(error).toBeUndefined();
    expect(calls).toEqual([{ amount: 3 }]);
  });

  it("wraps a scalar for a list[T] slot", async () => {
    const node = makeNode({
      dynamic_inputs: {
        pics: { type: { type: "list", type_args: [{ type: "image" }] } }
      }
    });
    const { calls, error } = await runWithEdgeValue(node, "pics", {
      type: "image",
      uri: "http://x/1.png"
    });

    expect(error).toBeUndefined();
    expect(calls[0].pics).toEqual([{ type: "image", uri: "http://x/1.png" }]);
  });

  it("errors when the wrapped element still does not fit the list slot", async () => {
    const node = makeNode({
      dynamic_inputs: {
        pics: { type: { type: "list", type_args: [{ type: "image" }] } }
      }
    });
    const { error } = await runWithEdgeValue(node, "pics", "nope");

    expect(error).toContain('Dynamic input "pics"');
    expect(error).toContain("expects type list[image]");
    expect(error).toContain("received list[str]");
  });

  it("checks a dynamic_properties value with no incoming edge", async () => {
    const node = makeNode({
      dynamic_properties: { pic: "still-a-string" },
      dynamic_inputs: { pic: { type: { type: "image" } } }
    });
    const { calls, error } = await runWithEdgeValue(node, "other", 1);

    expect(calls).toHaveLength(0);
    expect(error).toContain('Dynamic input "pic"');
  });

  it("leaves an undeclared dynamic property untouched (legacy path)", async () => {
    const node = makeNode({
      dynamic_properties: { legacy: 123 }
    });
    const { calls, error } = await runWithEdgeValue(node, "other", "x");

    expect(error).toBeUndefined();
    expect(calls).toEqual([{ legacy: 123, other: "x" }]);
  });
});

describe("Graph – dynamic_inputs round trip", () => {
  it("survives fromDict", () => {
    const graph = Graph.fromDict({
      nodes: [
        {
          id: "n1",
          type: "test.Dynamic",
          dynamic_properties: { pic: null },
          dynamic_inputs: { pic: { type: { type: "image" }, required: true } }
        }
      ],
      edges: []
    });

    const node = graph.findNode("n1")!;
    expect(node.dynamic_inputs).toEqual({
      pic: { type: { type: "image" }, required: true }
    });
    // dynamic_properties still merges into the flat property bag.
    expect(node.properties).toEqual({ pic: null });
  });

  it("registers declared slot types into an existing propertyTypes map", () => {
    const graph = Graph.fromDict(
      {
        nodes: [
          {
            id: "n1",
            type: "test.Dynamic",
            properties: { label: "hi" },
            propertyTypes: { label: "str" },
            dynamic_properties: { pic: null },
            dynamic_inputs: { pic: { type: { type: "image" } } }
          }
        ],
        edges: []
      },
      { allowUndefinedProperties: false }
    );

    const node = graph.findNode("n1")!;
    expect(node.propertyTypes).toEqual({ label: "str", pic: "image" });
    // The declared slot is no longer stripped by the undefined-property guard.
    expect(node.properties).toEqual({ label: "hi", pic: null });
  });

  it("does not synthesize propertyTypes for a node that has none", () => {
    const graph = Graph.fromDict({
      nodes: [
        {
          id: "n1",
          type: "test.Dynamic",
          dynamic_inputs: { pic: { type: { type: "image" } } }
        }
      ],
      edges: []
    });

    expect(graph.findNode("n1")!.propertyTypes).toBeUndefined();
  });

  it("carries dynamic_inputs and types the handle through loadFromDict", async () => {
    const graph = await Graph.loadFromDict(
      {
        nodes: [
          {
            id: "n1",
            type: "test.Dynamic",
            dynamic_properties: { pic: null },
            dynamic_inputs: { pic: { type: { type: "image" } } }
          }
        ],
        edges: []
      },
      {
        resolver: (nodeType: string) => ({
          nodeType,
          propertyTypes: { label: "str" },
          supportsDynamicInputs: true
        })
      }
    );

    const node = graph.findNode("n1")!;
    expect(node.dynamic_inputs).toEqual({ pic: { type: { type: "image" } } });
    expect(node.propertyTypes).toEqual({ label: "str", pic: "image" });
  });
});

describe("graph-utils – getInputTypeString", () => {
  it("returns the declared type for a typed dynamic slot", () => {
    const node = makeNode({
      dynamic_inputs: {
        pics: { type: { type: "list", type_args: [{ type: "image" }] } }
      }
    });
    expect(getInputTypeString(node, "pics")).toBe("list[image]");
  });

  it("returns undefined for an untyped dynamic slot", () => {
    const node = makeNode({ dynamic_properties: { legacy: "" } });
    expect(getInputTypeString(node, "legacy")).toBeUndefined();
  });

  it("prefers propertyTypes over the slot declaration", () => {
    const node = makeNode({
      propertyTypes: { pic: "str" },
      dynamic_inputs: { pic: { type: { type: "image" } } }
    });
    expect(getInputTypeString(node, "pic")).toBe("str");
  });
});
