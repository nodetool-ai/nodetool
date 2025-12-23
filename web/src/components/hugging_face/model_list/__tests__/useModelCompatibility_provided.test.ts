import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "@jest/globals";
import { useModelCompatibility } from "../useModelCompatibility";
import useMetadataStore from "../../../../stores/MetadataStore";
import type { NodeMetadata, UnifiedModel } from "../../../../stores/ApiTypes";

jest.mock("../../../../stores/MetadataStore");
const mockUseMetadataStore = useMetadataStore as jest.MockedFunction<typeof useMetadataStore>;

const createMockNode = (
  nodeType: string,
  title: string,
  namespace: string,
  recommendedModels: Partial<UnifiedModel>[] = [],
  properties: Array<{ name: string; type: string }> = []
): NodeMetadata => ({
  node_type: nodeType,
  title,
  description: "",
  namespace,
  layout: "default",
  outputs: [],
  properties: properties.map((p) => ({
    name: p.name,
    title: p.name,
    description: "",
    type: { type: p.type, optional: false, values: null, type_args: [], type_name: null },
    default: null,
    required: true,
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

describe("useModelCompatibility - Provided Models", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should match by type and pipeline without over-matching", () => {
    const mockMetadata: Record<string, NodeMetadata> = {
      "flux.node": createMockNode(
        "huggingface.text_to_image.Flux",
        "Flux",
        "huggingface.text_to_image",
        [{ repo_id: "black-forest-labs/FLUX.1-schnell", type: "hf.flux", pipeline_tag: "text-to-image" }],
        [{ name: "model", type: "hf.flux" }]
      ),
      "sd.node": createMockNode(
        "huggingface.text_to_image.StableDiffusion",
        "Stable Diffusion",
        "huggingface.text_to_image",
        [{ repo_id: "runwayml/stable-diffusion-v1-5", type: "hf.stable_diffusion", pipeline_tag: "text-to-image" }],
        [{ name: "model", type: "hf.stable_diffusion" }]
      ),
      "chroma.node": createMockNode(
        "huggingface.text_to_image.Chroma",
        "Chroma",
        "huggingface.text_to_image",
        [{ repo_id: "lodestones/Chroma", type: "hf.text_to_image", pipeline_tag: "text-to-image" }],
        [] // Standalone node, no model property in doc
      ),
      "generic.node": createMockNode(
        "huggingface.text_to_image.Text2Image",
        "Text to Image",
        "huggingface.text_to_image",
        [],
        [{ name: "model", type: "hf.text_to_image" }]
      )
    };
    mockUseMetadataStore.mockReturnValue(mockMetadata);

    const { result } = renderHook(() => useModelCompatibility());

    const fluxModel: UnifiedModel = {
      id: "black-forest-labs/FLUX.1-schnell",
      type: "hf.flux",
      name: "black-forest-labs/FLUX.1-schnell",
      repo_id: "black-forest-labs/FLUX.1-schnell",
      pipeline_tag: "text-to-image",
      tags: ["text-to-image", "flux"],
      downloaded: false,
      path: null,
    } as UnifiedModel;

      const compatibility = result.current.getModelCompatibility(fluxModel);

    const recommendedTypes = compatibility.recommended.map((n) => n.nodeType);
    const compatibleTypes = compatibility.compatible.map((n) => n.nodeType);

    // Flux should be recommended
    expect(recommendedTypes).toContain("huggingface.text_to_image.Flux");

    // These should NOT match a Flux model
    expect(compatibleTypes).not.toContain("huggingface.text_to_image.StableDiffusion");
    expect(compatibleTypes).not.toContain("huggingface.text_to_image.Chroma");

    // Text2Image is okay as it's a generic loader
    expect(compatibleTypes).toContain("huggingface.text_to_image.Text2Image");
  });
});
