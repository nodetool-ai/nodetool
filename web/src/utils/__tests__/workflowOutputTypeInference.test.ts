import {
  inferWorkflowOutputSchema,
  getInferredOutputType,
} from "../workflowOutputTypeInference";
import { Graph, Node, Edge, OutputSlot } from "../../stores/ApiTypes";

// Mock the metadata store
const mockGetMetadata = jest.fn();

jest.mock("../../stores/MetadataStore", () => ({
  default: {
    getState: () => ({
      getMetadata: mockGetMetadata
    })
  }
}));

describe("workflowOutputTypeInference", () => {
  const createMockNode = (id: string, type: string, data?: Record<string, unknown>): Node => ({
    id,
    type,
    data: data || {},
    parent_id: null,
    ui_properties: {},
    dynamic_outputs: {},
    sync_mode: "on_any"
  });

  const createMockEdge = (sourceNodeId: string, sourceHandle: string, targetNodeId: string, targetHandle: string): Edge => ({
    id: `edge-${sourceNodeId}-${sourceHandle}-${targetNodeId}-${targetHandle}`,
    source: sourceNodeId,
    sourceHandle: sourceHandle,
    target: targetNodeId,
    targetHandle: targetHandle
  });

  const createMockOutputSlot = (name: string, type: string, optional: boolean = false, typeName?: string): OutputSlot => ({
    name,
    type: {
      type,
      optional,
      values: type === "enum" ? ["option1", "option2"] : undefined,
      type_args: [],
      type_name: typeName
    },
    stream: false
  });

  const createMockMetadata = (nodeType: string, outputs: OutputSlot[]) => ({
    title: nodeType.split(".").pop() || nodeType,
    description: "",
    namespace: "test",
    node_type: nodeType,
    layout: "default",
    properties: [],
    outputs,
    the_model_info: {},
    recommended_models: [],
    basic_fields: [],
    is_dynamic: false,
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("inferWorkflowOutputSchema", () => {
    it("should return undefined for empty graph", () => {
      const emptyGraph: Graph = { nodes: [], edges: [] };
      const result = inferWorkflowOutputSchema(emptyGraph);
      expect(result).toBeUndefined();
    });

    it("should return undefined for graph with no output nodes", () => {
      const graph: Graph = {
        nodes: [createMockNode("node1", "nodetool.process.TextProcess", {})],
        edges: []
      };
      const result = inferWorkflowOutputSchema(graph);
      expect(result).toBeUndefined();
    });

    it("should infer datetime type from connected source node", () => {
      const mockMetadata = createMockMetadata("nodetool.process.TextProcess", [
        createMockOutputSlot("result", "datetime", false)
      ]);
      
      mockGetMetadata.mockImplementation((nodeType: string) => {
        if (nodeType === "nodetool.process.TextProcess") {
          return mockMetadata;
        }
        if (nodeType.startsWith("nodetool.output.")) {
          return createMockMetadata(nodeType, [
            createMockOutputSlot("value", "any", true)
          ]);
        }
        return undefined;
      });

      const graph: Graph = {
        nodes: [
          createMockNode("source1", "nodetool.process.TextProcess", {}),
          createMockNode("output1", "nodetool.output.ValueOutput", { name: "datetime_result" })
        ],
        edges: [
          createMockEdge("source1", "result", "output1", "value")
        ]
      };

      const result = inferWorkflowOutputSchema(graph);
      
      expect(result).toBeDefined();
      expect(result?.type).toBe("object");
      expect(result?.properties.datetime_result).toBeDefined();
      expect(result?.properties.datetime_result.type).toBe("datetime");
    });

    it("should infer enum type with type_name from connected source", () => {
      const mockMetadata = createMockMetadata("nodetool.process.ModelSelector", [
        createMockOutputSlot("model", "enum", false, "ModelType")
      ]);
      
      mockGetMetadata.mockImplementation((nodeType: string) => {
        if (nodeType === "nodetool.process.ModelSelector") {
          return mockMetadata;
        }
        if (nodeType.startsWith("nodetool.output.")) {
          return createMockMetadata(nodeType, [
            createMockOutputSlot("value", "any", true)
          ]);
        }
        return undefined;
      });

      const graph: Graph = {
        nodes: [
          createMockNode("source1", "nodetool.process.ModelSelector", {}),
          createMockNode("output1", "nodetool.output.ValueOutput", { name: "selected_model" })
        ],
        edges: [
          createMockEdge("source1", "model", "output1", "value")
        ]
      };

      const result = inferWorkflowOutputSchema(graph);
      
      expect(result).toBeDefined();
      expect(result?.properties.selected_model).toBeDefined();
      expect(result?.properties.selected_model.type).toBe("enum");
      expect(result?.properties.selected_model.typeName).toBe("ModelType");
      expect(result?.properties.selected_model.values).toEqual(["option1", "option2"]);
    });

    it("should handle multiple output nodes", () => {
      const textMetadata = createMockMetadata("nodetool.process.TextProcess", [
        createMockOutputSlot("result", "text", false)
      ]);
      
      const imageMetadata = createMockMetadata("nodetool.process.ImageGenerator", [
        createMockOutputSlot("image", "image", false)
      ]);
      
      mockGetMetadata.mockImplementation((nodeType: string) => {
        if (nodeType === "nodetool.process.TextProcess") {
          return textMetadata;
        }
        if (nodeType === "nodetool.process.ImageGenerator") {
          return imageMetadata;
        }
        if (nodeType.startsWith("nodetool.output.")) {
          return createMockMetadata(nodeType, [
            createMockOutputSlot("value", "any", true)
          ]);
        }
        return undefined;
      });

      const graph: Graph = {
        nodes: [
          createMockNode("source1", "nodetool.process.TextProcess", {}),
          createMockNode("source2", "nodetool.process.ImageGenerator", {}),
          createMockNode("output1", "nodetool.output.ValueOutput", { name: "text_result" }),
          createMockNode("output2", "nodetool.output.ValueOutput", { name: "image_result" })
        ],
        edges: [
          createMockEdge("source1", "result", "output1", "value"),
          createMockEdge("source2", "image", "output2", "value")
        ]
      };

      const result = inferWorkflowOutputSchema(graph);
      
      expect(result).toBeDefined();
      expect(Object.keys(result?.properties || {})).toHaveLength(2);
      expect(result?.properties.text_result.type).toBe("text");
      expect(result?.properties.image_result.type).toBe("image");
    });

    it("should only include non-optional outputs in required array", () => {
      const mockMetadata = createMockMetadata("nodetool.process.TextProcess", [
        createMockOutputSlot("required_output", "text", false),
        createMockOutputSlot("optional_output", "text", true)
      ]);
      
      mockGetMetadata.mockImplementation((nodeType: string) => {
        if (nodeType === "nodetool.process.TextProcess") {
          return mockMetadata;
        }
        if (nodeType.startsWith("nodetool.output.")) {
          return createMockMetadata(nodeType, [
            createMockOutputSlot("value", "any", true)
          ]);
        }
        return undefined;
      });

      const graph: Graph = {
        nodes: [
          createMockNode("source1", "nodetool.process.TextProcess", {}),
          createMockNode("output1", "nodetool.output.ValueOutput", { name: "required" }),
          createMockNode("output2", "nodetool.output.ValueOutput", { name: "optional" })
        ],
        edges: [
          createMockEdge("source1", "required_output", "output1", "value"),
          createMockEdge("source1", "optional_output", "output2", "value")
        ]
      };

      const result = inferWorkflowOutputSchema(graph);
      
      expect(result).toBeDefined();
      expect(result?.required).toContain("required");
      expect(result?.required).not.toContain("optional");
    });
  });

  describe("getInferredOutputType", () => {
    it("should return undefined for missing output", () => {
      const graph: Graph = {
        nodes: [createMockNode("node1", "nodetool.output.ValueOutput", {})],
        edges: []
      };

      const result = getInferredOutputType(graph, "nonexistent");
      expect(result).toBeUndefined();
    });

    it("should return the inferred type for existing output", () => {
      const mockMetadata = createMockMetadata("nodetool.process.TextProcess", [
        createMockOutputSlot("result", "text", false)
      ]);
      
      mockGetMetadata.mockImplementation((nodeType: string) => {
        if (nodeType === "nodetool.process.TextProcess") {
          return mockMetadata;
        }
        if (nodeType.startsWith("nodetool.output.")) {
          return createMockMetadata(nodeType, [
            createMockOutputSlot("value", "any", true)
          ]);
        }
        return undefined;
      });

      const graph: Graph = {
        nodes: [
          createMockNode("source1", "nodetool.process.TextProcess", {}),
          createMockNode("output1", "nodetool.output.ValueOutput", { name: "text_result" })
        ],
        edges: [
          createMockEdge("source1", "result", "output1", "value")
        ]
      };

      const result = getInferredOutputType(graph, "text_result");
      
      expect(result).toBeDefined();
      expect(result?.type).toBe("text");
    });

    it("should handle type resolved from node.data.type", () => {
      const mockMetadata = createMockMetadata("nodetool.process.TextProcess", [
        createMockOutputSlot("result", "text", false)
      ]);
      
      mockGetMetadata.mockImplementation((nodeType: string) => {
        if (nodeType === "nodetool.process.TextProcess") {
          return mockMetadata;
        }
        if (nodeType.startsWith("nodetool.output.")) {
          return createMockMetadata(nodeType, [
            createMockOutputSlot("value", "any", true)
          ]);
        }
        return undefined;
      });

      const graph: Graph = {
        nodes: [
          createMockNode("source1", "", { type: "nodetool.process.TextProcess" }),
          createMockNode("output1", "nodetool.output.ValueOutput", { name: "text_result" })
        ],
        edges: [
          createMockEdge("source1", "result", "output1", "value")
        ]
      };

      const result = getInferredOutputType(graph, "text_result");
      
      expect(result).toBeDefined();
      expect(result?.type).toBe("text");
    });

    it("should return undefined when node type resolves to empty string", () => {
      const graph: Graph = {
        nodes: [
          createMockNode("source1", "", {}),
          createMockNode("output1", "nodetool.output.ValueOutput", { name: "result" })
        ],
        edges: [
          createMockEdge("source1", "result", "output1", "value")
        ]
      };

      const result = getInferredOutputType(graph, "result");
      expect(result).toBeUndefined();
    });
  });
});
