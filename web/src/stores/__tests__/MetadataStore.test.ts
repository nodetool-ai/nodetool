import { act } from "@testing-library/react";
import useMetadataStore from "../MetadataStore";
import { NodeMetadata, UnifiedModel, ModelPack } from "../ApiTypes";

describe("MetadataStore", () => {
  beforeEach(() => {
    useMetadataStore.setState({
      metadata: {},
      recommendedModels: [],
      modelPacks: [],
      nodeTypes: {}
    });
  });

  it("initializes with empty default state", () => {
    expect(useMetadataStore.getState().metadata).toEqual({});
    expect(useMetadataStore.getState().recommendedModels).toEqual([]);
    expect(useMetadataStore.getState().modelPacks).toEqual([]);
    expect(useMetadataStore.getState().nodeTypes).toEqual({});
  });

  describe("setMetadata", () => {
    it("sets metadata for node types", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "test-node": {
          description: "A test node",
          category: "Test",
          node_type: "test-node",
          namespace: "test",
          title: "Test Node",
          properties: [],
          outputs: [],
          the_model_info: {},
          layout: "default",
          recommended_models: [],
          basic_fields: [],
          is_dynamic: false,
          expose_as_tool: false,
          supports_dynamic_outputs: false,
          is_streaming_output: false
        }
      };

      act(() => {
        useMetadataStore.getState().setMetadata(mockMetadata);
      });

      expect(useMetadataStore.getState().metadata).toEqual(mockMetadata);
    });

    it("overwrites existing metadata", () => {
      const initialMetadata: Record<string, NodeMetadata> = {
        "test-node": {
          description: "Initial description",
          category: "Test",
          node_type: "test-node",
          namespace: "test",
          title: "Test Node",
          properties: [],
          outputs: [],
          the_model_info: {},
          layout: "default",
          recommended_models: [],
          basic_fields: [],
          is_dynamic: false,
          expose_as_tool: false,
          supports_dynamic_outputs: false,
          is_streaming_output: false
        }
      };

      const updatedMetadata: Record<string, NodeMetadata> = {
        "test-node": {
          description: "Updated description",
          category: "Test",
          node_type: "test-node",
          namespace: "test",
          title: "Test Node",
          properties: [],
          outputs: [],
          the_model_info: {},
          layout: "default",
          recommended_models: [],
          basic_fields: [],
          is_dynamic: false,
          expose_as_tool: false,
          supports_dynamic_outputs: false,
          is_streaming_output: false
        }
      };

      act(() => {
        useMetadataStore.getState().setMetadata(initialMetadata);
      });
      act(() => {
        useMetadataStore.getState().setMetadata(updatedMetadata);
      });

      expect(useMetadataStore.getState().metadata["test-node"].description).toBe("Updated description");
    });
  });

  describe("getMetadata", () => {
    it("returns undefined for non-existent node type", () => {
      expect(useMetadataStore.getState().getMetadata("non-existent")).toBeUndefined();
    });

    it("returns metadata for existing node type", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "test-node": {
          description: "A test node",
          category: "Test",
          node_type: "test-node",
          namespace: "test",
          title: "Test Node",
          properties: [],
          outputs: [],
          the_model_info: {},
          layout: "default",
          recommended_models: [],
          basic_fields: [],
          is_dynamic: false,
          expose_as_tool: false,
          supports_dynamic_outputs: false,
          is_streaming_output: false
        }
      };

      act(() => {
        useMetadataStore.getState().setMetadata(mockMetadata);
      });

      expect(useMetadataStore.getState().getMetadata("test-node")).toEqual(mockMetadata["test-node"]);
    });
  });

  describe("setRecommendedModels", () => {
    it("sets recommended models", () => {
      const mockModels: UnifiedModel[] = [
        { id: "model-1", name: "Model 1", type: "huggingface", repo_id: "org/model-1" },
        { id: "model-2", name: "Model 2", type: "ollama", repo_id: "model-2" }
      ];

      act(() => {
        useMetadataStore.getState().setRecommendedModels(mockModels);
      });

      expect(useMetadataStore.getState().recommendedModels).toEqual(mockModels);
    });

    it("replaces existing models", () => {
      const initialModels: UnifiedModel[] = [
        { id: "model-1", name: "Model 1", type: "huggingface", repo_id: "org/model-1" }
      ];

      const updatedModels: UnifiedModel[] = [
        { id: "model-2", name: "Model 2", type: "ollama", repo_id: "model-2" }
      ];

      act(() => {
        useMetadataStore.getState().setRecommendedModels(initialModels);
      });
      act(() => {
        useMetadataStore.getState().setRecommendedModels(updatedModels);
      });

      expect(useMetadataStore.getState().recommendedModels).toEqual(updatedModels);
    });
  });

  describe("setModelPacks", () => {
    it("sets model packs", () => {
      const mockPacks: ModelPack[] = [
        { id: "pack-1", title: "Pack 1", description: "", category: "", tags: [], models: [] }
      ];

      act(() => {
        useMetadataStore.getState().setModelPacks(mockPacks);
      });

      expect(useMetadataStore.getState().modelPacks).toEqual(mockPacks);
    });
  });

  describe("setNodeTypes", () => {
    it("sets node types", () => {
      const mockNodeTypes = {
        "test-node": () => null
      };

      act(() => {
        useMetadataStore.getState().setNodeTypes(mockNodeTypes);
      });

      expect(useMetadataStore.getState().nodeTypes).toEqual(mockNodeTypes);
    });

    it("overwrites existing node types", () => {
      const initialNodeTypes = {
        "test-node-1": () => null
      };

      const updatedNodeTypes = {
        "test-node-2": () => null
      };

      act(() => {
        useMetadataStore.getState().setNodeTypes(initialNodeTypes);
      });
      act(() => {
        useMetadataStore.getState().setNodeTypes(updatedNodeTypes);
      });

      expect(useMetadataStore.getState().nodeTypes).toEqual(updatedNodeTypes);
    });
  });

  describe("addNodeType", () => {
    it("adds a single node type", () => {
      const mockComponent = () => null;

      act(() => {
        useMetadataStore.getState().addNodeType("new-node", mockComponent);
      });

      expect(useMetadataStore.getState().nodeTypes["new-node"]).toBe(mockComponent);
      expect(Object.keys(useMetadataStore.getState().nodeTypes)).toHaveLength(1);
    });

    it("adds multiple node types incrementally", () => {
      const mockComponent1 = () => null;
      const mockComponent2 = () => null;

      act(() => {
        useMetadataStore.getState().addNodeType("node-1", mockComponent1);
      });
      act(() => {
        useMetadataStore.getState().addNodeType("node-2", mockComponent2);
      });

      expect(useMetadataStore.getState().nodeTypes["node-1"]).toBe(mockComponent1);
      expect(useMetadataStore.getState().nodeTypes["node-2"]).toBe(mockComponent2);
      expect(Object.keys(useMetadataStore.getState().nodeTypes)).toHaveLength(2);
    });

    it("preserves existing node types when adding new one", () => {
      const mockComponent1 = () => "component1";
      const mockComponent2 = () => "component2";

      act(() => {
        useMetadataStore.getState().addNodeType("node-1", mockComponent1);
      });
      act(() => {
        useMetadataStore.getState().addNodeType("node-2", mockComponent2);
      });

      expect(useMetadataStore.getState().nodeTypes["node-1"]).toBeDefined();
      expect(useMetadataStore.getState().nodeTypes["node-2"]).toBeDefined();
    });
  });
});
