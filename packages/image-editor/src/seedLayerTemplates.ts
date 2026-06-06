import type { LayerTemplateDefinition } from "./types.js";

export const IMAGE_EDITOR_TEMPLATE_TAG = "image-editor-layer-template";

export const LAYER_TEMPLATE_SEED_IDS = {
  textToImage: "seed-ie-layer-tt-image-0000001",
  inpaint: "seed-ie-layer-inpaint-00000001",
  backgroundRemove: "seed-ie-layer-bg-remove-000001"
} as const;

type NodeDef = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  ui_properties?: Record<string, unknown>;
};

type EdgeDef = {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
};

function node(def: NodeDef): Record<string, unknown> {
  return {
    id: def.id,
    type: def.type,
    data: def.data,
    ui_properties: def.ui_properties ?? {}
  };
}

function edge(def: EdgeDef): Record<string, unknown> {
  return {
    id: def.id,
    source: def.source,
    sourceHandle: def.sourceHandle,
    target: def.target,
    targetHandle: def.targetHandle
  };
}

function textToImageGraph(): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } {
  const nodes = [
    node({
      id: "prompt",
      type: "nodetool.input.StringInput",
      data: { name: "prompt", value: "", description: "Prompt for generated layer content" },
      ui_properties: { x: 0, y: 0 }
    }),
    node({
      id: "negative_prompt",
      type: "nodetool.input.StringInput",
      data: { name: "negative_prompt", value: "", description: "Optional negative prompt" },
      ui_properties: { x: 0, y: 160 }
    }),
    node({
      id: "model",
      type: "nodetool.input.ImageModelInput",
      data: {
        name: "model",
        value: {
          type: "image_model",
          provider: "huggingface_fal_ai",
          id: "fal-ai/flux/schnell",
          name: "FLUX.1 Schnell",
          path: null,
          supported_tasks: []
        },
        description: "Image generation model"
      },
      ui_properties: { x: 0, y: 320 }
    }),
    node({
      id: "tti",
      type: "nodetool.image.TextToImage",
      data: {
        model: {
          type: "image_model",
          provider: "huggingface_fal_ai",
          id: "fal-ai/flux/schnell",
          name: "FLUX.1 Schnell",
          path: null,
          supported_tasks: []
        },
        prompt: "",
        negative_prompt: "",
        aspect_ratio: "1:1",
        resolution: "1K",
        timeout_seconds: 0
      },
      ui_properties: { x: 340, y: 160 }
    }),
    node({
      id: "output",
      type: "nodetool.output.Output",
      data: { name: "image", value: null, description: "Generated layer image" },
      ui_properties: { x: 680, y: 160 }
    })
  ];

  const edges = [
    edge({ id: "e1", source: "prompt", sourceHandle: "output", target: "tti", targetHandle: "prompt" }),
    edge({
      id: "e2",
      source: "negative_prompt",
      sourceHandle: "output",
      target: "tti",
      targetHandle: "negative_prompt"
    }),
    edge({ id: "e3", source: "model", sourceHandle: "output", target: "tti", targetHandle: "model" }),
    edge({ id: "e4", source: "tti", sourceHandle: "output", target: "output", targetHandle: "value" })
  ];

  return { nodes, edges };
}

function inpaintGraph(): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } {
  const nodes = [
    node({
      id: "image",
      type: "nodetool.input.ImageInput",
      data: {
        name: "image",
        value: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
        description: "Source image to inpaint"
      },
      ui_properties: { x: 0, y: 0 }
    }),
    node({
      id: "prompt",
      type: "nodetool.input.StringInput",
      data: { name: "prompt", value: "", description: "Inpaint instruction" },
      ui_properties: { x: 0, y: 160 }
    }),
    node({
      id: "model",
      type: "nodetool.input.ImageModelInput",
      data: {
        name: "model",
        value: {
          type: "image_model",
          provider: "huggingface_fal_ai",
          id: "fal-ai/flux/dev",
          name: "FLUX.1 Dev",
          path: null,
          supported_tasks: []
        },
        description: "Inpainting-capable model"
      },
      ui_properties: { x: 0, y: 320 }
    }),
    node({
      id: "i2i",
      type: "nodetool.image.ImageToImage",
      data: {
        model: {
          type: "image_model",
          provider: "huggingface_fal_ai",
          id: "fal-ai/flux/dev",
          name: "FLUX.1 Dev",
          path: null,
          supported_tasks: []
        },
        image: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
        prompt: "",
        negative_prompt: "",
        strength: 0.65,
        aspect_ratio: "1:1",
        resolution: "1K",
        timeout_seconds: 0
      },
      ui_properties: { x: 340, y: 160 }
    }),
    node({
      id: "output",
      type: "nodetool.output.Output",
      data: { name: "image", value: null, description: "Inpainted image" },
      ui_properties: { x: 680, y: 160 }
    })
  ];

  const edges = [
    edge({ id: "e1", source: "image", sourceHandle: "output", target: "i2i", targetHandle: "image" }),
    edge({ id: "e2", source: "prompt", sourceHandle: "output", target: "i2i", targetHandle: "prompt" }),
    edge({ id: "e3", source: "model", sourceHandle: "output", target: "i2i", targetHandle: "model" }),
    edge({ id: "e4", source: "i2i", sourceHandle: "output", target: "output", targetHandle: "value" })
  ];

  return { nodes, edges };
}

function backgroundRemoveGraph(): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } {
  // Uses the dedicated RemoveBackground node, which returns a true alpha
  // cutout. (Prompt-guided ImageToImage cannot emit transparency.)
  const bgModel = {
    type: "image_model",
    provider: "fal_ai",
    id: "fal-ai/bria/background/remove",
    name: "Bria Background Remove",
    path: null,
    supported_tasks: []
  };
  const nodes = [
    node({
      id: "image",
      type: "nodetool.input.ImageInput",
      data: {
        name: "image",
        value: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
        description: "Image to remove background from"
      },
      ui_properties: { x: 0, y: 0 }
    }),
    node({
      id: "model",
      type: "nodetool.input.ImageModelInput",
      data: {
        name: "model",
        value: bgModel,
        description: "Background-removal model"
      },
      ui_properties: { x: 0, y: 160 }
    }),
    node({
      id: "rembg",
      type: "nodetool.image.RemoveBackground",
      data: {
        model: bgModel,
        image: { type: "image", uri: "", asset_id: null, data: null, metadata: null }
      },
      ui_properties: { x: 340, y: 80 }
    }),
    node({
      id: "output",
      type: "nodetool.output.Output",
      data: { name: "image", value: null, description: "Foreground image with removed background" },
      ui_properties: { x: 680, y: 80 }
    })
  ];

  const edges = [
    edge({ id: "e1", source: "image", sourceHandle: "output", target: "rembg", targetHandle: "image" }),
    edge({ id: "e2", source: "model", sourceHandle: "output", target: "rembg", targetHandle: "model" }),
    edge({ id: "e3", source: "rembg", sourceHandle: "output", target: "output", targetHandle: "value" })
  ];

  return { nodes, edges };
}

export const SEEDED_LAYER_TEMPLATES: LayerTemplateDefinition[] = [
  {
    id: LAYER_TEMPLATE_SEED_IDS.textToImage,
    kind: "text-to-image",
    name: "Text-to-Image",
    description: "Generate a layer from a text prompt.",
    graph: textToImageGraph()
  },
  {
    id: LAYER_TEMPLATE_SEED_IDS.inpaint,
    kind: "inpaint",
    name: "Inpaint",
    description: "Edit and regenerate selected regions of a source image.",
    graph: inpaintGraph()
  },
  {
    id: LAYER_TEMPLATE_SEED_IDS.backgroundRemove,
    kind: "background-remove",
    name: "Background Remove",
    description: "Remove the background while keeping the foreground subject.",
    graph: backgroundRemoveGraph()
  }
];
