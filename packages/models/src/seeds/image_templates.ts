import { Workflow } from "../workflow.js";

export const SYSTEM_USER_ID = "1";
export const IMAGE_TEMPLATE_TAG = "image-template";
export const IMAGE_SEED_IDS = {
  textToImage: "seed-img-tti-0000000000001",
  inpaint: "seed-img-inp-0000000000001",
  backgroundRemove: "seed-img-bgr-0000000000001"
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
    parent_id: null,
    ui_properties: def.ui_properties ?? {},
    dynamic_properties: {},
    dynamic_outputs: {}
  };
}

function edge(def: EdgeDef): Record<string, unknown> {
  return {
    id: def.id,
    source: def.source,
    sourceHandle: def.sourceHandle,
    target: def.target,
    targetHandle: def.targetHandle,
    ui_properties: null,
    edge_type: "data"
  };
}

function textToImageGraph(): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } {
  const nodes = [
    node({
      id: "prompt",
      type: "nodetool.input.StringInput",
      data: { name: "prompt", value: "", description: "Image description" },
      ui_properties: { x: 0, y: 0 }
    }),
    node({
      id: "negative_prompt",
      type: "nodetool.input.StringInput",
      data: {
        name: "negative_prompt",
        value: "low quality, blurry",
        description: "What to avoid in the image"
      },
      ui_properties: { x: 0, y: 160 }
    }),
    node({
      id: "seed",
      type: "nodetool.input.IntegerInput",
      data: { name: "seed", value: 0, description: "Random seed", min: 0 },
      ui_properties: { x: 0, y: 320 }
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
      ui_properties: { x: 0, y: 480 }
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
        negative_prompt: "low quality, blurry",
        aspect_ratio: "1:1",
        resolution: "1K",
        timeout_seconds: 0
      },
      ui_properties: { x: 340, y: 160 }
    }),
    node({
      id: "output",
      type: "nodetool.output.ImageOutput",
      data: { name: "image", value: null, description: "Generated image" },
      ui_properties: { x: 680, y: 160 }
    })
  ];

  const edges = [
    edge({ id: "e1", source: "prompt", sourceHandle: "output", target: "tti", targetHandle: "prompt" }),
    edge({ id: "e2", source: "negative_prompt", sourceHandle: "output", target: "tti", targetHandle: "negative_prompt" }),
    edge({ id: "e3", source: "seed", sourceHandle: "output", target: "tti", targetHandle: "seed" }),
    edge({ id: "e4", source: "model", sourceHandle: "output", target: "tti", targetHandle: "model" }),
    edge({ id: "e5", source: "tti", sourceHandle: "output", target: "output", targetHandle: "value" })
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
      id: "mask",
      type: "nodetool.input.ImageInput",
      data: {
        name: "mask",
        value: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
        description: "Mask (white = inpaint region)"
      },
      ui_properties: { x: 0, y: 160 }
    }),
    node({
      id: "prompt",
      type: "nodetool.input.StringInput",
      data: { name: "prompt", value: "", description: "What to generate in the masked area" },
      ui_properties: { x: 0, y: 320 }
    }),
    node({
      id: "seed",
      type: "nodetool.input.IntegerInput",
      data: { name: "seed", value: 0, description: "Random seed", min: 0 },
      ui_properties: { x: 0, y: 480 }
    }),
    node({
      id: "inpaint",
      type: "nodetool.image.Inpaint",
      data: {
        model: {
          type: "image_model",
          provider: "huggingface_fal_ai",
          id: "fal-ai/flux/schnell",
          name: "FLUX.1 Schnell",
          path: null,
          supported_tasks: []
        },
        image: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
        mask: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
        prompt: "",
        timeout_seconds: 0
      },
      ui_properties: { x: 340, y: 160 }
    }),
    node({
      id: "output",
      type: "nodetool.output.ImageOutput",
      data: { name: "image", value: null, description: "Inpainted image" },
      ui_properties: { x: 680, y: 160 }
    })
  ];

  const edges = [
    edge({ id: "e1", source: "image", sourceHandle: "output", target: "inpaint", targetHandle: "image" }),
    edge({ id: "e2", source: "mask", sourceHandle: "output", target: "inpaint", targetHandle: "mask" }),
    edge({ id: "e3", source: "prompt", sourceHandle: "output", target: "inpaint", targetHandle: "prompt" }),
    edge({ id: "e4", source: "seed", sourceHandle: "output", target: "inpaint", targetHandle: "seed" }),
    edge({ id: "e5", source: "inpaint", sourceHandle: "output", target: "output", targetHandle: "value" })
  ];

  return { nodes, edges };
}

function backgroundRemoveGraph(): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } {
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
      id: "rembg",
      type: "nodetool.image.RemoveBackground",
      data: {
        image: { type: "image", uri: "", asset_id: null, data: null, metadata: null }
      },
      ui_properties: { x: 340, y: 0 }
    }),
    node({
      id: "output",
      type: "nodetool.output.ImageOutput",
      data: { name: "image", value: null, description: "Image with background removed" },
      ui_properties: { x: 680, y: 0 }
    })
  ];

  const edges = [
    edge({ id: "e1", source: "image", sourceHandle: "output", target: "rembg", targetHandle: "image" }),
    edge({ id: "e2", source: "rembg", sourceHandle: "output", target: "output", targetHandle: "value" })
  ];

  return { nodes, edges };
}

type WorkflowSeedDef = {
  id: string;
  name: string;
  description: string;
  graphFn: () => { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };
};

const WORKFLOW_SEED_DEFS: ReadonlyArray<WorkflowSeedDef> = [
  {
    id: IMAGE_SEED_IDS.textToImage,
    name: "Text to Image (Layer)",
    description: "Generate an image layer from a text prompt.",
    graphFn: textToImageGraph
  },
  {
    id: IMAGE_SEED_IDS.inpaint,
    name: "Inpaint (Layer)",
    description: "Inpaint a masked region of an image layer with AI.",
    graphFn: inpaintGraph
  },
  {
    id: IMAGE_SEED_IDS.backgroundRemove,
    name: "Background Remove (Layer)",
    description: "Remove the background from an image layer.",
    graphFn: backgroundRemoveGraph
  }
];

export async function seedImageTemplates(): Promise<void> {
  const now = new Date().toISOString();
  for (const def of WORKFLOW_SEED_DEFS) {
    const wf = new Workflow({
      id: def.id,
      user_id: SYSTEM_USER_ID,
      name: def.name,
      description: def.description,
      tags: [IMAGE_TEMPLATE_TAG],
      access: "public",
      run_mode: "workflow",
      graph: def.graphFn(),
      settings: null,
      tool_name: null,
      package_name: null,
      path: null,
      workspace_id: null,
      html_app: null,
      thumbnail: null,
      thumbnail_url: null,
      created_at: now,
      updated_at: now
    });
    await wf.save();
  }
}
