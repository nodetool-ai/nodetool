import useMetadataStore from "../MetadataStore";
import { NodeMetadata, UnifiedModel, ModelPack } from "../ApiTypes";
import { NodeTypes } from "@xyflow/react";

describe("MetadataStore", () => {
  const initialState = useMetadataStore.getState();

  beforeEach(() => {
    useMetadataStore.setState(initialState, true);
  });

  describe("initial state", () => {
    it("starts with empty metadata", () => {
      expect(useMetadataStore.getState().metadata).toEqual({});
    });

    it("starts with empty recommended models", () => {
      expect(useMetadataStore.getState().recommendedModels).toEqual([]);
    });

    it("starts with empty model packs", () => {
      expect(useMetadataStore.getState().modelPacks).toEqual([]);
    });

    it("starts with empty node types", () => {
      expect(useMetadataStore.getState().nodeTypes).toEqual({});
    });
  });

  describe("setMetadata", () => {
    it("sets metadata records", () => {
      const testMetadata = {
        "test-node": {
          node_type: "test-node",
          description: "A test node",
          category: "Test",
          inputs: [],
          outputs: [],
          parameters: [],
          title: "Test Node",
          namespace: "test",
          layout: { type: "static" },
          properties: {},
          icon: "",
          doc: "",
          display_name: "Test Node",
        } as unknown as NodeMetadata,
      };

      useMetadataStore.getState().setMetadata(testMetadata);

      expect(useMetadataStore.getState().metadata).toEqual(testMetadata);
    });

    it("overwrites existing metadata", () => {
      const initialMetadata = {
        "node-1": {
          node_type: "node-1",
          description: "Initial node",
          category: "Test",
          inputs: [],
          outputs: [],
          parameters: [],
          title: "Node 1",
          namespace: "test",
          layout: { type: "static" },
          properties: {},
          icon: "",
          doc: "",
          display_name: "Node 1",
        } as unknown as NodeMetadata,
      };

      const newMetadata = {
        "node-2": {
          node_type: "node-2",
          description: "New node",
          category: "Test",
          inputs: [],
          outputs: [],
          parameters: [],
          title: "Node 2",
          namespace: "test",
          layout: { type: "static" },
          properties: {},
          icon: "",
          doc: "",
          display_name: "Node 2",
        } as unknown as NodeMetadata,
      };

      useMetadataStore.setState({ metadata: initialMetadata });
      useMetadataStore.getState().setMetadata(newMetadata);

      expect(useMetadataStore.getState().metadata).toEqual(newMetadata);
    });
  });

  describe("getMetadata", () => {
    it("returns undefined for non-existent node type", () => {
      expect(useMetadataStore.getState().getMetadata("non-existent")).toBeUndefined();
    });

    it("returns metadata for existing node type", () => {
      const testMetadata = {
        "test-node": {
          node_type: "test-node",
          description: "A test node",
          category: "Test",
          inputs: [],
          outputs: [],
          parameters: [],
          title: "Test Node",
          namespace: "test",
          layout: { type: "static" },
          properties: {},
          icon: "",
          doc: "",
          display_name: "Test Node",
        } as unknown as NodeMetadata,
      };

      useMetadataStore.getState().setMetadata(testMetadata);
      const result = useMetadataStore.getState().getMetadata("test-node");

      expect(result).toBeDefined();
      expect(result?.description).toBe("A test node");
    });
  });

  describe("setRecommendedModels", () => {
    it("sets recommended models", () => {
      const testModels = [
        {
          id: "model-1",
          type: "onnx" as const,
          name: "Test Model",
          repo_id: "test/model",
          path: "model.gguf",
          metadata: { tags: ["test"] },
        },
      ];

      useMetadataStore.getState().setRecommendedModels(testModels);

      expect(useMetadataStore.getState().recommendedModels).toEqual(testModels);
    });

    it("replaces existing models", () => {
      const initialModels = [
        {
          id: "model-1",
          type: "onnx" as const,
          name: "Initial Model",
          repo_id: "initial/model",
          path: "model.gguf",
          metadata: { tags: ["initial"] },
        },
      ];

      const newModels = [
        {
          id: "model-2",
          type: "transformers" as const,
          name: "New Model",
          repo_id: "new/model",
          path: "newmodel.gguf",
          metadata: { tags: ["new"] },
        },
      ];

      useMetadataStore.setState({ recommendedModels: initialModels });
      useMetadataStore.getState().setRecommendedModels(newModels);

      expect(useMetadataStore.getState().recommendedModels).toEqual(newModels);
    });
  });

  describe("setModelPacks", () => {
    it("sets model packs", () => {
      const testPacks = [
        {
          id: "pack-1",
          name: "Test Pack",
          title: "Test Pack",
          description: "A test pack",
          category: "Test",
          tags: [],
          models: [],
          total_size: 0,
        },
      ];

      useMetadataStore.getState().setModelPacks(testPacks);

      expect(useMetadataStore.getState().modelPacks).toEqual(testPacks);
    });
  });

  describe("setNodeTypes", () => {
    it("sets node types", () => {
      const testNodeTypes = {
        "test-node": (() => null) as any,
      };

      useMetadataStore.getState().setNodeTypes(testNodeTypes);

      expect(useMetadataStore.getState().nodeTypes).toEqual(testNodeTypes);
    });
  });

  describe("addNodeType", () => {
    it("adds a single node type", () => {
      const TestNodeComponent = (() => null) as any;

      useMetadataStore.getState().addNodeType("new-node", TestNodeComponent);

      const nodeTypes = useMetadataStore.getState().nodeTypes;
      expect(nodeTypes["new-node"]).toBe(TestNodeComponent);
    });

    it("preserves existing node types when adding new one", () => {
      const FirstNodeComponent = (() => null) as any;
      const SecondNodeComponent = (() => null) as any;

      useMetadataStore.getState().addNodeType("first-node", FirstNodeComponent);
      useMetadataStore.getState().addNodeType("second-node", SecondNodeComponent);

      const nodeTypes = useMetadataStore.getState().nodeTypes;
      expect(nodeTypes["first-node"]).toBe(FirstNodeComponent);
      expect(nodeTypes["second-node"]).toBe(SecondNodeComponent);
    });

    it("can add multiple node types in sequence", () => {
      const NodeA = (() => null) as any;
      const NodeB = (() => null) as any;
      const NodeC = (() => null) as any;

      useMetadataStore.getState().addNodeType("node-a", NodeA);
      useMetadataStore.getState().addNodeType("node-b", NodeB);
      useMetadataStore.getState().addNodeType("node-c", NodeC);

      const nodeTypes = useMetadataStore.getState().nodeTypes;
      expect(Object.keys(nodeTypes)).toEqual(["node-a", "node-b", "node-c"]);
    });
  });
});
