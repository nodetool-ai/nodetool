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
import { isString } from "../utils/type-guards.js";

export const MAX_COMPARE_IMAGES = 8;

export const DEFAULT_VIDEO_PROMPT = "Describe this video in detail.";
export const DEFAULT_UNDERSTAND_VIDEO_TOKENS = 1500;
export const MAX_UNDERSTAND_VIDEO_TOKENS = 8192;

export const GENERATE_IMAGE_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    background: {
      type: "boolean" as const,
      description:
        "Return at once with a generation_id while the provider works; collect the result with await_generation. At most 16 open per run.",
      default: false
    },
    provider: {
      type: "string" as const,
      description:
        "Provider id from find_model. Optional when `model` is a find_model hit or its `.ref`."
    },
    model: {
      type: "string" as const,
      description:
        "Model id from find_model, or the whole find_model hit / `.ref` object."
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
    background: {
      type: "boolean" as const,
      description:
        "Return at once with a generation_id while the provider works; collect the result with await_generation. At most 16 open per run.",
      default: false
    },
    provider: {
      type: "string" as const,
      description:
        "Provider id from find_model. Optional when `model` is a find_model hit or its `.ref`."
    },
    model: {
      type: "string" as const,
      description:
        "Model id from find_model, or the whole find_model hit / `.ref` object."
    },
    input_file: {
      type: "string" as const,
      description:
        "Workspace-relative path of the source image (or asset:// URI)."
    },
    reference_files: {
      type: "array" as const,
      items: { type: "string" as const },
      description:
        "Extra images the model should match — style, subject, or an earlier approved result. Each is a workspace-relative path or asset:// URI, and they are sent after input_file."
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

export const SEGMENT_IMAGE_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: {
      type: "string" as const,
      description:
        "Provider id from find_model. Optional when `model` is a find_model hit or its `.ref`."
    },
    model: {
      type: "string" as const,
      description:
        "Model id from find_model, or the whole find_model hit / `.ref` object."
    },
    input_file: {
      type: "string" as const,
      description:
        "Workspace-relative path of the image to segment (or asset:// URI)."
    },
    prompt: {
      type: "string" as const,
      description:
        "The concept to segment, e.g. \"the red car\". Leave it out to ask the model for whatever objects it finds."
    },
    points: {
      type: "array" as const,
      description:
        "Clicks that point at one object, in source-image pixels. `include: false` marks a point that is NOT part of it.",
      items: {
        type: "object" as const,
        properties: {
          x: { type: "number" as const },
          y: { type: "number" as const },
          include: { type: "boolean" as const }
        },
        required: ["x", "y"]
      }
    },
    box: {
      type: "object" as const,
      description: "A rectangle around one object, in source-image pixels.",
      properties: {
        x: { type: "number" as const },
        y: { type: "number" as const },
        width: { type: "number" as const },
        height: { type: "number" as const }
      },
      required: ["x", "y", "width", "height"]
    },
    max_masks: {
      type: "number" as const,
      description: "Upper bound on how many masks to return."
    },
    min_confidence: {
      type: "number" as const,
      description: "Drop masks the model scores below this (0-1)."
    }
  },
  required: ["provider", "model", "input_file"]
};

export const GENERATE_VIDEO_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    background: {
      type: "boolean" as const,
      description:
        "Return at once with a generation_id while the provider works; collect the result with await_generation. At most 16 open per run.",
      default: false
    },
    provider: {
      type: "string" as const,
      description:
        "Provider id from find_model. Optional when `model` is a find_model hit or its `.ref`."
    },
    model: {
      type: "string" as const,
      description:
        "Model id from find_model, or the whole find_model hit / `.ref` object."
    },
    prompt: { type: "string" as const },
    output_file: {
      type: "string" as const,
      description: "Optional workspace-relative path to also write the result."
    },
    negative_prompt: { type: "string" as const },
    num_frames: { type: "number" as const },
    duration_seconds: {
      type: "number" as const,
      description:
        "Requested clip length. Models honour this loosely, clamp it to the lengths they support, and some ignore it — measure the result with analyze_video before cutting to it."
    },
    aspect_ratio: { type: "string" as const },
    resolution: { type: "string" as const }
  },
  required: ["provider", "model", "prompt"]
};

export const ANIMATE_IMAGE_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    background: {
      type: "boolean" as const,
      description:
        "Return at once with a generation_id while the provider works; collect the result with await_generation. At most 16 open per run.",
      default: false
    },
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
    duration_seconds: {
      type: "number" as const,
      description:
        "Requested clip length. Models honour this loosely, clamp it to the lengths they support, and some ignore it — measure the result with analyze_video before cutting to it."
    },
    aspect_ratio: { type: "string" as const },
    resolution: { type: "string" as const }
  },
  required: ["provider", "model", "input_file"]
};

export const GENERATE_SPEECH_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    background: {
      type: "boolean" as const,
      description:
        "Return at once with a generation_id while the provider works; collect the result with await_generation. At most 16 open per run.",
      default: false
    },
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

export const GENERATE_MUSIC_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    background: {
      type: "boolean" as const,
      description:
        "Return at once with a generation_id while the provider works; collect the result with await_generation. At most 16 open per run.",
      default: false
    },
    provider: { type: "string" as const },
    model: { type: "string" as const },
    prompt: {
      type: "string" as const,
      description: "What the music should sound like — style, mood, instruments."
    },
    lyrics: {
      type: "string" as const,
      description:
        "Optional lyrics, for models that sing. Omit for an instrumental."
    },
    duration_seconds: {
      type: "number" as const,
      description:
        "Requested length. Models honour this loosely and some ignore it — probe the result with ffprobe before cutting to it."
    },
    output_file: {
      type: "string" as const,
      description:
        "Optional workspace-relative path to also write the audio file."
    }
  },
  required: ["provider", "model", "prompt"]
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
        "Optional description of the user's aesthetic, so the judge weighs " +
        "that rather than generic taste."
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
        "Optional description of the user's aesthetic, so the judge weighs " +
        "that rather than generic taste."
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

export const UNDERSTAND_VIDEO_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    provider: {
      type: "string" as const,
      description:
        "Provider id of a chat model that reads video, e.g. gemini (find_model)."
    },
    model: { type: "string" as const, description: "Model id." },
    video: {
      type: "string" as const,
      description: "Video to read: asset id, asset:// URI, URL, or data URI."
    },
    prompt: {
      type: "string" as const,
      description: `What to ask about the video. Default: "${DEFAULT_VIDEO_PROMPT}"`
    },
    max_tokens: {
      type: "integer" as const,
      minimum: 1,
      maximum: MAX_UNDERSTAND_VIDEO_TOKENS,
      description:
        `Answer length cap. Default ${DEFAULT_UNDERSTAND_VIDEO_TOKENS}, ` +
        `max ${MAX_UNDERSTAND_VIDEO_TOKENS}.`
    }
  },
  required: ["provider", "model", "video"]
};

export const understandVideoSpec: CapabilitySpec = {
  name: "understand_video",
  description:
    "Send a video plus an instruction to a multimodal chat model and return " +
    "the model's answer as text. Use it to describe or summarize a clip, " +
    "answer questions about what happens in it, or extract on-screen text. " +
    "A provider that reads video natively (Gemini) gets the whole clip with " +
    "its audio; every other vision model is sent stills sampled from it, " +
    "which carry no audio and no motion between frames. For a single still " +
    "use critique_image instead.",
  inputSchema: UNDERSTAND_VIDEO_SCHEMA,
  // Unlisted in `TOOL_PERMISSION_CATEGORIES`, so the gate classes it
  // `external` — the same category the vision judges carry.
  category: "external",
  userMessage: () => "Reading a video with a multimodal model"
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
    "Transform a source image with a text prompt using a provider+model selected via find_model (capability=image_to_image). Source can be an asset URI (asset://...) or a workspace path. Pass `reference_files` to hand the model more images to match — the user's attachment, or an earlier result whose style a new image must keep. Result is saved as an asset.",
  inputSchema: EDIT_IMAGE_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Editing image with ${String(params["provider"])}:${String(params["model"])}`
};

export const segmentImageSpec: CapabilitySpec = {
  name: "segment_image",
  description:
    "Find objects in an image and return one mask per object, using a " +
    "provider+model selected via find_model (capability=segment_image). Name " +
    "the object in `prompt`, point at it with `points` or `box`, or pass " +
    "neither to get whatever the model finds. Each mask is saved as an asset " +
    "(white inside the object) and carries its label, confidence and bounding " +
    "box, so a later call can cut the object out or edit only that region.",
  inputSchema: SEGMENT_IMAGE_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Segmenting image with ${String(params["provider"])}:${String(params["model"])}`
};

export const generateVideoSpec: CapabilitySpec = {
  name: "generate_video",
  description:
    "Generate a video from a text prompt using a provider+model selected via find_model (capability=text_to_video). Pass find_model's hit or its `.ref` as `model`, or `{provider, model}` strings. Result is saved as an asset (asset:// URI returned).",
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

export const generateMusicSpec: CapabilitySpec = {
  name: "generate_music",
  description:
    "Generate music from a text prompt using a provider+model selected via " +
    "find_model (capability=text_to_music). Result is saved as an asset " +
    "(asset:// URI returned). This is the music counterpart of " +
    "generate_speech — reach for it instead of running an audio node, which " +
    "makes you build and validate a graph to make one piece of music.",
  inputSchema: GENERATE_MUSIC_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Generating music with ${String(params["provider"])}:${String(params["model"])}`
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
  required: ["uri"]
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
        "ffmpeg arguments after the binary name. Paths are workspace-relative " +
        "and cannot escape it; ffmpeg opens local files only, so an " +
        "asset:// URI or a URL in args is refused — name it in `inputs` " +
        "instead. " +
        "Example: [\"-i\", \"in.mp4\", \"-vf\", \"scale=1280:-2\", \"out.mp4\"]."
    },
    inputs: {
      type: "object" as const,
      description:
        "Files to copy into the workspace before the run, as " +
        "{\"<workspace-relative name>\": \"<asset:// URI, /api/storage/ key, " +
        "or data: URI>\"}. This is how an asset reaches ffmpeg: stage it, " +
        "then use the name in args. At most 8 files, 100 MB each. " +
        "Example: {\"a.mp4\": \"asset://<id>.mp4\", \"b.mp4\": \"asset://<id>.mp4\"}.",
      additionalProperties: { type: "string" as const }
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
    "(no shell). Paths are workspace-relative and confined to the " +
    "workspace; ffmpeg opens local files only (no URLs, pipes, or device " +
    "files) — put asset:// URIs in `inputs` to stage them under workspace " +
    "names first. Install ffmpeg if the binary is missing. Use output_file " +
    "to persist the result as an asset. Concatenating two assets is one " +
    "call: inputs {a.mp4, b.mp4} plus a concat filter_complex.",
  inputSchema: FFMPEG_SCHEMA,
  category: "execute",
  userMessage: (params) => {
    const out =
      isString(params["output_file"]) ? params["output_file"] : "";
    return out ? `Running ffmpeg → ${out}` : "Running ffmpeg";
  }
};

export const FFPROBE_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    path: {
      type: "string" as const,
      description:
        "Workspace-relative media file to inspect. Cannot escape the " +
        "workspace. To inspect an asset, name it in `inputs` under this path."
    },
    inputs: {
      type: "object" as const,
      description:
        "Files to copy into the workspace before the run, as " +
        "{\"<workspace-relative name>\": \"<asset:// URI, /api/storage/ key, " +
        "or data: URI>\"} — the same staging `ffmpeg` takes. This is how an " +
        "asset reaches ffprobe: stage it, then name it in `path`. At most 8 " +
        "files, 100 MB each. " +
        "Example: {\"clip.mp4\": \"asset://<id>.mp4\"} with path \"clip.mp4\".",
      additionalProperties: { type: "string" as const }
    },
    timeout_seconds: {
      type: "number" as const,
      description: "Wall-clock timeout. Default 30, max 120."
    }
  },
  required: ["path"]
};

export const ffprobeSpec: CapabilitySpec = {
  name: "ffprobe",
  description:
    "Read a media file's format and streams with ffprobe: duration, size, " +
    "bit rate, and per-stream codec/resolution/frame rate/channels. Takes a " +
    "workspace path, not argv; put asset:// URIs in `inputs` to stage them " +
    "first. ffprobe reports every number as a string, so the answer also " +
    "carries a `summary` with duration_seconds/width/height/has_audio as " +
    "real numbers and booleans. Use it before ffmpeg to decide what to do.",
  inputSchema: FFPROBE_SCHEMA,
  category: "execute",
  userMessage: (params) => {
    const target = isString(params["path"]) ? params["path"] : "a file";
    return `Inspecting ${target}`;
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
    "Download a video with yt-dlp into the workspace. Requires a public " +
    "http(s) URL — internal and loopback addresses are refused — and writes " +
    "only inside the workspace, up to 2 GiB. Install yt-dlp (and ffmpeg for " +
    "merge/transcode) if the binary is missing. Returns the output path and " +
    "an asset handle when possible.",
  inputSchema: YT_DLP_SCHEMA,
  category: "external",
  userMessage: (params) => {
    const url = isString(params["url"]) ? params["url"] : "a URL";
    const msg = `Downloading video from ${url}`;
    return msg.length > 160 ? "Downloading a video" : msg;
  }
};

/** Every spec this module declares, in declaration order. */
export const mediaSpecs: readonly CapabilitySpec[] = [
  generateImageSpec,
  editImageSpec,
  segmentImageSpec,
  generateVideoSpec,
  animateImageSpec,
  generateSpeechSpec,
  generateMusicSpec,
  transcribeAudioSpec,
  embedTextSpec,
  readMediaBytesSpec,
  critiqueImageSpec,
  compareImagesSpec,
  scoreImageAdherenceSpec,
  understandVideoSpec,
  ffmpegSpec,
  ffprobeSpec,
  ytDlpSpec
];
