/**
 * Tests for rewriteBypassedNodes — routing inputs to outputs of bypassed
 * nodes when types are compatible.
 */

import { describe, it, expect } from "vitest";
import {
  rewriteBypassedNodes,
  isNodeBypassed
} from "../src/graph-utils.js";
import type { NodeDescriptor, Edge, GraphData } from "@nodetool-ai/protocol";

function makeNode(
  id: string,
  overrides: Partial<NodeDescriptor> = {}
): NodeDescriptor {
  return {
    id,
    type: overrides.type ?? "test.Node",
    ...overrides
  };
}

function bypassed(
  id: string,
  overrides: Partial<NodeDescriptor> = {}
): NodeDescriptor {
  return makeNode(id, {
    ...overrides,
    ui_properties: {
      ...(overrides.ui_properties as Record<string, unknown> | undefined),
      bypassed: true
    }
  });
}

describe("isNodeBypassed", () => {
  it("returns false when ui_properties is missing", () => {
    expect(isNodeBypassed(makeNode("n1"))).toBe(false);
  });

  it("returns false when ui_properties.bypassed is not true", () => {
    expect(
      isNodeBypassed(makeNode("n1", { ui_properties: { bypassed: false } }))
    ).toBe(false);
    expect(
      isNodeBypassed(
        makeNode("n1", { ui_properties: { bypassed: "yes" } as never })
      )
    ).toBe(false);
  });

  it("returns true when ui_properties.bypassed === true", () => {
    expect(
      isNodeBypassed(makeNode("n1", { ui_properties: { bypassed: true } }))
    ).toBe(true);
  });

  it("returns false when ui_properties is null or not an object", () => {
    // null is the important case: without the !ui / typeof guard, reading
    // .bypassed off null would throw.
    expect(
      isNodeBypassed(makeNode("n", { ui_properties: null as never }))
    ).toBe(false);
    expect(
      isNodeBypassed(makeNode("n", { ui_properties: "nope" as never }))
    ).toBe(false);
  });
});

describe("rewriteBypassedNodes", () => {
  it("returns the input unchanged when no nodes are bypassed", () => {
    const data: GraphData = {
      nodes: [makeNode("A"), makeNode("B")],
      edges: [{ source: "A", sourceHandle: "out", target: "B", targetHandle: "in" }]
    };
    const result = rewriteBypassedNodes(data);
    expect(result).toBe(data);
  });

  it("routes input to output when types match (single in, single out)", () => {
    // A(out: string) --> B(bypassed, in: string, out: string) --> C(in: string)
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      }),
      makeNode("C", { propertyTypes: { in: "string" } })
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];

    const result = rewriteBypassedNodes({ nodes, edges });

    expect(result.nodes.map((n) => n.id)).toEqual(["A", "C"]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      source: "A",
      sourceHandle: "out",
      target: "C",
      targetHandle: "in"
    });
  });

  it("drops outgoing edges that have no type-compatible input", () => {
    // A(out: string) --> B(bypassed, in_text: string, out_image: image)
    //                    B --> C(in: image)
    // No compatible input for the image output, so the edge B->C is dropped.
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out_image: "image" },
        propertyTypes: { in_text: "string" }
      }),
      makeNode("C", { propertyTypes: { in: "image" } })
    ];
    const edges: Edge[] = [
      {
        source: "A",
        sourceHandle: "out",
        target: "B",
        targetHandle: "in_text"
      },
      {
        source: "B",
        sourceHandle: "out_image",
        target: "C",
        targetHandle: "in"
      }
    ];

    const result = rewriteBypassedNodes({ nodes, edges });

    expect(result.nodes.map((n) => n.id)).toEqual(["A", "C"]);
    // Incoming edge to B is dropped, outgoing edge to C is dropped (no match).
    expect(result.edges).toHaveLength(0);
  });

  it("routes only the type-compatible input when multiple inputs exist", () => {
    // A(out: image)  \
    // M(out: mask)    > B(bypassed, image: image, mask: mask, out: image) --> C(in: image)
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "image" } }),
      makeNode("M", { outputs: { out: "mask" } }),
      bypassed("B", {
        outputs: { out: "image" },
        propertyTypes: { image: "image", mask: "mask" }
      }),
      makeNode("C", { propertyTypes: { in: "image" } })
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "image" },
      { source: "M", sourceHandle: "out", target: "B", targetHandle: "mask" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];

    const result = rewriteBypassedNodes({ nodes, edges });

    expect(result.nodes.map((n) => n.id).sort()).toEqual(["A", "C", "M"]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      source: "A",
      sourceHandle: "out",
      target: "C",
      targetHandle: "in"
    });
  });

  it("prefers input compatible with bypass output type when downstream is untyped", () => {
    // Text(out: string)  \
    // Img(out: image)     > B(bypassed, prompt: string, image: image, out: image) --> C(in: any)
    // Even though C accepts anything, bypass should route Img through "out:image".
    const nodes: NodeDescriptor[] = [
      makeNode("Text", { outputs: { out: "string" } }),
      makeNode("Img", { outputs: { out: "image" } }),
      bypassed("B", {
        outputs: { out: "image" },
        propertyTypes: { prompt: "string", image: "image" }
      }),
      makeNode("C", { propertyTypes: { in: "any" } })
    ];
    const edges: Edge[] = [
      { source: "Text", sourceHandle: "out", target: "B", targetHandle: "prompt" },
      { source: "Img", sourceHandle: "out", target: "B", targetHandle: "image" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];

    const result = rewriteBypassedNodes({ nodes, edges });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      source: "Img",
      sourceHandle: "out",
      target: "C",
      targetHandle: "in"
    });
  });

  it("prefers a name-matched incoming handle when multiple types match", () => {
    // A(out: any) --> text --> B(bypassed)
    // D(out: any) --> other --> B(bypassed) -- text --> C
    // The outgoing sourceHandle is "text", so the incoming whose
    // targetHandle === "text" wins over the other compatible input.
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "any" } }),
      makeNode("D", { outputs: { out: "any" } }),
      bypassed("B", {
        outputs: { text: "any" },
        propertyTypes: { text: "any", other: "any" }
      }),
      makeNode("C", { propertyTypes: { in: "any" } })
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "text" },
      { source: "D", sourceHandle: "out", target: "B", targetHandle: "other" },
      { source: "B", sourceHandle: "text", target: "C", targetHandle: "in" }
    ];

    const result = rewriteBypassedNodes({ nodes, edges });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe("A");
  });

  it("collapses a chain of bypassed nodes", () => {
    // A --> B(bypassed) --> C(bypassed) --> D
    // all string, all compatible.
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      }),
      bypassed("C", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      }),
      makeNode("D", { propertyTypes: { in: "string" } })
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" },
      { source: "C", sourceHandle: "out", target: "D", targetHandle: "in" }
    ];

    const result = rewriteBypassedNodes({ nodes, edges });

    expect(result.nodes.map((n) => n.id).sort()).toEqual(["A", "D"]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      source: "A",
      sourceHandle: "out",
      target: "D",
      targetHandle: "in"
    });
  });

  it("preserves edge metadata (id, ui_properties) on rerouted edges", () => {
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      }),
      makeNode("C", { propertyTypes: { in: "string" } })
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      {
        id: "edge-B-C",
        source: "B",
        sourceHandle: "out",
        target: "C",
        targetHandle: "in",
        ui_properties: { label: "my-edge" }
      }
    ];

    const result = rewriteBypassedNodes({ nodes, edges });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      id: "edge-B-C",
      source: "A",
      sourceHandle: "out",
      target: "C",
      targetHandle: "in",
      ui_properties: { label: "my-edge" }
    });
  });

  it("treats missing type info on either side as compatible", () => {
    // Dynamic nodes often have no propertyTypes or outputs. Bypassing
    // should still route through so the user isn't silently left without
    // any connections.
    const nodes: NodeDescriptor[] = [
      makeNode("A"),
      bypassed("B"),
      makeNode("C")
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];

    const result = rewriteBypassedNodes({ nodes, edges });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      source: "A",
      target: "C"
    });
  });

  it("allows numeric widening via TypeMetadata compatibility rules", () => {
    // A outputs int, target expects float — compatible via numeric widening.
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "int" } }),
      bypassed("B", {
        outputs: { out: "float" },
        propertyTypes: { in: "int" }
      }),
      makeNode("C", { propertyTypes: { in: "float" } })
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];

    const result = rewriteBypassedNodes({ nodes, edges });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe("A");
  });

  it("supports fan-out: one incoming routes to multiple outgoing edges", () => {
    // A --> B(bypassed) --> C
    //       B ------------> D
    // Both outgoing edges should be rerouted from A.
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      }),
      makeNode("C", { propertyTypes: { in: "string" } }),
      makeNode("D", { propertyTypes: { in: "string" } })
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "D", targetHandle: "in" }
    ];

    const result = rewriteBypassedNodes({ nodes, edges });

    expect(result.edges).toHaveLength(2);
    const targets = result.edges.map((e) => e.target).sort();
    expect(targets).toEqual(["C", "D"]);
    expect(result.edges.every((e) => e.source === "A")).toBe(true);
  });

  it("drops control edges touching a bypassed node", () => {
    // Agent --control--> B(bypassed) --out--> C
    // A --in--> B(bypassed) --out--> C
    // Control edge to B is dropped; data routing A -> C is preserved.
    const nodes: NodeDescriptor[] = [
      makeNode("Agent"),
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      }),
      makeNode("C", { propertyTypes: { in: "string" } })
    ];
    const edges: Edge[] = [
      {
        source: "Agent",
        sourceHandle: "ctrl",
        target: "B",
        targetHandle: "__control__",
        edge_type: "control"
      },
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];

    const result = rewriteBypassedNodes({ nodes, edges });

    expect(result.nodes.map((n) => n.id).sort()).toEqual([
      "A",
      "Agent",
      "C"
    ]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      source: "A",
      target: "C"
    });
  });

  it("handles an incoming edge from a node missing in the graph", () => {
    // Source S is not in the node list — its output type is unknown (treated
    // as compatible). The reroute should still come from S.
    const nodes: NodeDescriptor[] = [
      bypassed("B", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      }),
      makeNode("C", { propertyTypes: { in: "string" } })
    ];
    const edges: Edge[] = [
      { source: "S", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];
    const result = rewriteBypassedNodes({ nodes, edges });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: "S", target: "C" });
  });

  it("handles an outgoing edge to a node missing in the graph", () => {
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      })
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "X", targetHandle: "in" }
    ];
    const result = rewriteBypassedNodes({ nodes, edges });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: "A", target: "X" });
  });

  it("derives the downstream input type from properties.type (object form)", () => {
    // C declares its input type via properties[handle].type = image (no
    // propertyTypes). The string incoming is incompatible, so the edge drops.
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out: "image" },
        propertyTypes: { in: "string" }
      }),
      makeNode("C", { properties: { in: { type: "image" } } } as never)
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];
    const result = rewriteBypassedNodes({ nodes, edges });
    expect(result.edges).toHaveLength(0);
  });

  it("derives the downstream input type from a {type} descriptor in properties", () => {
    // C declares its input type via an explicit descriptor value.
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out: "image" },
        propertyTypes: { in: "string" }
      }),
      makeNode("C", { properties: { in: { type: "image" } } } as never)
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];
    const result = rewriteBypassedNodes({ nodes, edges });
    expect(result.edges).toHaveLength(0);
  });

  it("treats plain string property values as data, not type names", () => {
    // C holds a saved literal on the handle; it must not be parsed as a
    // type name (which would make the rewire look incompatible and drop it).
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out: "image" },
        propertyTypes: { in: "string" }
      }),
      makeNode("C", { properties: { in: "image" } } as never)
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];
    const result = rewriteBypassedNodes({ nodes, edges });
    // No type info for C's input -> treated as compatible -> rewired A -> C.
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: "A", target: "C" });
  });

  it("falls back to a downstream-compatible input when none match the bypass output", () => {
    // The only incoming (string) is compatible with C's input (string) but not
    // with B's own output (image). It must still be used as the fallback.
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out: "image" },
        propertyTypes: { in: "string" }
      }),
      makeNode("C", { propertyTypes: { in: "string" } })
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];
    const result = rewriteBypassedNodes({ nodes, edges });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: "A", target: "C" });
  });

  it("prefers a name-matched input even when it is not first in edge order", () => {
    // Edge order lists the non-matching incoming (other) BEFORE the matching
    // one (text). The reroute must still pick the name-matched source A.
    const nodes: NodeDescriptor[] = [
      makeNode("D", { outputs: { out: "any" } }),
      makeNode("A", { outputs: { out: "any" } }),
      bypassed("B", {
        outputs: { text: "any" },
        propertyTypes: { text: "any", other: "any" }
      }),
      makeNode("C", { propertyTypes: { in: "any" } })
    ];
    const edges: Edge[] = [
      { source: "D", sourceHandle: "out", target: "B", targetHandle: "other" },
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "text" },
      { source: "B", sourceHandle: "text", target: "C", targetHandle: "in" }
    ];
    const result = rewriteBypassedNodes({ nodes, edges });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe("A");
  });

  it("drops an outgoing control edge from a bypassed node", () => {
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      }),
      makeNode("C", { propertyTypes: { in: "string" } }),
      makeNode("X")
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" },
      {
        source: "B",
        sourceHandle: "ctrl",
        target: "X",
        targetHandle: "__control__",
        edge_type: "control"
      }
    ];
    const result = rewriteBypassedNodes({ nodes, edges });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: "A", target: "C" });
  });

  it("treats a non-string declared type as compatible (parser-error fallback)", () => {
    // Raw graph data can carry a non-string in outputs; TypeMetadata.fromString
    // throws on it and typesCompatible's catch falls back to compatible.
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: 123 as never } }),
      bypassed("B", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      }),
      makeNode("C", { propertyTypes: { in: "string" } })
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];
    const result = rewriteBypassedNodes({ nodes, edges });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: "A", target: "C" });
  });

  it("handles a null property value when deriving the input type", () => {
    // properties[handle] === null must not crash the `"type" in val` check.
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("B", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      }),
      makeNode("C", { properties: { in: null } } as never)
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" }
    ];
    const result = rewriteBypassedNodes({ nodes, edges });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: "A", target: "C" });
  });

  it("collapses a chain even when nodes are visited out of dependency order", () => {
    // Node order forces bypassedIds = [C, B] so C (downstream) is visited
    // before its bypassed upstream B. The chain must still fully collapse to
    // A -> D in a single edge (requires the second while-pass).
    const nodes: NodeDescriptor[] = [
      makeNode("A", { outputs: { out: "string" } }),
      bypassed("C", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      }),
      bypassed("B", {
        outputs: { out: "string" },
        propertyTypes: { in: "string" }
      }),
      makeNode("D", { propertyTypes: { in: "string" } })
    ];
    const edges: Edge[] = [
      { source: "A", sourceHandle: "out", target: "B", targetHandle: "in" },
      { source: "B", sourceHandle: "out", target: "C", targetHandle: "in" },
      { source: "C", sourceHandle: "out", target: "D", targetHandle: "in" }
    ];
    const result = rewriteBypassedNodes({ nodes, edges });
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["A", "D"]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: "A", target: "D" });
  });
});
