#!/usr/bin/env node
/**
 * Generate `src/together-manifest.json` from the Together AI serverless catalog.
 *
 * The catalog below is the single source of truth for Together's media models.
 * `@nodetool-ai/runtime`'s together-provider reads the emitted manifest (via
 * manifest-models.ts) for its image/video model lists, and this package's
 * factory turns every entry into a workflow node — so editing this file and
 * re-running `npm run gen:manifest` updates both at once.
 *
 * Sources: https://docs.together.ai/docs/serverless/models
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "together-manifest.json");

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const IMAGE_MODELS = [
  { id: "black-forest-labs/FLUX.1-schnell", name: "FLUX.1 Schnell", tasks: ["text_to_image"] },
  { id: "black-forest-labs/FLUX.1.1-pro", name: "FLUX.1.1 Pro", tasks: ["text_to_image"] },
  { id: "black-forest-labs/FLUX.2-pro", name: "FLUX.2 Pro", tasks: ["text_to_image", "image_to_image"] },
  { id: "black-forest-labs/FLUX.2-dev", name: "FLUX.2 Dev", tasks: ["text_to_image", "image_to_image"] },
  { id: "black-forest-labs/FLUX.2-flex", name: "FLUX.2 Flex", tasks: ["text_to_image", "image_to_image"] },
  { id: "black-forest-labs/FLUX.1-kontext-pro", name: "FLUX.1 Kontext Pro", tasks: ["text_to_image", "image_to_image"] },
  { id: "black-forest-labs/FLUX.1-kontext-max", name: "FLUX.1 Kontext Max", tasks: ["text_to_image", "image_to_image"] },
  { id: "google/imagen-4.0-preview", name: "Imagen 4.0 Preview", tasks: ["text_to_image"] },
  { id: "google/imagen-4.0-fast", name: "Imagen 4.0 Fast", tasks: ["text_to_image"] },
  { id: "google/flash-image-2.5", name: "Flash Image 2.5", tasks: ["text_to_image"] },
  { id: "google/gemini-3-pro-image", name: "Gemini 3 Pro Image", tasks: ["text_to_image", "image_to_image"] },
  { id: "ideogram/ideogram-3.0", name: "Ideogram 3.0", tasks: ["text_to_image"] },
  { id: "ByteDance-Seed/Seedream-4.0", name: "Seedream 4.0", tasks: ["text_to_image"] },
  { id: "ByteDance-Seed/Seedream-3.0", name: "Seedream 3.0", tasks: ["text_to_image"] },
  { id: "stabilityai/stable-diffusion-3-medium", name: "Stable Diffusion 3 Medium", tasks: ["text_to_image"] }
];

const VIDEO_MODELS = [
  { id: "minimax/hailuo-02", name: "MiniMax Hailuo 02", tasks: ["text_to_video", "image_to_video"] },
  { id: "minimax/video-01-director", name: "MiniMax Video 01 Director", tasks: ["text_to_video", "image_to_video"] },
  { id: "google/veo-3.0", name: "Veo 3.0", tasks: ["text_to_video", "image_to_video"] },
  { id: "google/veo-3.0-audio", name: "Veo 3.0 + Audio", tasks: ["text_to_video"] },
  { id: "google/veo-2.0", name: "Veo 2.0", tasks: ["text_to_video", "image_to_video"] },
  { id: "openai/sora-2", name: "Sora 2", tasks: ["text_to_video", "image_to_video"] },
  { id: "openai/sora-2-pro", name: "Sora 2 Pro", tasks: ["text_to_video", "image_to_video"] },
  { id: "kwaivgI/kling-2.1-master", name: "Kling 2.1 Master", tasks: ["text_to_video", "image_to_video"] },
  { id: "kwaivgI/kling-2.1-standard", name: "Kling 2.1 Standard", tasks: ["text_to_video", "image_to_video"] },
  { id: "kwaivgI/kling-2.1-pro", name: "Kling 2.1 Pro", tasks: ["text_to_video", "image_to_video"] },
  { id: "ByteDance/Seedance-1.0-pro", name: "Seedance 1.0 Pro", tasks: ["text_to_video", "image_to_video"] },
  { id: "ByteDance/Seedance-1.0-lite", name: "Seedance 1.0 Lite", tasks: ["text_to_video", "image_to_video"] },
  { id: "pixverse/pixverse-v5", name: "PixVerse v5", tasks: ["text_to_video", "image_to_video"] },
  { id: "vidu/vidu-2.0", name: "Vidu 2.0", tasks: ["text_to_video", "image_to_video"] },
  { id: "vidu/vidu-q1", name: "Vidu Q1", tasks: ["text_to_video", "image_to_video"] }
];

const TTS_MODELS = [
  {
    id: "canopylabs/orpheus-3b-0.1-ft",
    name: "Orpheus 3B",
    voices: ["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe"]
  },
  {
    id: "hexgrad/Kokoro-82M",
    name: "Kokoro 82M",
    voices: [
      "af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore",
      "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky", "am_adam",
      "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx",
      "am_puck", "am_santa", "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
      "bm_daniel", "bm_fable", "bm_george", "bm_lewis"
    ]
  },
  {
    id: "cartesia/sonic",
    name: "Cartesia Sonic",
    voices: [
      "friendly sidekick", "reading lady", "newsman", "meditation lady",
      "calm lady", "helpful woman", "laidback woman", "professional woman"
    ]
  }
];

const ASR_MODELS = [
  { id: "openai/whisper-large-v3", name: "Whisper Large v3" },
  { id: "mistralai/Voxtral-Mini-3B-2507", name: "Voxtral Mini 3B" },
  { id: "nvidia/parakeet-tdt-0.6b-v3", name: "Parakeet TDT 0.6B v3" }
];

// ---------------------------------------------------------------------------
// Field templates
// ---------------------------------------------------------------------------

const F = {
  prompt: (required) => ({
    name: "prompt", type: "str", default: "", title: "Prompt", required,
    description: "Text prompt describing the desired output."
  }),
  negativePrompt: {
    name: "negative_prompt", type: "str", default: "", title: "Negative Prompt",
    description: "Describe what to avoid. Ignored by models that don't support it."
  },
  steps: {
    name: "steps", type: "int", default: null, title: "Steps",
    description: "Number of inference steps. Leave unset for the model default."
  },
  guidance: {
    name: "guidance_scale", type: "float", default: null, title: "Guidance Scale",
    description: "How strongly to follow the prompt. Leave unset for the default."
  },
  seed: {
    name: "seed", type: "int", default: null, title: "Seed",
    description: "Set for reproducible output; leave unset for random."
  },
  width: (def) => ({ name: "width", type: "int", default: def, title: "Width", min: 256, max: 2048 }),
  height: (def) => ({ name: "height", type: "int", default: def, title: "Height", min: 256, max: 2048 }),
  aspectRatio: {
    name: "aspect_ratio", type: "enum", default: "16:9", title: "Aspect Ratio",
    values: ["16:9", "9:16", "1:1", "4:3"]
  },
  resolution: {
    name: "resolution", type: "enum", default: "720p", title: "Resolution",
    values: ["480p", "720p", "1080p"]
  },
  duration: {
    name: "duration", type: "int", default: 6, title: "Duration (seconds)",
    values: [4, 5, 6, 8, 10]
  }
};

const textToImageFields = () => [
  F.prompt(true), F.width(1024), F.height(1024), F.steps, F.guidance, F.seed, F.negativePrompt
];
const imageToImageFields = () => [
  { name: "image", type: "image", title: "Image", required: true, description: "Source image to edit." },
  F.prompt(true), F.width(null), F.height(null), F.steps, F.guidance, F.seed
];
const textToVideoFields = () => [
  F.prompt(true), F.aspectRatio, F.resolution, F.duration, F.steps, F.guidance, F.seed, F.negativePrompt
];
const imageToVideoFields = () => [
  { name: "image", type: "image", title: "Image", required: true, description: "First frame of the video." },
  { ...F.prompt(false), description: "Optional prompt to guide motion." },
  F.aspectRatio, F.resolution, F.duration, F.steps, F.guidance, F.seed, F.negativePrompt
];
const textToSpeechFields = (voices) => [
  { name: "text", type: "str", default: "", title: "Text", required: true, description: "Text to synthesize." },
  { name: "voice", type: "enum", default: voices[0], title: "Voice", values: voices },
  { name: "speed", type: "float", default: null, title: "Speed", min: 0.25, max: 4.0 },
  { name: "format", type: "enum", default: "mp3", title: "Format", values: ["mp3", "wav"] }
];
const transcribeFields = () => [
  { name: "audio", type: "audio", title: "Audio", required: true, description: "Audio to transcribe." },
  {
    name: "language", type: "str", default: "", title: "Language",
    description: "Optional ISO-639-1 code (e.g. 'en'). Leave empty to auto-detect."
  }
];

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

const TASK_META = {
  text_to_image: { suffix: "TextToImage", label: "Text to Image", module: "image", out: "image" },
  image_to_image: { suffix: "ImageToImage", label: "Image to Image", module: "image", out: "image" },
  text_to_video: { suffix: "TextToVideo", label: "Text to Video", module: "video", out: "video" },
  image_to_video: { suffix: "ImageToVideo", label: "Image to Video", module: "video", out: "video" },
  text_to_speech: { suffix: "TextToSpeech", label: "Text to Speech", module: "audio", out: "audio" },
  automatic_speech_recognition: { suffix: "Transcribe", label: "Transcribe", module: "transcription", out: "string" }
};

function pascal(name) {
  return name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join("");
}

function entry(model, modality, fields) {
  const meta = TASK_META[modality];
  const e = {
    className: pascal(model.name) + meta.suffix,
    moduleName: meta.module,
    modality,
    modelId: model.id,
    outputType: meta.out,
    title: `${model.name} — ${meta.label}`,
    description: `${model.name} — ${meta.label.toLowerCase()} via Together AI serverless.`,
    fields
  };
  if (model.tasks) e.supportedTasks = model.tasks;
  return e;
}

const manifest = [];
for (const m of IMAGE_MODELS) {
  if (m.tasks.includes("text_to_image")) manifest.push(entry(m, "text_to_image", textToImageFields()));
  if (m.tasks.includes("image_to_image")) manifest.push(entry(m, "image_to_image", imageToImageFields()));
}
for (const m of VIDEO_MODELS) {
  if (m.tasks.includes("text_to_video")) manifest.push(entry(m, "text_to_video", textToVideoFields()));
  if (m.tasks.includes("image_to_video")) manifest.push(entry(m, "image_to_video", imageToVideoFields()));
}
for (const m of TTS_MODELS) manifest.push(entry(m, "text_to_speech", textToSpeechFields(m.voices)));
for (const m of ASR_MODELS) manifest.push(entry(m, "automatic_speech_recognition", transcribeFields()));

writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${manifest.length} Together node entries to ${OUT}`);
