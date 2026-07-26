/**
 * Typed dynamic slots (Phase 1, node-sdk half).
 *
 * Covers the BaseNode slot map + coercion, `validateProperties` over dynamic
 * values, `allowed_dynamic_slot_types` metadata emission, and the
 * `validateGraph` matrix for typed / untyped dynamic inputs.
 */
import { describe, it, expect } from "vitest";
import type { DynamicSlotMeta } from "@nodetool-ai/protocol";
import { BaseNode, coerceToSlotType } from "../src/base-node.js";
import { prop } from "../src/decorators.js";
import { getNodeMetadata } from "../src/node-metadata.js";
import { NodeRegistry } from "../src/registry.js";
import {
  validateGraph,
  type GraphValidationRegistry
} from "../src/graph-validation.js";
import type { NodeMetadata } from "../src/metadata.js";
import type { NodePropertyValidationIssue } from "../src/validation.js";

const slot = (
  type: string,
  extra: Partial<DynamicSlotMeta> = {}
): DynamicSlotMeta =>
  ({ type: { type, type_args: [] }, ...extra }) as DynamicSlotMeta;

const listSlot = (inner: string): DynamicSlotMeta =>
  ({
    type: { type: "list", type_args: [{ type: inner, type_args: [] }] }
  }) as DynamicSlotMeta;

class DynNode extends BaseNode {
  static readonly nodeType = "test.Dyn";
  static readonly title = "Dyn";
  static readonly supportsDynamicInputs = true;

  @prop({ type: "str", default: "" })
  declare template: string;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

/** Reports its dynamic values so coercion is observable end-to-end. */
class EchoDynNode extends BaseNode {
  static readonly nodeType = "test.EchoDyn";
  static readonly title = "EchoDyn";
  static readonly supportsDynamicInputs = true;

  async process(): Promise<Record<string, unknown>> {
    return { dynamic: Object.fromEntries(this.getDynamicSlotValues()) };
  }

  private getDynamicSlotValues(): Map<string, unknown> {
    const values = new Map<string, unknown>();
    for (const name of this.getDynamicSlots().keys()) {
      values.set(name, this.getDynamic(name));
    }
    return values;
  }
}

class RestrictedNode extends BaseNode {
  static readonly nodeType = "test.Restricted";
  static readonly title = "Restricted";
  static readonly supportsDynamicInputs = true;
  static readonly allowedDynamicSlotTypes = [
    { type: "str", type_args: [] },
    { type: "image", type_args: [] }
  ];

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

// ---------------------------------------------------------------------------
// BaseNode: slot map + coercion
// ---------------------------------------------------------------------------

describe("BaseNode dynamic slots", () => {
  it("populates dynamicSlotMeta from the injected _dynamic_inputs", () => {
    const node = new DynNode({
      _dynamic_inputs: { images: listSlot("image"), caption: slot("str") },
      caption: "hi"
    });
    const slots = node.getDynamicSlots();
    expect([...slots.keys()].sort()).toEqual(["caption", "images"]);
    expect(node.getDynamic("caption")).toBe("hi");
  });

  it("does not leak _dynamic_inputs into the dynamic property values", () => {
    const node = new DynNode({
      _dynamic_inputs: { caption: slot("str") },
      caption: "hi"
    });
    expect(node.serialize()).toEqual({ template: "", caption: "hi" });
  });

  it("coerces assigned values into a list[T] slot", () => {
    const node = new DynNode({
      _dynamic_inputs: { images: listSlot("image") },
      images: { uri: "a.png" }
    });
    expect(node.getDynamic("images")).toEqual([{ uri: "a.png" }]);
  });

  it("setDynamic coerces via the declared slot type", () => {
    const node = new DynNode({ _dynamic_inputs: { images: listSlot("image") } });
    node.setDynamic("images", { uri: "b.png" });
    expect(node.getDynamic("images")).toEqual([{ uri: "b.png" }]);
  });

  it("setDynamic leaves undeclared (legacy) slots untouched", () => {
    const node = new DynNode({});
    node.setDynamic("whatever", "raw");
    expect(node.getDynamic("whatever")).toBe("raw");
    expect(node.getDynamicSlots().size).toBe(0);
  });

  it("keeps slot declarations across later assigns", () => {
    const node = new DynNode({ _dynamic_inputs: { images: listSlot("image") } });
    node.assign({ images: { uri: "c.png" } });
    expect(node.getDynamic("images")).toEqual([{ uri: "c.png" }]);
  });

  it("ignores malformed slot declarations instead of throwing", () => {
    const node = new DynNode({
      _dynamic_inputs: { good: slot("str"), bad: 42 },
      good: "x"
    });
    expect([...node.getDynamicSlots().keys()]).toEqual(["good"]);
  });

  it("coerceToSlotType passes values through for an undeclared slot", () => {
    expect(coerceToSlotType("x", undefined)).toBe("x");
  });
});

// ---------------------------------------------------------------------------
// validateProperties over dynamic values
// ---------------------------------------------------------------------------

describe("validateProperties with dynamic slots", () => {
  it("flags a required slot with no value", () => {
    const issues = DynNode.validateProperties(
      {},
      { dynamicSlots: { caption: slot("str", { required: true }) } }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("required");
    expect(issues[0].property).toBe("caption");
  });

  it("does not flag a required slot fed by an edge", () => {
    const issues = DynNode.validateProperties(
      {},
      {
        dynamicSlots: { caption: slot("str", { required: true }) },
        connectedHandles: new Set(["caption"])
      }
    );
    expect(issues).toEqual([]);
  });

  it("flags a value that cannot be the declared type", () => {
    const issues = DynNode.validateProperties(
      {},
      {
        dynamicSlots: { count: slot("int") },
        dynamicValues: { count: "not a number" }
      }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("dynamic_type_mismatch");
  });

  it("reads dynamic values out of the property bag when none is supplied", () => {
    const issues = DynNode.validateProperties(
      { template: "", count: "nope" },
      { dynamicSlots: { count: slot("int") } }
    );
    expect(issues.map((i) => i.code)).toEqual(["dynamic_type_mismatch"]);
  });

  it("accepts an `any` slot holding anything", () => {
    const issues = DynNode.validateProperties(
      {},
      { dynamicSlots: { x: slot("any") }, dynamicValues: { x: 42 } }
    );
    expect(issues).toEqual([]);
  });

  it("reports nothing when no slots are declared (legacy node)", () => {
    const issues = DynNode.validateProperties({ anything: 1, other: "x" });
    expect(issues).toEqual([]);
  });

  it("validate() uses the instance's own slots and values", () => {
    const node = new DynNode({
      _dynamic_inputs: { count: slot("int") },
      count: "nope"
    });
    const issues = node.validate();
    expect(issues.map((i) => i.code)).toEqual(["dynamic_type_mismatch"]);
  });

  it("registry.validateNode forwards descriptor slots and values", () => {
    const registry = new NodeRegistry();
    registry.register(DynNode as never);
    const issues = registry.validateNode({
      id: "n1",
      type: "test.Dyn",
      properties: {},
      dynamic_inputs: { caption: slot("str", { required: true }) },
      dynamic_properties: {}
    });
    expect(issues.map((i) => i.code)).toEqual(["required"]);
    expect(issues[0].nodeId).toBe("n1");
  });

  it("registry.resolve injects slot declarations so values are coerced", async () => {
    const registry = new NodeRegistry();
    registry.register(EchoDynNode as never);
    const executor = registry.resolve({
      id: "n1",
      type: "test.EchoDyn",
      properties: { images: { uri: "d.png" } },
      dynamic_inputs: { images: listSlot("image") }
    });
    const result = await executor.process({});
    expect(result).toEqual({ dynamic: { images: [{ uri: "d.png" }] } });
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("allowed_dynamic_slot_types metadata", () => {
  it("emits the declared palette", () => {
    const metadata = getNodeMetadata(RestrictedNode as never);
    expect(metadata.allowed_dynamic_slot_types).toEqual([
      { type: "str", type_args: [] },
      { type: "image", type_args: [] }
    ]);
  });

  it("is undefined when the class does not restrict the palette", () => {
    const metadata = getNodeMetadata(DynNode as never);
    expect(metadata.allowed_dynamic_slot_types).toBeUndefined();
    expect(metadata.supports_dynamic_inputs).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateGraph
// ---------------------------------------------------------------------------

function meta(
  nodeType: string,
  inputs: Record<string, string>,
  outputs: Record<string, string>,
  extra: Partial<NodeMetadata> = {}
): NodeMetadata {
  return {
    title: nodeType,
    description: "",
    namespace: "test",
    node_type: nodeType,
    properties: Object.entries(inputs).map(([name, type]) => ({
      name,
      type: { type, type_args: [] }
    })),
    outputs: Object.entries(outputs).map(([name, type]) => ({
      name,
      type: { type, type_args: [] }
    })),
    ...extra
  } as NodeMetadata;
}

const registry: GraphValidationRegistry = {
  has: (t) => t in metas,
  getMetadata: (t) => metas[t],
  validateNode: (): NodePropertyValidationIssue[] => []
};

const metas: Record<string, NodeMetadata> = {
  "test.StrSource": meta("test.StrSource", {}, { out: "str" }),
  "test.ImageSource": meta("test.ImageSource", {}, { out: "image" }),
  "test.Dyn": meta("test.Dyn", { template: "str" }, { out: "str" }, {
    supports_dynamic_inputs: true
  })
};

const graphWith = (
  node: Record<string, unknown>,
  source = "test.StrSource"
): Parameters<typeof validateGraph>[0] => ({
  nodes: [
    { id: "src", type: source, properties: {} },
    { id: "dyn", type: "test.Dyn", properties: {}, ...node }
  ],
  edges: [
    {
      id: "e1",
      source: "src",
      sourceHandle: "out",
      target: "dyn",
      targetHandle: "extra"
    }
  ]
});

describe("validateGraph — dynamic slots", () => {
  it("accepts an edge whose type matches the declared slot", () => {
    const report = validateGraph(
      graphWith({ dynamic_inputs: { extra: slot("str") } }),
      registry
    );
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("errors on an edge whose type contradicts the declared slot", () => {
    const report = validateGraph(
      graphWith({ dynamic_inputs: { extra: slot("image") } }),
      registry
    );
    expect(report.ok).toBe(false);
    const issue = report.issues.find((i) => i.code === "type_mismatch");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("declared as image");
  });

  it("warns (never errors) when the slot is undeclared", () => {
    const report = validateGraph(graphWith({}), registry);
    expect(report.ok).toBe(true);
    expect(report.counts.errors).toBe(0);
    expect(report.issues.map((i) => i.code)).toEqual(["untyped_dynamic_slot"]);
    expect(report.issues[0].severity).toBe("warning");
  });

  it("treats a legacy node with dynamic_properties and no dynamic_inputs as valid", () => {
    const report = validateGraph(
      graphWith({ dynamic_properties: { extra: "" } }),
      registry
    );
    expect(report.counts.errors).toBe(0);
    expect(report.issues.map((i) => i.code)).toEqual(["untyped_dynamic_slot"]);
  });

  it("accepts anything into an `any` slot", () => {
    const report = validateGraph(
      graphWith({ dynamic_inputs: { extra: slot("any") } }, "test.ImageSource"),
      registry
    );
    expect(report.issues).toEqual([]);
  });

  it("accepts anything into a union slot", () => {
    const report = validateGraph(
      graphWith(
        {
          dynamic_inputs: {
            extra: {
              type: {
                type: "union",
                type_args: [
                  { type: "str", type_args: [] },
                  { type: "image", type_args: [] }
                ]
              }
            } as DynamicSlotMeta
          }
        },
        "test.ImageSource"
      ),
      registry
    );
    expect(report.issues).toEqual([]);
  });

  it("reads slot declarations from the ReactFlow `data` shape", () => {
    const report = validateGraph(
      graphWith({ data: { dynamic_inputs: { extra: slot("image") } } }),
      registry
    );
    expect(report.counts.errors).toBe(1);
  });

  it("warns on an inline value that contradicts its slot type", () => {
    const report = validateGraph(
      {
        nodes: [
          {
            id: "dyn",
            type: "test.Dyn",
            properties: {},
            dynamic_inputs: { count: slot("int") },
            dynamic_properties: { count: "twelve" }
          }
        ],
        edges: []
      },
      registry
    );
    expect(report.ok).toBe(true);
    expect(report.issues.map((i) => i.code)).toEqual(["dynamic_type_mismatch"]);
    expect(report.issues[0].severity).toBe("warning");
  });

  it("skips the inline check for a slot fed by an edge", () => {
    const report = validateGraph(
      graphWith({
        dynamic_inputs: { extra: slot("str") },
        dynamic_properties: { extra: 42 }
      }),
      registry
    );
    expect(report.issues).toEqual([]);
  });
});
