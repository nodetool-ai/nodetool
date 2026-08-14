/**
 * The `media` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `media.ts`, so nothing the
 * implementations pull in reaches the entry graph. `media.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

export const MAX_COMPARE_IMAGES = 8;

export const GENERATE_IMAGE_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: {
      type: "string" as const,
      description: "Provider id from find_model."
    },
    model: {
      type: "string" as const,
      description: "Model id from find_model."
    },
    prompt: { type: "string" as const, description: "Text prompt." },
    output_file: {
      type: "string" as const,
      description:
        "Optional workspace-relative path to also write the result. Omit to rely on the asset URI."
    },
    negative_prompt: { type: "string" as const },
    width: { type: "number" as const },
    height: { type: "number" as const },
    quality: { type: "string" as const }
  },
  required: ["provider", "model", "prompt"]
};

export const EDIT_IMAGE_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: {
      type: "string" as const,
      description: "Provider id from find_model."
    },
    model: {
      type: "string" as const,
      description: "Model id from find_model."
    },
    input_file: {
      type: "string" as const,
      description:
        "Workspace-relative path of the source image (or asset:// URI)."
    },
    prompt: {
      type: "string" as const,
      description: "Text prompt describing the desired transformation."
    },
    output_file: {
      type: "string" as const,
      description: "Optional workspace-relative path to also write the result."
    },
    negative_prompt: { type: "string" as const },
    target_width: { type: "number" as const },
    target_height: { type: "number" as const },
    strength: { type: "number" as const }
  },
  required: ["provider", "model", "input_file", "prompt"]
};

export const GENERATE_VIDEO_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: { type: "string" as const },
    model: { type: "string" as const },
    prompt: { type: "string" as const },
    output_file: {
      type: "string" as const,
      description: "Optional workspace-relative path to also write the result."
    },
    negative_prompt: { type: "string" as const },
    num_frames: { type: "number" as const },
    aspect_ratio: { type: "string" as const },
    resolution: { type: "string" as const }
  },
  required: ["provider", "model", "prompt"]
};

export const ANIMATE_IMAGE_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: { type: "string" as const },
    model: { type: "string" as const },
    input_file: {
      type: "string" as const,
      description:
        "Workspace-relative path of the source image (or asset:// URI)."
    },
    output_file: {
      type: "string" as const,
      description: "Optional workspace-relative path to also write the result."
    },
    prompt: { type: "string" as const },
    num_frames: { type: "number" as const },
    aspect_ratio: { type: "string" as const },
    resolution: { type: "string" as const }
  },
  required: ["provider", "model", "input_file"]
};

export const GENERATE_SPEECH_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: { type: "string" as const },
    model: { type: "string" as const },
    text: { type: "string" as const, description: "Text to speak." },
    output_file: {
      type: "string" as const,
      description:
        "Optional workspace-relative path to also write the audio file (mp3/wav/pcm depending on provider)."
    },
    voice: { type: "string" as const },
    speed: {
      type: "number" as const,
      description: "Speech speed (e.g. 0.25–4.0)."
    }
  },
  required: ["provider", "model", "text"]
};

export const TRANSCRIBE_AUDIO_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: { type: "string" as const },
    model: { type: "string" as const },
    input_file: {
      type: "string" as const,
      description:
        "Workspace-relative path of the audio file to transcribe (or asset:// URI)."
    },
    language: {
      type: "string" as const,
      description: "Optional ISO 639-1 language hint (e.g. 'en')."
    },
    prompt: {
      type: "string" as const,
      description: "Optional context to bias the model."
    }
  },
  required: ["provider", "model", "input_file"]
};

export const EMBED_TEXT_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: { type: "string" as const },
    model: { type: "string" as const },
    text: {
      oneOf: [
        { type: "string" as const },
        { type: "array" as const, items: { type: "string" as const } }
      ],
      description: "A single string or an array of strings to embed."
    },
    dimensions: {
      type: "number" as const,
      description:
        "Optional target dimensions if the model supports truncation."
    }
  },
  required: ["provider", "model", "text"]
};

export const CRITIQUE_IMAGE_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: {
      type: "string" as const,
      description: "Provider id of a vision-capable chat model (find_model)."
    },
    model: { type: "string" as const, description: "Model id." },
    image: {
      type: "string" as const,
      description:
        "Image to critique: asset id, asset:// URI, URL, or data URI."
    },
    brief: {
      type: "string" as const,
      description:
        "What the image is supposed to be — the original creative brief, " +
        "including mood, constraints, and any must-have elements."
    },
    taste_profile: {
      type: "string" as const,
      description:
        "Optional style profile from get_style_profile to judge against " +
        "the user's aesthetic, not generic taste."
    }
  },
  required: ["provider", "model", "image", "brief"]
};

export const COMPARE_IMAGES_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: {
      type: "string" as const,
      description: "Provider id of a vision-capable chat model (find_model)."
    },
    model: { type: "string" as const, description: "Model id." },
    images: {
      type: "array" as const,
      items: { type: "string" as const },
      minItems: 2,
      maxItems: MAX_COMPARE_IMAGES,
      description:
        "2-8 candidate images: asset ids, asset:// URIs, URLs, or data URIs."
    },
    brief: {
      type: "string" as const,
      description: "The creative brief the images are judged against."
    },
    taste_profile: {
      type: "string" as const,
      description:
        "Optional style profile from get_style_profile so the judge weighs " +
        "the user's aesthetic."
    }
  },
  required: ["provider", "model", "images", "brief"]
};

export const SCORE_ADHERENCE_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: {
      type: "string" as const,
      description: "Provider id of a vision-capable chat model (find_model)."
    },
    model: { type: "string" as const, description: "Model id." },
    image: {
      type: "string" as const,
      description: "Image to score: asset id, asset:// URI, URL, or data URI."
    },
    brief: {
      type: "string" as const,
      description: "The creative brief the image must adhere to."
    },
    questions: {
      type: "array" as const,
      items: { type: "string" as const },
      description:
        "Optional explicit yes/no checks. When omitted, the brief is " +
        "decomposed into up to 12 atomic checks automatically."
    }
  },
  required: ["provider", "model", "image", "brief"]
};

export const generateImageSpec: CapabilitySpec = {
  name: "generate_image",
  description:
    "Generate an image from a text prompt using a provider+model selected via find_model (capability=text_to_image). The result is saved as an asset (asset:// URI returned); pass `output_file` to also write a workspace copy.",
  inputSchema: GENERATE_IMAGE_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Generating image with ${String(params["provider"])}:${String(params["model"])}`
};

export const editImageSpec: CapabilitySpec = {
  name: "edit_image",
  description:
    "Transform a source image with a text prompt using a provider+model selected via find_model (capability=image_to_image). Source can be an asset URI (asset://...) or a workspace path. Result is saved as an asset.",
  inputSchema: EDIT_IMAGE_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Editing image with ${String(params["provider"])}:${String(params["model"])}`
};

export const generateVideoSpec: CapabilitySpec = {
  name: "generate_video",
  description:
    "Generate a video from a text prompt using a provider+model selected via find_model (capability=text_to_video). Result is saved as an asset (asset:// URI returned).",
  inputSchema: GENERATE_VIDEO_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Generating video with ${String(params["provider"])}:${String(params["model"])}`
};

export const animateImageSpec: CapabilitySpec = {
  name: "animate_image",
  description:
    "Animate a source image into a video using a provider+model selected via find_model (capability=image_to_video). Source can be a workspace path or asset URI; result is saved as an asset.",
  inputSchema: ANIMATE_IMAGE_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Animating image with ${String(params["provider"])}:${String(params["model"])}`
};

export const generateSpeechSpec: CapabilitySpec = {
  name: "generate_speech",
  description:
    "Synthesize speech audio from text using a provider+model selected via find_model (capability=text_to_speech). Result is saved as an asset (asset:// URI returned).",
  inputSchema: GENERATE_SPEECH_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Synthesizing speech with ${String(params["provider"])}:${String(params["model"])}`
};

export const transcribeAudioSpec: CapabilitySpec = {
  name: "transcribe_audio",
  description:
    "Transcribe an audio file to text using a provider+model selected via find_model (capability=automatic_speech_recognition). Source can be a workspace path or asset:// URI.",
  inputSchema: TRANSCRIBE_AUDIO_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Transcribing audio with ${String(params["provider"])}:${String(params["model"])}`
};

export const READ_MEDIA_BYTES_SCHEMA = {
  type: "object",
  properties: {
    uri: {
      type: "string",
      description:
        "The media to read: an asset:// URI (what generate_image returns as asset_uri), a bare asset id, a /api/storage/ key, a package:// URI, a data: URI, or an http(s) URL."
    }
  },
  required: ["uri"] as string[]
} as const;

export const readMediaBytesSpec: CapabilitySpec = {
  name: "read_media_bytes",
  description:
    "Read the bytes behind a media reference — the way to get at an image, audio or video you just generated. Returns `content_base64` (revive it with fromBase64), `mime_type` and `size`, so the bytes feed image.* or a sandbox pack directly. Takes an asset:// URI, a bare asset id, a /api/storage/ key, a package:// URI, a data: URI, or an http(s) URL. For a file in the workspace use read_file instead.",
  inputSchema: READ_MEDIA_BYTES_SCHEMA,
  category: "read",
  userMessage: (params) => `Reading ${String(params["uri"])}`
};

export const embedTextSpec: CapabilitySpec = {
  name: "embed_text",
  description:
    "Compute embedding vector(s) for a text or list of texts using a provider+model selected via find_model (capability=generate_embedding).",
  inputSchema: EMBED_TEXT_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Embedding text with ${String(params["provider"])}:${String(params["model"])}`
};

export const critiqueImageSpec: CapabilitySpec = {
  name: "critique_image",
  description:
    "Have a vision model critique a generated image against the brief and " +
    "return directional feedback: concrete defects with locations and fixes, " +
    "plus a pass/revise verdict. Use the fixes to revise the prompt and " +
    "regenerate; if the critique names no specific defect, prefer generating " +
    "fresh variations over further iteration.",
  inputSchema: CRITIQUE_IMAGE_SCHEMA,
  // Unlisted in `TOOL_PERMISSION_CATEGORIES`, so the gate classes it
  // `external` today. Carried over unchanged: a reclassification belongs in
  // its own diff, not in a port.
  category: "external",
  userMessage: () => "Critiquing image against the brief"
};

export const compareImagesSpec: CapabilitySpec = {
  name: "compare_images",
  description:
    "Pick the image that best fulfills a brief from 2-8 candidates using a " +
    "vision model as a pairwise judge. Runs a knockout tournament; every " +
    "match is judged twice with the presentation order swapped (VLM verdicts " +
    "are order-sensitive) and a tiebreak call settles disagreements. Returns " +
    "the winner plus every match verdict. All candidates remain available — " +
    "treat the ranking as triage, not deletion.",
  inputSchema: COMPARE_IMAGES_SCHEMA,
  category: "external",
  userMessage: (params) => {
    const n = Array.isArray(params["images"]) ? params["images"].length : 0;
    return n ? `Comparing ${n} images against the brief` : "Comparing images";
  }
};

export const scoreImageAdherenceSpec: CapabilitySpec = {
  name: "score_image_adherence",
  description:
    "Score how faithfully an image matches a brief by decomposing the brief " +
    "into binary yes/no checks and answering each one with a vision model. " +
    "Returns the per-check answers and the fraction that passed — an " +
    "explainable adherence score, not an opaque rating. Pass `questions` to " +
    "skip decomposition and check exactly those.",
  inputSchema: SCORE_ADHERENCE_SCHEMA,
  category: "external",
  userMessage: () => "Scoring image adherence to the brief"
};

export const FFMPEG_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    args: {
      type: "array" as const,
      items: { type: "string" as const },
      description:
        "ffmpeg arguments after the binary name. Paths are workspace-relative. " +
        "Example: [\"-i\", \"in.mp4\", \"-vf\", \"scale=1280:-2\", \"out.mp4\"]."
    },
    output_file: {
      type: "string" as const,
      description:
        "Optional workspace-relative output path. Appended as the last " +
        "argument when it is not already in args. Persisted as an asset " +
        "when the run succeeds."
    },
    timeout_seconds: {
      type: "number" as const,
      description: "Wall-clock timeout. Default 180, max 600."
    }
  },
  required: ["args"]
};

export const ffmpegSpec: CapabilitySpec = {
  name: "ffmpeg",
  description:
    "Run ffmpeg on workspace files. Pass argv after the binary name " +
    "(no shell). Paths are workspace-relative. Install ffmpeg if the " +
    "binary is missing. Use output_file to persist the result as an asset.",
  inputSchema: FFMPEG_SCHEMA,
  category: "execute",
  userMessage: (params) => {
    const out =
      typeof params["output_file"] === "string" ? params["output_file"] : "";
    return out ? `Running ffmpeg → ${out}` : "Running ffmpeg";
  }
};

export const YT_DLP_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    url: {
      type: "string" as const,
      description: "http(s) URL of the video to download."
    },
    output_file: {
      type: "string" as const,
      description:
        "Workspace-relative output path or yt-dlp template. " +
        "Default: downloads/yt-dlp/%(id)s.%(ext)s."
    },
    format: {
      type: "string" as const,
      description: "Optional yt-dlp format selector (the -f value)."
    },
    timeout_seconds: {
      type: "number" as const,
      description: "Wall-clock timeout. Default 300, max 900."
    }
  },
  required: ["url"]
};

export const ytDlpSpec: CapabilitySpec = {
  name: "yt_dlp",
  description:
    "Download a video with yt-dlp into the workspace. Requires an http(s) " +
    "URL. Install yt-dlp (and ffmpeg for merge/transcode) if the binary is " +
    "missing. Returns the output path and an asset handle when possible.",
  inputSchema: YT_DLP_SCHEMA,
  category: "external",
  userMessage: (params) => {
    const url = typeof params["url"] === "string" ? params["url"] : "a URL";
    const msg = `Downloading video from ${url}`;
    return msg.length > 160 ? "Downloading a video" : msg;
  }
};

/** Every spec this module declares, in declaration order. */
export const mediaSpecs: readonly CapabilitySpec[] = [
  generateImageSpec,
  editImageSpec,
  generateVideoSpec,
  animateImageSpec,
  generateSpeechSpec,
  transcribeAudioSpec,
  embedTextSpec,
  readMediaBytesSpec,
  critiqueImageSpec,
  compareImagesSpec,
  scoreImageAdherenceSpec,
  ffmpegSpec,
  ytDlpSpec
];
