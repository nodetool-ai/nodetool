import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { useModelCompatibility } from "../useModelCompatibility";
import useMetadataStore from "../../../../stores/MetadataStore";
import type { NodeMetadata, UnifiedModel } from "../../../../stores/ApiTypes";

// Mock dependencies
jest.mock("../../../../stores/MetadataStore");

const mockUseMetadataStore = useMetadataStore as jest.MockedFunction<
  typeof useMetadataStore
>;

// Helper to create a mock NodeMetadata
const createMockNode = (
  nodeType: string,
  title: string,
  namespace: string,
  recommendedModels: Partial<UnifiedModel>[] = [],
  properties: Array<{
    name: string;
    title?: string;
    type?: { type: string; optional: boolean; values: null; type_args: []; type_name: null };
  }> = []
): NodeMetadata => ({
  node_type: nodeType,
  title,
  description: "",
  namespace,
  layout: "default",
  outputs: [],
  properties: properties.map((p) => ({
    name: p.name,
    title: p.title,
    description: "",
    type: p.type || { type: "str", optional: false, values: null, type_args: [], type_name: null },
    default: null,
  })),
  recommended_models: recommendedModels.map((m) => ({
    id: m.id || "model-id",
    type: m.type || null,
    name: m.name || "Model Name",
    repo_id: m.repo_id || null,
    downloaded: m.downloaded || false,
    tags: m.tags || [],
    pipeline_tag: m.pipeline_tag || null,
    path: m.path || null,
  })) as UnifiedModel[],
  basic_fields: [],
  is_dynamic: false,
  is_streaming_output: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false,
  the_model_info: {},
});

// Helper to create a mock UnifiedModel
const createMockModel = (
  id: string,
  type: string | null,
  options: Partial<UnifiedModel> = {}
): UnifiedModel => ({
  id,
  type,
  name: options.name || id,
  repo_id: options.repo_id || null,
  downloaded: options.downloaded || false,
  tags: options.tags || [],
  pipeline_tag: options.pipeline_tag || null,
  path: options.path || null,
});

describe("useModelCompatibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getModelCompatibility", () => {
    it("should return empty arrays for null model", () => {
      mockUseMetadataStore.mockReturnValue({});

      const { result } = renderHook(() => useModelCompatibility());
      const compatibility = result.current.getModelCompatibility(null);

      expect(compatibility.recommended).toEqual([]);
      expect(compatibility.compatible).toEqual([]);
    });

    it("should match by repo_id for recommended nodes", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "flux.node": createMockNode(
          "huggingface.text_to_image.Flux",
          "Flux",
          "huggingface.text_to_image",
          [{ repo_id: "black-forest-labs/FLUX.1-dev", id: "flux-1-dev" }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("flux-1-dev", "hf.flux", {
        repo_id: "black-forest-labs/FLUX.1-dev",
      });
      const compatibility = result.current.getModelCompatibility(model);

      expect(compatibility.recommended).toHaveLength(1);
      expect(compatibility.recommended[0].nodeType).toBe(
        "huggingface.text_to_image.Flux"
      );
    });

    it("should match by property type for compatible nodes", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "flux.node": createMockNode(
          "huggingface.text_to_image.Flux",
          "Flux",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.flux", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("flux-model", "hf.flux");
      const compatibility = result.current.getModelCompatibility(model);

      expect(compatibility.compatible).toHaveLength(1);
      expect(compatibility.compatible[0].nodeType).toBe(
        "huggingface.text_to_image.Flux"
      );
    });

    it("should NOT match nodes with different generic tags (preventing false positives)", () => {
      // This is the key test for the bug fix
      // A Flux model and a Chroma (vector DB) node should NOT be matched
      // even if they share generic tags like "pytorch"
      const mockMetadata: Record<string, NodeMetadata> = {
        // Flux node - image generation
        "flux.node": createMockNode(
          "huggingface.text_to_image.Flux",
          "Flux",
          "huggingface.text_to_image",
          [{ repo_id: "flux-model", tags: ["pytorch", "text-to-image", "diffusion"] }],
          [{ name: "model", type: { type: "hf.flux", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        // Chroma node - vector database (should NOT match Flux models)
        "chroma.node": createMockNode(
          "vector.chroma.QueryText",
          "Query Text",
          "vector.chroma",
          // The Chroma node recommends embedding models, not image models
          [{ repo_id: "sentence-transformers/all-MiniLM-L6-v2", tags: ["pytorch", "feature-extraction"] }],
          [{ name: "collection", type: { type: "collection", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());

      // A Flux model with generic tags
      const fluxModel = createMockModel("black-forest-labs/FLUX.1-dev", "hf.flux", {
        repo_id: "black-forest-labs/FLUX.1-dev",
        tags: ["pytorch", "text-to-image", "diffusion", "flux"],
        pipeline_tag: "text-to-image",
      });

      const compatibility = result.current.getModelCompatibility(fluxModel);

      // The Flux model should match the Flux node, not the Chroma node
      const matchedNodeTypes = [
        ...compatibility.recommended.map((n) => n.nodeType),
        ...compatibility.compatible.map((n) => n.nodeType),
      ];

      // Chroma node should NOT be in the matches
      expect(matchedNodeTypes).not.toContain("vector.chroma.QueryText");
      // Flux node could be in matches (if matched by type)
      expect(matchedNodeTypes).toContain("huggingface.text_to_image.Flux");
    });

    it("should NOT match by generic tags alone", () => {
      // Two completely different nodes that share a generic tag
      const mockMetadata: Record<string, NodeMetadata> = {
        "node.a": createMockNode(
          "namespace.NodeA",
          "Node A",
          "namespace",
          [{ repo_id: "model-a", tags: ["pytorch", "diffusers"] }]
        ),
        "node.b": createMockNode(
          "namespace.NodeB",
          "Node B",
          "namespace",
          [{ repo_id: "model-b", tags: ["pytorch", "transformers"] }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());

      // A model with the "pytorch" tag but NOT matching either recommended repo
      const model = createMockModel("some-other-model", "hf.other", {
        repo_id: "some/other-model",
        tags: ["pytorch"],  // Same generic tag as both nodes
      });

      const compatibility = result.current.getModelCompatibility(model);

      // Should NOT match either node just because of shared "pytorch" tag
      expect(compatibility.recommended).toHaveLength(0);
      // Without type/pipeline matching, should have no compatible nodes
      expect(compatibility.compatible).toHaveLength(0);
    });

    it("should match by pipeline_tag", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "asr.node": createMockNode(
          "huggingface.asr.Whisper",
          "Whisper",
          "huggingface.asr",
          [{ pipeline_tag: "automatic-speech-recognition" }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("whisper-model", "hf.automatic_speech_recognition", {
        pipeline_tag: "automatic-speech-recognition",
      });
      const compatibility = result.current.getModelCompatibility(model);

      expect(compatibility.compatible).toHaveLength(1);
      expect(compatibility.compatible[0].nodeType).toBe("huggingface.asr.Whisper");
    });

    it("should not duplicate nodes in recommended and compatible", () => {
      // A node that could match both by repo_id and by type
      const mockMetadata: Record<string, NodeMetadata> = {
        "flux.node": createMockNode(
          "huggingface.text_to_image.Flux",
          "Flux",
          "huggingface.text_to_image",
          [{ repo_id: "black-forest-labs/FLUX.1-dev", type: "hf.flux" }],
          [{ name: "model", type: { type: "hf.flux", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("flux-model", "hf.flux", {
        repo_id: "black-forest-labs/FLUX.1-dev",
      });
      const compatibility = result.current.getModelCompatibility(model);

      // Should be in recommended (by repo_id match)
      expect(compatibility.recommended).toHaveLength(1);
      // Should NOT also be in compatible (already in recommended)
      expect(compatibility.compatible).toHaveLength(0);
    });
  });
});
