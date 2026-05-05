import { Workflow } from "../workflow.js";

export const SYSTEM_USER_ID = "1";
export const TIMELINE_TEMPLATE_TAG = "timeline-template";
export const SEED_IDS = {
  textToImage: "seed-tt-image-000000000001",
  imageToVideo: "seed-tt-video-000000000001",
  textToSpeech: "seed-tt-speech-000000000001"
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
    dynamic_outputs: {},
    sync_mode: "on_any"
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
        negative_prompt: "low quality, blurry",
        aspect_ratio: "1:1",
        resolution: "1K",
        timeout_seconds: 0
      },
      ui_properties: { x: 340, y: 160 }
    }),
    node({
      id: "output",
      type: "nodetool.output.Output",
      data: { name: "image", value: null, description: "Generated image" },
      ui_properties: { x: 680, y: 160 }
    })
  ];

  const edges = [
    edge({ id: "e1", source: "prompt", sourceHandle: "output", target: "tti", targetHandle: "prompt" }),
    edge({ id: "e2", source: "negative_prompt", sourceHandle: "output", target: "tti", targetHandle: "negative_prompt" }),
    edge({ id: "e3", source: "model", sourceHandle: "output", target: "tti", targetHandle: "model" }),
    edge({ id: "e4", source: "tti", sourceHandle: "output", target: "output", targetHandle: "value" })
  ];

  return { nodes, edges };
}

function imageToVideoGraph(): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } {
  const nodes = [
    node({
      id: "source_image",
      type: "nodetool.input.ImageInput",
      data: {
        name: "source_image",
        value: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
        description: "Source image to animate"
      },
      ui_properties: { x: 0, y: 0 }
    }),
    node({
      id: "prompt",
      type: "nodetool.input.StringInput",
      data: { name: "prompt", value: "", description: "Optional animation prompt" },
      ui_properties: { x: 0, y: 160 }
    }),
    node({
      id: "duration",
      type: "nodetool.input.IntegerInput",
      data: { name: "duration", value: 4, description: "Video duration in seconds", min: 1, max: 60 },
      ui_properties: { x: 0, y: 320 }
    }),
    node({
      id: "i2v",
      type: "nodetool.video.ImageToVideo",
      data: {
        image: { type: "image", uri: "", asset_id: null, data: null, metadata: null },
        model: {
          type: "video_model",
          provider: "gemini",
          id: "veo-3.1-generate-preview",
          name: "Veo 3.1 Preview",
          path: null,
          supported_tasks: []
        },
        prompt: "",
        negative_prompt: "",
        aspect_ratio: "16:9",
        resolution: "1080p",
        duration: 4,
        timeout_seconds: 0
      },
      ui_properties: { x: 340, y: 160 }
    }),
    node({
      id: "output",
      type: "nodetool.output.Output",
      data: { name: "video", value: null, description: "Generated video" },
      ui_properties: { x: 680, y: 160 }
    })
  ];

  const edges = [
    edge({ id: "e1", source: "source_image", sourceHandle: "output", target: "i2v", targetHandle: "image" }),
    edge({ id: "e2", source: "prompt", sourceHandle: "output", target: "i2v", targetHandle: "prompt" }),
    edge({ id: "e3", source: "duration", sourceHandle: "output", target: "i2v", targetHandle: "duration" }),
    edge({ id: "e4", source: "i2v", sourceHandle: "output", target: "output", targetHandle: "value" })
  ];

  return { nodes, edges };
}

const TTS_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"];

function textToSpeechGraph(): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } {
  const nodes = [
    node({
      id: "text",
      type: "nodetool.input.StringInput",
      data: { name: "text", value: "", description: "Text to convert to speech" },
      ui_properties: { x: 0, y: 0 }
    }),
    node({
      id: "voice",
      type: "nodetool.input.SelectInput",
      data: {
        name: "voice",
        value: "alloy",
        description: "Voice to use for speech synthesis",
        options: TTS_VOICES,
        enum_type_name: ""
      },
      ui_properties: { x: 0, y: 160 }
    }),
    node({
      id: "tts",
      type: "openai.audio.TextToSpeech",
      data: {
        model: "tts-1",
        voice: "alloy",
        input: "",
        speed: 1
      },
      ui_properties: { x: 340, y: 80 }
    }),
    node({
      id: "output",
      type: "nodetool.output.Output",
      data: { name: "audio", value: null, description: "Generated audio" },
      ui_properties: { x: 680, y: 80 }
    })
  ];

  const edges = [
    edge({ id: "e1", source: "text", sourceHandle: "output", target: "tts", targetHandle: "input" }),
    edge({ id: "e2", source: "voice", sourceHandle: "output", target: "tts", targetHandle: "voice" }),
    edge({ id: "e3", source: "tts", sourceHandle: "output", target: "output", targetHandle: "value" })
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
    id: SEED_IDS.textToImage,
    name: "Text to Image",
    description: "Generate an image from a text prompt using an AI image model.",
    graphFn: textToImageGraph
  },
  {
    id: SEED_IDS.imageToVideo,
    name: "Image to Video",
    description: "Animate a source image into a short video clip using an AI video model.",
    graphFn: imageToVideoGraph
  },
  {
    id: SEED_IDS.textToSpeech,
    name: "Text to Speech",
    description: "Convert text into spoken audio using OpenAI's TTS voices.",
    graphFn: textToSpeechGraph
  }
];

export async function seedTimelineTemplates(): Promise<void> {
  const now = new Date().toISOString();
  for (const def of WORKFLOW_SEED_DEFS) {
    const wf = new Workflow({
      id: def.id,
      user_id: SYSTEM_USER_ID,
      name: def.name,
      description: def.description,
      tags: [TIMELINE_TEMPLATE_TAG],
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

