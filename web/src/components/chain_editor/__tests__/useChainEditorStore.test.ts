import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { useChainEditorStore } from "../useChainEditorStore";
import type { NodeMetadata, TypeMetadata, Property, OutputSlot } from "../../../stores/ApiTypes";

jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({ metadata: {} })
  }
}));

function makeType(type: string): TypeMetadata {
  return { type, type_args: [], optional: false };
}

function makeProp(name: string, type: string, defaultValue?: unknown): Property {
  return {
    name,
    type: makeType(type),
    default: defaultValue ?? null,
    description: "",
    min: null,
    max: null
  } as Property;
}

function makeOutput(name: string, type: string): OutputSlot {
  return { name, type: makeType(type) } as OutputSlot;
}

function makeMetadata(
  nodeType: string,
  properties: Property[] = [],
  outputs: OutputSlot[] = []
): NodeMetadata {
  return {
    node_type: nodeType,
    title: nodeType,
    description: "",
    namespace: "",
    properties,
    outputs,
    recommended_models: [],
    layout: "default",
    basic_fields: [],
    required_settings: [],
    is_dynamic: false,
    is_streaming_output: false,
    expose_as_tool: false,
    supports_dynamic_outputs: false
  } as NodeMetadata;
}

function resetStore() {
  useChainEditorStore.getState().newWorkflow();
}

describe("useChainEditorStore", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("initial state", () => {
    it("starts with empty chain", () => {
      const { chain, connections, workflowName } = useChainEditorStore.getState();
      expect(chain).toEqual([]);
      expect(connections).toEqual([]);
      expect(workflowName).toBe("Untitled Workflow");
    });
  });

  describe("addNode", () => {
    it("adds a node to the chain", () => {
      const meta = makeMetadata("test.TextNode", [makeProp("text", "str", "")], [makeOutput("output", "str")]);

      act(() => {
        useChainEditorStore.getState().addNode(meta);
      });

      const { chain } = useChainEditorStore.getState();
      expect(chain).toHaveLength(1);
      expect(chain[0].nodeType).toBe("test.TextNode");
      expect(chain[0].selectedOutput).toBe("output");
      expect(chain[0].expanded).toBe(true);
    });

    it("extracts default properties from metadata", () => {
      const meta = makeMetadata("test.Node", [
        makeProp("text", "str", "hello"),
        makeProp("count", "int", 42),
        makeProp("optional", "str")
      ]);

      act(() => {
        useChainEditorStore.getState().addNode(meta);
      });

      const props = useChainEditorStore.getState().chain[0].properties;
      expect(props.text).toBe("hello");
      expect(props.count).toBe(42);
      expect(props.optional).toBeUndefined();
    });

    it("inserts at a specific index", () => {
      act(() => {
        useChainEditorStore.getState().addNode(makeMetadata("test.A"));
        useChainEditorStore.getState().addNode(makeMetadata("test.B"));
        useChainEditorStore.getState().addNode(makeMetadata("test.C"), 1);
      });

      const types = useChainEditorStore.getState().chain.map((n) => n.nodeType);
      expect(types).toEqual(["test.A", "test.C", "test.B"]);
    });

    it("places input nodes before regular nodes", () => {
      act(() => {
        useChainEditorStore.getState().addNode(makeMetadata("test.Regular"));
        useChainEditorStore.getState().addNode(makeMetadata("test.input.Text"));
      });

      const types = useChainEditorStore.getState().chain.map((n) => n.nodeType);
      expect(types[0]).toBe("test.input.Text");
    });

    it("places output nodes at the end", () => {
      act(() => {
        useChainEditorStore.getState().addNode(makeMetadata("test.Regular"));
        useChainEditorStore.getState().addNode(makeMetadata("test.output.Display"));
      });

      const types = useChainEditorStore.getState().chain.map((n) => n.nodeType);
      expect(types[types.length - 1]).toBe("test.output.Display");
    });
  });

  describe("removeNode", () => {
    it("removes a node by id", () => {
      act(() => { useChainEditorStore.getState().addNode(makeMetadata("test.Node")); });
      const nodeId = useChainEditorStore.getState().chain[0].id;
      act(() => { useChainEditorStore.getState().removeNode(nodeId); });
      expect(useChainEditorStore.getState().chain).toHaveLength(0);
    });

    it("cleans up inputMappings referencing the removed node", () => {
      const metaA = makeMetadata("test.A", [], [makeOutput("out", "str")]);
      const metaB = makeMetadata("test.B", [makeProp("input", "str")]);

      act(() => {
        useChainEditorStore.getState().addNode(metaA);
        useChainEditorStore.getState().addNode(metaB);
      });

      const idA = useChainEditorStore.getState().chain[0].id;
      const idB = useChainEditorStore.getState().chain[1].id;

      act(() => {
        useChainEditorStore.getState().setInputMapping(idB, "input", {
          sourceNodeId: idA, sourceOutput: "out"
        });
      });

      act(() => { useChainEditorStore.getState().removeNode(idA); });

      const remaining = useChainEditorStore.getState().chain[0];
      expect(Object.keys(remaining.inputMappings)).toHaveLength(0);
    });
  });

  describe("moveNode", () => {
    it("moves a node from one index to another", () => {
      act(() => {
        useChainEditorStore.getState().addNode(makeMetadata("test.A"));
        useChainEditorStore.getState().addNode(makeMetadata("test.B"));
        useChainEditorStore.getState().addNode(makeMetadata("test.C"));
      });

      act(() => { useChainEditorStore.getState().moveNode(2, 0); });

      const types = useChainEditorStore.getState().chain.map((n) => n.nodeType);
      expect(types).toEqual(["test.C", "test.A", "test.B"]);
    });

    it("invalidates forward-referencing inputMappings after move", () => {
      const metaA = makeMetadata("test.A", [], [makeOutput("out", "str")]);
      const metaB = makeMetadata("test.B", [makeProp("input", "str")]);

      act(() => {
        useChainEditorStore.getState().addNode(metaA);
        useChainEditorStore.getState().addNode(metaB);
      });

      const idA = useChainEditorStore.getState().chain[0].id;
      const idB = useChainEditorStore.getState().chain[1].id;

      act(() => {
        useChainEditorStore.getState().setInputMapping(idB, "input", {
          sourceNodeId: idA, sourceOutput: "out"
        });
      });

      act(() => { useChainEditorStore.getState().moveNode(1, 0); });

      const movedB = useChainEditorStore.getState().chain.find((n) => n.id === idB);
      expect(Object.keys(movedB!.inputMappings)).toHaveLength(0);
    });

    it("no-ops for out-of-range indices", () => {
      act(() => { useChainEditorStore.getState().addNode(makeMetadata("test.A")); });
      act(() => { useChainEditorStore.getState().moveNode(-1, 5); });
      expect(useChainEditorStore.getState().chain).toHaveLength(1);
    });
  });

  describe("duplicateNode", () => {
    it("creates a copy after the original", () => {
      const meta = makeMetadata("test.Node", [makeProp("text", "str", "hello")]);
      act(() => { useChainEditorStore.getState().addNode(meta); });
      const nodeId = useChainEditorStore.getState().chain[0].id;
      act(() => { useChainEditorStore.getState().duplicateNode(nodeId); });

      const { chain } = useChainEditorStore.getState();
      expect(chain).toHaveLength(2);
      expect(chain[1].id).not.toBe(chain[0].id);
      expect(chain[1].nodeType).toBe(chain[0].nodeType);
      expect(chain[1].expanded).toBe(false);
    });
  });

  describe("updateProperty", () => {
    it("updates a property on a node", () => {
      act(() => { useChainEditorStore.getState().addNode(makeMetadata("test.Node", [makeProp("text", "str", "hello")])); });
      const nodeId = useChainEditorStore.getState().chain[0].id;
      act(() => { useChainEditorStore.getState().updateProperty(nodeId, "text", "world"); });
      expect(useChainEditorStore.getState().chain[0].properties.text).toBe("world");
    });
  });

  describe("toggleExpanded and collapseAll", () => {
    it("toggles expanded state", () => {
      act(() => { useChainEditorStore.getState().addNode(makeMetadata("test.Node")); });
      const nodeId = useChainEditorStore.getState().chain[0].id;
      expect(useChainEditorStore.getState().chain[0].expanded).toBe(true);
      act(() => { useChainEditorStore.getState().toggleExpanded(nodeId); });
      expect(useChainEditorStore.getState().chain[0].expanded).toBe(false);
    });

    it("collapses all nodes", () => {
      act(() => {
        useChainEditorStore.getState().addNode(makeMetadata("test.A"));
        useChainEditorStore.getState().addNode(makeMetadata("test.B"));
        useChainEditorStore.getState().collapseAll();
      });

      expect(useChainEditorStore.getState().chain.every((n) => !n.expanded)).toBe(true);
    });
  });

  describe("showNodePicker / hideNodePicker", () => {
    it("shows and hides node picker", () => {
      act(() => { useChainEditorStore.getState().showNodePicker(3); });
      expect(useChainEditorStore.getState().nodePickerVisible).toBe(true);
      expect(useChainEditorStore.getState().insertAtIndex).toBe(3);
      act(() => { useChainEditorStore.getState().hideNodePicker(); });
      expect(useChainEditorStore.getState().nodePickerVisible).toBe(false);
    });
  });

  describe("setWorkflowName / newWorkflow", () => {
    it("updates the workflow name", () => {
      act(() => { useChainEditorStore.getState().setWorkflowName("My Workflow"); });
      expect(useChainEditorStore.getState().workflowName).toBe("My Workflow");
    });

    it("resets to clean state with optional name", () => {
      act(() => {
        useChainEditorStore.getState().addNode(makeMetadata("test.Node"));
        useChainEditorStore.getState().newWorkflow("Fresh Start");
      });

      const state = useChainEditorStore.getState();
      expect(state.chain).toEqual([]);
      expect(state.workflowName).toBe("Fresh Start");
      expect(state.workflowId).toBeNull();
    });
  });

  describe("setInputMapping / clearInputMappings", () => {
    it("sets and clears input mappings", () => {
      const metaA = makeMetadata("test.A", [], [makeOutput("out", "str")]);
      const metaB = makeMetadata("test.B", [makeProp("input", "str")]);

      act(() => {
        useChainEditorStore.getState().addNode(metaA);
        useChainEditorStore.getState().addNode(metaB);
      });

      const idA = useChainEditorStore.getState().chain[0].id;
      const idB = useChainEditorStore.getState().chain[1].id;

      act(() => {
        useChainEditorStore.getState().setInputMapping(idB, "input", {
          sourceNodeId: idA, sourceOutput: "out"
        });
      });

      expect(useChainEditorStore.getState().connections).toHaveLength(1);

      act(() => { useChainEditorStore.getState().clearInputMappings(idB); });
      expect(useChainEditorStore.getState().connections).toHaveLength(0);
    });

    it("removes a single mapping when source is null", () => {
      const metaA = makeMetadata("test.A", [], [makeOutput("out", "str")]);
      const metaB = makeMetadata("test.B", [makeProp("input", "str")]);

      act(() => {
        useChainEditorStore.getState().addNode(metaA);
        useChainEditorStore.getState().addNode(metaB);
      });

      const idA = useChainEditorStore.getState().chain[0].id;
      const idB = useChainEditorStore.getState().chain[1].id;

      act(() => {
        useChainEditorStore.getState().setInputMapping(idB, "input", {
          sourceNodeId: idA, sourceOutput: "out"
        });
        useChainEditorStore.getState().setInputMapping(idB, "input", null);
      });

      expect(useChainEditorStore.getState().chain[1].inputMappings.input).toBeUndefined();
    });
  });

  describe("toWorkflowGraph", () => {
    it("converts chain to graph representation", () => {
      const metaA = makeMetadata("test.A", [], [makeOutput("out", "str")]);
      const metaB = makeMetadata("test.B", [makeProp("input", "str")]);

      act(() => {
        useChainEditorStore.getState().addNode(metaA);
        useChainEditorStore.getState().addNode(metaB);
      });

      const idA = useChainEditorStore.getState().chain[0].id;
      const idB = useChainEditorStore.getState().chain[1].id;

      act(() => {
        useChainEditorStore.getState().setInputMapping(idB, "input", {
          sourceNodeId: idA, sourceOutput: "out"
        });
      });

      const graph = useChainEditorStore.getState().toWorkflowGraph();
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].source).toBe(idA);
      expect(graph.edges[0].target).toBe(idB);
    });
  });
});
