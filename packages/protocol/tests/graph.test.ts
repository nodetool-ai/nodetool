/**
 * Contract tests for graph types.
 */

import { describe, it, expect } from "vitest";
import type { Edge, NodeDescriptor, GraphData } from "../src/graph.js";
import { isControlEdge, isDataEdge } from "../src/graph.js";

describe("Edge helpers", () => {
  const dataEdge: Edge = {
    id: "e1",
    source: "n1",
    sourceHandle: "output",
    target: "n2",
    targetHandle: "input",
    edge_type: "data"
  };

  const controlEdge: Edge = {
    id: "e2",
    source: "n1",
    sourceHandle: "__control__",
    target: "n2",
    targetHandle: "__control__",
    edge_type: "control"
  };

  const defaultEdge: Edge = {
    source: "n1",
    sourceHandle: "out",
    target: "n2",
    targetHandle: "in"
  };

  it("isControlEdge returns true for control edges", () => {
    expect(isControlEdge(controlEdge)).toBe(true);
    expect(isControlEdge(dataEdge)).toBe(false);
  });

  it("isDataEdge returns true for data edges", () => {
    expect(isDataEdge(dataEdge)).toBe(true);
    expect(isDataEdge(controlEdge)).toBe(false);
  });

  it("edge without edge_type defaults to data (not control)", () => {
    expect(isControlEdge(defaultEdge)).toBe(false);
    expect(isDataEdge(defaultEdge)).toBe(true);
  });
});

describe("NodeDescriptor", () => {
  it("supports minimal descriptor", () => {
    const node: NodeDescriptor = {
      id: "n1",
      type: "math.Add"
    };
    expect(node.id).toBe("n1");
    expect(node.is_streaming_input).toBeUndefined();
    expect(node.sync_mode).toBeUndefined();
  });

  it("supports full descriptor", () => {
    const node: NodeDescriptor = {
      id: "n1",
      type: "math.Add",
      name: "adder",
      properties: { a: 0, b: 0 },
      outputs: { result: "float" },
      is_streaming_input: false,
      is_streaming_output: true,
      sync_mode: "zip_all",
      is_controlled: false,
      is_dynamic: false,
      ui_properties: { x: 1 },
      dynamic_properties: { mode: "fast" },
      dynamic_outputs: { extra: { type: "string" } as any }
    };
    expect(node.sync_mode).toBe("zip_all");
    expect(node.ui_properties).toEqual({ x: 1 });
    expect(node.dynamic_properties).toEqual({ mode: "fast" });
    expect(node.dynamic_outputs).toBeDefined();
  });
});

describe("GraphData", () => {
  it("can represent a simple two-node graph", () => {
    const graph: GraphData = {
      nodes: [
        { id: "n1", type: "input.FloatInput" },
        { id: "n2", type: "output.FloatOutput" }
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          sourceHandle: "value",
          target: "n2",
          targetHandle: "value",
          edge_type: "data"
        }
      ]
    };
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });
});

import type {
  ControlEvent,
  RunEvent,
  StopEvent,
  SyncMode
} from "../src/graph.js";

describe("ControlEvent", () => {
  it("RunEvent has event_type 'run' and carries properties", () => {
    const runEvt: RunEvent = {
      event_type: "run",
      properties: { input: 42, mode: "fast" }
    };
    expect(runEvt.event_type).toBe("run");
    expect(runEvt.properties.input).toBe(42);
  });

  it("StopEvent has event_type 'stop' with no extra data", () => {
    const stopEvt: StopEvent = { event_type: "stop" };
    expect(stopEvt.event_type).toBe("stop");
  });

  it("ControlEvent union can be narrowed by event_type", () => {
    const events: ControlEvent[] = [
      { event_type: "run", properties: {} },
      { event_type: "stop" }
    ];
    for (const evt of events) {
      if (evt.event_type === "run") {
        expect(evt.properties).toBeDefined();
      } else {
        expect(evt.event_type).toBe("stop");
      }
    }
  });
});

describe("SyncMode", () => {
  it("accepts on_any and zip_all values", () => {
    const modes: SyncMode[] = ["on_any", "zip_all"];
    expect(modes).toContain("on_any");
    expect(modes).toContain("zip_all");
    expect(modes).toHaveLength(2);
  });

  it("NodeDescriptor sync_mode is applied correctly", () => {
    const nodeOnAny = {
      id: "n1",
      type: "math.Add",
      sync_mode: "on_any" as SyncMode
    };
    const nodeZipAll = {
      id: "n2",
      type: "math.Mul",
      sync_mode: "zip_all" as SyncMode
    };
    expect(nodeOnAny.sync_mode).toBe("on_any");
    expect(nodeZipAll.sync_mode).toBe("zip_all");
  });
});

describe("NodeDescriptor property metadata", () => {
  it("supports propertyTypes record", () => {
    const node = {
      id: "n1",
      type: "math.Add",
      propertyTypes: { a: "int", b: "int", values: "list[int]" }
    };
    expect(node.propertyTypes.a).toBe("int");
    expect(node.propertyTypes.values).toBe("list[int]");
  });

  it("supports propertyMeta record with min/max/description", () => {
    const node = {
      id: "n1",
      type: "math.Clamp",
      propertyMeta: {
        value: { description: "Input value", min: 0, max: 1 }
      }
    };
    expect(node.propertyMeta.value.min).toBe(0);
    expect(node.propertyMeta.value.max).toBe(1);
    expect(node.propertyMeta.value.description).toBe("Input value");
  });
});
