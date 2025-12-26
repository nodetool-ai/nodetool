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
    required: !p.type?.optional,
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

    it("should not match stable diffusion nodes for Flux models", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "flux.node": createMockNode(
          "huggingface.text_to_image.Flux",
          "Flux",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.flux", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "sd.node": createMockNode(
          "huggingface.text_to_image.StableDiffusion",
          "Stable Diffusion",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.stable_diffusion", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "generic.node": createMockNode(
          "huggingface.text_to_image.Text2Image",
          "Text to Image",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.text_to_image", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("flux-model", "hf.flux", {
        pipeline_tag: "text-to-image",
      });

      const compatibility = result.current.getModelCompatibility(model);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      expect(matchedNodeTypes).toContain("huggingface.text_to_image.Flux");
      expect(matchedNodeTypes).toContain("huggingface.text_to_image.Text2Image");
      expect(matchedNodeTypes).not.toContain("huggingface.text_to_image.StableDiffusion");
    });

    it("should match by pipeline type", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "asr.node": createMockNode(
          "huggingface.asr.Whisper",
          "Whisper",
          "huggingface.asr",
          [],
          [{ name: "model", type: { type: "hf.automatic_speech_recognition", optional: false, values: null, type_args: [], type_name: null } }]
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

    it("should not match full pipeline nodes when model is just a component (e.g. VAE)", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "sd.node": createMockNode(
          "huggingface.text_to_image.StableDiffusion",
          "SD",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.text_to_image", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "vae.node": createMockNode(
          "huggingface.loaders.VAELoader",
          "VAE Loader",
          "huggingface.loaders",
          [],
          [{ name: "vae", type: { type: "hf.vae", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());

      // A model that is just a VAE
      const vaeModel = createMockModel("some-vae", "hf.vae", {
        pipeline_tag: "vae"
      });

      const compatibility = result.current.getModelCompatibility(vaeModel);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      // Should match the VAE Loader
      expect(matchedNodeTypes).toContain("huggingface.loaders.VAELoader");
      // Should NOT match the Stable Diffusion node (which takes hf.text_to_image)
      expect(matchedNodeTypes).not.toContain("huggingface.text_to_image.StableDiffusion");
    });

    it("should match recommended models by repo_id and path", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "flux.node": createMockNode(
          "huggingface.text_to_image.Flux",
          "Flux",
          "huggingface.text_to_image",
          [
            {
              repo_id: "nunchaku-tech/nunchaku-flux.1-dev",
              path: "svdq-int4_r32-flux.1-dev.safetensors",
              type: "hf.flux"
            }
          ]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("custom-id", "hf.flux", {
        repo_id: "nunchaku-tech/nunchaku-flux.1-dev",
        path: "svdq-int4_r32-flux.1-dev.safetensors",
      });

      const compatibility = result.current.getModelCompatibility(model);
      expect(compatibility.recommended).toHaveLength(1);
      expect(compatibility.recommended[0].nodeType).toBe("huggingface.text_to_image.Flux");
    });

    it("should not match text-to-image nodes for controlnet component models", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "controlnet.node": createMockNode(
          "huggingface.image_to_image.ControlNet",
          "ControlNet",
          "huggingface.image_to_image",
          [],
          [{ name: "controlnet", type: { type: "hf.controlnet", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "sd.node": createMockNode(
          "huggingface.text_to_image.StableDiffusion",
          "Stable Diffusion",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.text_to_image", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("controlnet-model", "hf.controlnet", {
      });

      const compatibility = result.current.getModelCompatibility(model);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      expect(matchedNodeTypes).toContain("huggingface.image_to_image.ControlNet");
      expect(matchedNodeTypes).not.toContain("huggingface.text_to_image.StableDiffusion");
    });

    it("should not match controlnet nodes for Flux controlnet models", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "flux.control.node": createMockNode(
          "huggingface.text_to_image.FluxControl",
          "Flux Control",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.controlnet_flux", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "sd.control.node": createMockNode(
          "huggingface.image_to_image.ControlNet",
          "ControlNet",
          "huggingface.image_to_image",
          [],
          [{ name: "controlnet", type: { type: "hf.controlnet", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("black-forest-labs/FLUX.1-Depth-dev", "hf.controlnet_flux", {
        repo_id: "black-forest-labs/FLUX.1-Depth-dev",
        pipeline_tag: "text-to-image",
      });

      const compatibility = result.current.getModelCompatibility(model);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      expect(matchedNodeTypes).toContain("huggingface.text_to_image.FluxControl");
      expect(matchedNodeTypes).not.toContain("huggingface.image_to_image.ControlNet");
    });

    it("should not match Stable Diffusion nodes for SDXL models", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "sd.node": createMockNode(
          "huggingface.text_to_image.StableDiffusion",
          "Stable Diffusion",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.stable_diffusion", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "sdxl.node": createMockNode(
          "huggingface.text_to_image.StableDiffusionXL",
          "Stable Diffusion XL",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.stable_diffusion_xl", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "generic.node": createMockNode(
          "huggingface.text_to_image.Text2Image",
          "Text to Image",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.text_to_image", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("sdxl-model", "hf.stable_diffusion_xl", {
        pipeline_tag: "text-to-image",
      });

      const compatibility = result.current.getModelCompatibility(model);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      expect(matchedNodeTypes).toContain("huggingface.text_to_image.StableDiffusionXL");
      expect(matchedNodeTypes).toContain("huggingface.text_to_image.Text2Image");
      expect(matchedNodeTypes).not.toContain("huggingface.text_to_image.StableDiffusion");
    });

    it("should match Qwen-Image models without matching Flux or Stable Diffusion nodes", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "qwen.node": createMockNode(
          "huggingface.text_to_image.QwenImage",
          "Qwen-Image",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.qwen_image", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "sd.node": createMockNode(
          "huggingface.text_to_image.StableDiffusion",
          "Stable Diffusion",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.stable_diffusion", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "flux.node": createMockNode(
          "huggingface.text_to_image.Flux",
          "Flux",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.flux", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "generic.node": createMockNode(
          "huggingface.text_to_image.Text2Image",
          "Text to Image",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.text_to_image", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("Qwen/Qwen-Image", "hf.qwen_image", {
        repo_id: "Qwen/Qwen-Image",
        pipeline_tag: "text-to-image",
      });

      const compatibility = result.current.getModelCompatibility(model);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      expect(matchedNodeTypes).toContain("huggingface.text_to_image.QwenImage");
      expect(matchedNodeTypes).toContain("huggingface.text_to_image.Text2Image");
      expect(matchedNodeTypes).not.toContain("huggingface.text_to_image.StableDiffusion");
      expect(matchedNodeTypes).not.toContain("huggingface.text_to_image.Flux");
    });

    it("should match image-to-video pipeline models without matching text-to-video nodes", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "i2v.node": createMockNode(
          "huggingface.image_to_video.Wan_I2V",
          "Wan I2V",
          "huggingface.image_to_video",
          [],
          [{ name: "model", type: { type: "hf.image_to_video", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "t2v.node": createMockNode(
          "huggingface.text_to_video.Wan_T2V",
          "Wan T2V",
          "huggingface.text_to_video",
          [],
          [{ name: "model", type: { type: "hf.text_to_video", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("Wan-AI/Wan2.2-I2V-A14B-Diffusers", null, {
        repo_id: "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
        pipeline_tag: "image-to-video",
      });

      const compatibility = result.current.getModelCompatibility(model);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      expect(matchedNodeTypes).toContain("huggingface.image_to_video.Wan_I2V");
      expect(matchedNodeTypes).not.toContain("huggingface.text_to_video.Wan_T2V");
    });

    it("should match text-to-video pipeline models without matching image-to-video nodes", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "t2v.node": createMockNode(
          "huggingface.text_to_video.Wan_T2V",
          "Wan T2V",
          "huggingface.text_to_video",
          [],
          [{ name: "model", type: { type: "hf.text_to_video", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "i2v.node": createMockNode(
          "huggingface.image_to_video.Wan_I2V",
          "Wan I2V",
          "huggingface.image_to_video",
          [],
          [{ name: "model", type: { type: "hf.image_to_video", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("Wan-AI/Wan2.1-T2V-14B-Diffusers", null, {
        repo_id: "Wan-AI/Wan2.1-T2V-14B-Diffusers",
        pipeline_tag: "text-to-video",
      });

      const compatibility = result.current.getModelCompatibility(model);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      expect(matchedNodeTypes).toContain("huggingface.text_to_video.Wan_T2V");
      expect(matchedNodeTypes).not.toContain("huggingface.image_to_video.Wan_I2V");
    });

    it("should match text-to-speech pipeline models", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "tts.node": createMockNode(
          "huggingface.tts.Bark",
          "Bark",
          "huggingface.tts",
          [],
          [{ name: "model", type: { type: "hf.text_to_speech", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("suno/bark", null, {
        repo_id: "suno/bark",
        pipeline_tag: "text-to-speech",
      });

      const compatibility = result.current.getModelCompatibility(model);
      expect(compatibility.compatible).toHaveLength(1);
      expect(compatibility.compatible[0].nodeType).toBe("huggingface.tts.Bark");
    });

    it("should match inpainting models to inpainting and image-to-image nodes", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "inpaint.node": createMockNode(
          "huggingface.image_to_image.FluxFill",
          "Flux Fill",
          "huggingface.image_to_image",
          [],
          [{ name: "model", type: { type: "hf.inpainting", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "sd.img2img.node": createMockNode(
          "huggingface.image_to_image.StableDiffusionImg2Img",
          "Stable Diffusion Img2Img",
          "huggingface.image_to_image",
          [],
          [{ name: "model", type: { type: "hf.image_to_image", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("black-forest-labs/FLUX.1-Fill-dev", "hf.inpainting", {
        repo_id: "black-forest-labs/FLUX.1-Fill-dev",
        pipeline_tag: "image-to-image",
      });

      const compatibility = result.current.getModelCompatibility(model);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      expect(matchedNodeTypes).toContain("huggingface.image_to_image.FluxFill");
      expect(matchedNodeTypes).toContain("huggingface.image_to_image.StableDiffusionImg2Img");
    });

    it("should match IP-Adapter models to IP-Adapter nodes only", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "ip.node": createMockNode(
          "huggingface.image_to_image.IPAdapter",
          "IP Adapter",
          "huggingface.image_to_image",
          [],
          [{ name: "model", type: { type: "hf.ip_adapter", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "sd.node": createMockNode(
          "huggingface.text_to_image.StableDiffusion",
          "Stable Diffusion",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.text_to_image", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("h94/IP-Adapter", "hf.ip_adapter", {
        repo_id: "h94/IP-Adapter",
      });

      const compatibility = result.current.getModelCompatibility(model);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      expect(matchedNodeTypes).toContain("huggingface.image_to_image.IPAdapter");
      expect(matchedNodeTypes).not.toContain("huggingface.text_to_image.StableDiffusion");
    });

    it("should match LoRA models only to LoRA selector nodes", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "lora.node": createMockNode(
          "huggingface.loaders.SelectLoRASD",
          "Select LoRA SD",
          "huggingface.loaders",
          [],
          [{ name: "loras", type: { type: "hf.lora", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "sd.node": createMockNode(
          "huggingface.text_to_image.StableDiffusion",
          "Stable Diffusion",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.text_to_image", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("some-lora", "hf.lora", {
      });

      const compatibility = result.current.getModelCompatibility(model);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      expect(matchedNodeTypes).toContain("huggingface.loaders.SelectLoRASD");
      expect(matchedNodeTypes).not.toContain("huggingface.text_to_image.StableDiffusion");
    });

    it("should match zero-shot audio classification models to audio nodes only", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "audio.node": createMockNode(
          "huggingface.audio.ZeroShotAudioClassification",
          "Zero Shot Audio Classification",
          "huggingface.audio",
          [],
          [{ name: "model", type: { type: "hf.zero_shot_audio_classification", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "asr.node": createMockNode(
          "huggingface.asr.Whisper",
          "Whisper",
          "huggingface.asr",
          [],
          [{ name: "model", type: { type: "hf.automatic_speech_recognition", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("laion/clap-htsat-unfused", "hf.zero_shot_audio_classification", {
        repo_id: "laion/clap-htsat-unfused",
        pipeline_tag: "feature-extraction",
      });

      const compatibility = result.current.getModelCompatibility(model);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      expect(matchedNodeTypes).toContain("huggingface.audio.ZeroShotAudioClassification");
      expect(matchedNodeTypes).not.toContain("huggingface.asr.Whisper");
    });

    it("should not match image nodes when ASR models have conflicting tags", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "asr.node": createMockNode(
          "huggingface.automatic_speech_recognition.Whisper",
          "Whisper",
          "huggingface.automatic_speech_recognition",
          [],
          [{ name: "model", type: { type: "hf.automatic_speech_recognition", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "sd.node": createMockNode(
          "huggingface.text_to_image.StableDiffusion",
          "Stable Diffusion",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.text_to_image", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());
      const model = createMockModel("openai/whisper-large-v3", "hf.automatic_speech_recognition", {
        repo_id: "openai/whisper-large-v3",
        tags: ["automatic-speech-recognition", "text-to-image"],
        pipeline_tag: "text-to-image",
      });

      const compatibility = result.current.getModelCompatibility(model);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      expect(matchedNodeTypes).toContain("huggingface.automatic_speech_recognition.Whisper");
      expect(matchedNodeTypes).not.toContain("huggingface.text_to_image.StableDiffusion");
    });

    it("should match component models by type even with unrelated tags", () => {
      const mockMetadata: Record<string, NodeMetadata> = {
        "sd.node": createMockNode(
          "huggingface.text_to_image.StableDiffusion",
          "SD",
          "huggingface.text_to_image",
          [],
          [{ name: "model", type: { type: "hf.text_to_image", optional: false, values: null, type_args: [], type_name: null } }]
        ),
        "vae.node": createMockNode(
          "huggingface.loaders.VAELoader",
          "VAE Loader",
          "huggingface.loaders",
          [],
          [{ name: "vae", type: { type: "hf.vae", optional: false, values: null, type_args: [], type_name: null } }]
        ),
      };
      mockUseMetadataStore.mockReturnValue(mockMetadata);

      const { result } = renderHook(() => useModelCompatibility());

      const complexModel = createMockModel("some-sd-vae", "hf.vae", {
        tags: ["stable-diffusion", "vae"],
      });

      const compatibility = result.current.getModelCompatibility(complexModel);
      const matchedNodeTypes = compatibility.compatible.map((n) => n.nodeType);

      // Should match the VAE Loader
      expect(matchedNodeTypes).toContain("huggingface.loaders.VAELoader");
      // Tags should not cause matching to unrelated pipeline nodes.
      expect(matchedNodeTypes).not.toContain("huggingface.text_to_image.StableDiffusion");
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
