import useMetadataStore from "../MetadataStore";
import { NodeMetadata, UnifiedModel, ModelPack } from "../ApiTypes";

describe("MetadataStore", () => {
  beforeEach(() => {
    useMetadataStore.setState(useMetadataStore.getInitialState());
  });

  describe("initial state", () => {
    it("should initialize with empty metadata", () => {
      const state = useMetadataStore.getInitialState();
      expect(state.metadata).toEqual({});
    });

    it("should initialize with empty recommendedModels", () => {
      const state = useMetadataStore.getInitialState();
      expect(state.recommendedModels).toEqual([]);
    });

    it("should initialize with empty modelPacks", () => {
      const state = useMetadataStore.getInitialState();
      expect(state.modelPacks).toEqual([]);
    });

    it("should initialize with empty nodeTypes", () => {
      const state = useMetadataStore.getInitialState();
      expect(state.nodeTypes).toEqual({});
    });
  });

  describe("setMetadata", () => {
    it("should set metadata with a single node", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "test-node": {
          node_type: "test-node",
          title: "Test Node",
          description: "A test node",
          namespace: "test",
          layout: "default",
          outputs: [],
          properties: [],
          is_dynamic: false,
          supports_dynamic_outputs: false,
          expose_as_tool: false,
          the_model_info: {},
          recommended_models: [],
          basic_fields: [],
          is_streaming_output: false
        }
      };

      useMetadataStore.getState().setMetadata(mockMetadata);
      expect(useMetadataStore.getState().metadata).toEqual(mockMetadata);
    });

    it("should set metadata with multiple nodes", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "node-1": {
          node_type: "node-1",
          title: "Node 1",
          description: "First node",
          namespace: "test",
          layout: "default",
          outputs: [],
          properties: [],
          is_dynamic: false,
          supports_dynamic_outputs: false,
          expose_as_tool: false,
          the_model_info: {},
          recommended_models: [],
          basic_fields: [],
          is_streaming_output: false
        },
        "node-2": {
          node_type: "node-2",
          title: "Node 2",
          description: "Second node",
          namespace: "test",
          layout: "default",
          outputs: [],
          properties: [],
          is_dynamic: false,
          supports_dynamic_outputs: false,
          expose_as_tool: false,
          the_model_info: {},
          recommended_models: [],
          basic_fields: [],
          is_streaming_output: false
        }
      };

      useMetadataStore.getState().setMetadata(mockMetadata);
      expect(useMetadataStore.getState().metadata).toEqual(mockMetadata);
      expect(Object.keys(useMetadataStore.getState().metadata)).toHaveLength(2);
    });

    it("should replace existing metadata", () => {
      const initialMetadata: Record<string, NodeMetadata> = {
        "old-node": {
          node_type: "old-node",
          title: "Old Node",
          description: "Old node",
          namespace: "test",
          layout: "default",
          outputs: [],
          properties: [],
          is_dynamic: false,
          supports_dynamic_outputs: false,
          expose_as_tool: false,
          the_model_info: {},
          recommended_models: [],
          basic_fields: [],
          is_streaming_output: false
        }
      };

      const newMetadata: Record<string, NodeMetadata> = {
        "new-node": {
          node_type: "new-node",
          title: "New Node",
          description: "New node",
          namespace: "test",
          layout: "default",
          outputs: [],
          properties: [],
          is_dynamic: false,
          supports_dynamic_outputs: false,
          expose_as_tool: false,
          the_model_info: {},
          recommended_models: [],
          basic_fields: [],
          is_streaming_output: false
        }
      };

      useMetadataStore.getState().setMetadata(initialMetadata);
      expect(useMetadataStore.getState().metadata["old-node"]).toBeDefined();

      useMetadataStore.getState().setMetadata(newMetadata);
      expect(useMetadataStore.getState().metadata["old-node"]).toBeUndefined();
      expect(useMetadataStore.getState().metadata["new-node"]).toBeDefined();
    });
  });

  describe("getMetadata", () => {
    it("should return undefined for non-existent node type", () => {
      const result = useMetadataStore.getState().getMetadata("non-existent");
      expect(result).toBeUndefined();
    });

    it("should return metadata for existing node type", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "test-node": {
          node_type: "test-node",
          title: "Test Node",
          description: "A test node",
          namespace: "test",
          layout: "default",
          outputs: [],
          properties: [],
          is_dynamic: false,
          supports_dynamic_outputs: false,
          expose_as_tool: false,
          the_model_info: {},
          recommended_models: [],
          basic_fields: [],
          is_streaming_output: false
        }
      };

      useMetadataStore.getState().setMetadata(mockMetadata);
      const result = useMetadataStore.getState().getMetadata("test-node");

      expect(result).toBeDefined();
      expect(result?.title).toBe("Test Node");
    });
  });

  describe("setRecommendedModels", () => {
    it("should set recommended models", () => {
      const mockModels: UnifiedModel[] = [
        { id: "model-1", type: "huggingface", repo_id: "test/model-1" } as UnifiedModel
      ];

      useMetadataStore.getState().setRecommendedModels(mockModels);
      expect(useMetadataStore.getState().recommendedModels).toEqual(mockModels);
    });

    it("should set empty array", () => {
      useMetadataStore.setState({ recommendedModels: [{ id: "model-1" } as UnifiedModel] });
      useMetadataStore.getState().setRecommendedModels([]);
      expect(useMetadataStore.getState().recommendedModels).toEqual([]);
    });
  });

  describe("setModelPacks", () => {
    it("should set model packs", () => {
      const mockPacks: ModelPack[] = [
        { id: "pack-1", name: "Pack 1", models: [] }
      ];

      useMetadataStore.getState().setModelPacks(mockPacks);
      expect(useMetadataStore.getState().modelPacks).toEqual(mockPacks);
    });
  });

  describe("setNodeTypes", () => {
    it("should set node types", () => {
      const mockNodeTypes = {
        "test-node": () => null
      };

      useMetadataStore.getState().setNodeTypes(mockNodeTypes);
      expect(useMetadataStore.getState().nodeTypes).toEqual(mockNodeTypes);
    });
  });

  describe("addNodeType", () => {
    it("should add a new node type", () => {
      const TestComponent = () => null;

      useMetadataStore.getState().addNodeType("new-node", TestComponent);
      expect(useMetadataStore.getState().nodeTypes["new-node"]).toBe(TestComponent);
    });

    it("should add multiple node types", () => {
      const Component1 = () => null;
      const Component2 = () => null;
      const Component3 = () => null;

      useMetadataStore.getState().addNodeType("node-1", Component1);
      useMetadataStore.getState().addNodeType("node-2", Component2);
      useMetadataStore.getState().addNodeType("node-3", Component3);

      expect(useMetadataStore.getState().nodeTypes["node-1"]).toBe(Component1);
      expect(useMetadataStore.getState().nodeTypes["node-2"]).toBe(Component2);
      expect(useMetadataStore.getState().nodeTypes["node-3"]).toBe(Component3);
    });

    it("should not overwrite existing node types", () => {
      const Component1 = () => "first";
      const Component2 = () => "second";

      useMetadataStore.getState().addNodeType("test-node", Component1);
      useMetadataStore.getState().addNodeType("test-node", Component2);

      expect(useMetadataStore.getState().nodeTypes["test-node"]).toBe(Component2);
    });
  });

  describe("full workflow", () => {
    it("should handle complete metadata workflow", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "node-1": {
          node_type: "node-1",
          title: "Node 1",
          description: "First node",
          namespace: "test",
          layout: "default",
          outputs: [],
          properties: [],
          is_dynamic: false,
          supports_dynamic_outputs: false,
          expose_as_tool: false,
          the_model_info: {},
          recommended_models: [],
          basic_fields: [],
          is_streaming_output: false
        }
      };

      useMetadataStore.getState().setMetadata(mockMetadata);
      expect(useMetadataStore.getState().getMetadata("node-1")).toBeDefined();

      const mockModels: UnifiedModel[] = [
        { id: "model-1", type: "huggingface", repo_id: "test/model-1" } as UnifiedModel
      ];
      useMetadataStore.getState().setRecommendedModels(mockModels);
      expect(useMetadataStore.getState().recommendedModels).toHaveLength(1);
    });
  });
});
