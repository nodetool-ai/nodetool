/**
 * Timeline template seeds — NOD-300
 *
 * Seeds three Workflow rows tagged "timeline-template" so they appear in
 * the timeline's Add-Generated-Clip menu (PRD §8).  Each workflow exposes
 * its parameters as Input* nodes, which the timeline reads to build the
 * per-clip override form.
 *
 * Deterministic IDs ensure re-running the seed is idempotent (the Workflow
 * model's save() uses INSERT … ON CONFLICT DO UPDATE).
 */

import { Workflow } from "../workflow.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** The local system user that owns seeded content. */
export const SYSTEM_USER_ID = "1";

/** Tag that marks a workflow as a timeline clip template. */
export const TIMELINE_TEMPLATE_TAG = "timeline-template";

/** Deterministic workflow IDs — stable across re-runs. */
export const SEED_IDS = {
  textToImage: "seed-tt-image-000000000001",
  imageToVideo: "seed-tt-video-000000000001",
  textToSpeech: "seed-tt-speech-000000000001"
} as const;

// ── Graph helpers ─────────────────────────────────────────────────────────────

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

// ── Workflow 1: Text-to-Image ─────────────────────────────────────────────────

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

// ── Workflow 2: Image-to-Video ────────────────────────────────────────────────

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

// ── Workflow 3: Text-to-Speech ────────────────────────────────────────────────

/** OpenAI TTS voices available for SelectInput options. */
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

// ── Seed data ─────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

export const TIMELINE_TEMPLATE_WORKFLOWS: ReadonlyArray<Record<string, unknown>> = [
  {
    id: SEED_IDS.textToImage,
    user_id: SYSTEM_USER_ID,
    name: "Text to Image",
    description: "Generate an image from a text prompt using an AI image model.",
    tags: [TIMELINE_TEMPLATE_TAG],
    access: "public",
    run_mode: "workflow",
    graph: textToImageGraph(),
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
  },
  {
    id: SEED_IDS.imageToVideo,
    user_id: SYSTEM_USER_ID,
    name: "Image to Video",
    description: "Animate a source image into a short video clip using an AI video model.",
    tags: [TIMELINE_TEMPLATE_TAG],
    access: "public",
    run_mode: "workflow",
    graph: imageToVideoGraph(),
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
  },
  {
    id: SEED_IDS.textToSpeech,
    user_id: SYSTEM_USER_ID,
    name: "Text to Speech",
    description: "Convert text into spoken audio using OpenAI's TTS voices.",
    tags: [TIMELINE_TEMPLATE_TAG],
    access: "public",
    run_mode: "workflow",
    graph: textToSpeechGraph(),
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
  }
];

// ── Seed function ─────────────────────────────────────────────────────────────

/**
 * Upsert all timeline template workflows.
 *
 * Safe to call multiple times — uses INSERT … ON CONFLICT DO UPDATE so
 * re-running on an existing database updates rather than duplicates.
 */
export async function seedTimelineTemplates(): Promise<void> {
  for (const wfData of TIMELINE_TEMPLATE_WORKFLOWS) {
    const wf = new Workflow(wfData);
    await wf.save();
  }
}
