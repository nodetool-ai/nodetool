/**
 * The `media` capability module — provider-backed generation, plus the vision
 * judges that grade what it produced.
 *
 * Ten capabilities that used to be ten `Tool` subclasses: the seven generation
 * tools in `../tools/media-tools.ts` and the three judging tools in
 * `../tools/creative-critique-tools.ts`. Wire names, descriptions and schemas
 * are unchanged; `getAllMcpTools` builds them through `toolFromCapability`.
 *
 * Every generation capability is a thin wrapper around
 * `ProcessingContext.runProviderPrediction` (or `streamProviderPrediction`
 * where the capability requires it), so it dispatches to whichever
 * `BaseProvider` the id names and needs nothing on the run beyond its context.
 *
 * Outputs are saved as assets when the context exposes a `createAsset` model
 * interface, and fall back to the caller-supplied `output_file` under the
 * workspace when it does not.
 *
 * Design: docs/tool-class-retirement-design.md § Migration.
 */

import { Buffer } from "node:buffer";
import { randomInt } from "node:crypto";
import path from "node:path";
import type { Message, MessageContent } from "@nodetool-ai/protocol";
import type { JsonSchema, ProcessingContext } from "@nodetool-ai/runtime";
import { inferImageMime, persistOutput } from "../tools/asset-persist.js";
import { extractJSON } from "../utils/json-parser.js";
import type { CapabilityExport, CapabilityModule } from "./types.js";

const MAX_INLINE_TEXT_PREVIEW = 500;
const MAX_COMPARE_IMAGES = 8;
const MAX_ADHERENCE_QUESTIONS = 12;
const JUDGE_MAX_TOKENS = 1500;

interface MediaModelArgs {
  provider: string;
  model: string;
}

function parseModelArgs(
  params: Record<string, unknown>
): MediaModelArgs | { error: string } {
  const provider = params["provider"];
  const model = params["model"];
  if (typeof provider !== "string" || !provider) {
    return { error: "provider must be a non-empty string (use find_model)" };
  }
  if (typeof model !== "string" || !model) {
    return { error: "model must be a non-empty string (use find_model)" };
  }
  return { provider, model };
}

async function readWorkspaceOrAssetFile(
  context: ProcessingContext,
  inputFile: string
): Promise<Uint8Array> {
  // asset:// URIs are the primary handle the generate_* capabilities return (an
  // asset is created with no workspace copy), and the docs advertise asset://
  // sources. Route them through the asset resolver — workspaceStorage treats
  // them as literal keys (asset://id.png → key "asset:/id.png") and fails.
  if (inputFile.startsWith("asset://")) {
    const { bytes } = await context.resolveAssetBytes(inputFile);
    if (!bytes) {
      throw new Error(`Asset not found: ${inputFile}`);
    }
    return bytes;
  }
  // Read via the workspace storage adapter so cloud deployments work
  // identically to local. `inputFile` is treated as a storage key.
  if (!context.workspaceStorage) {
    throw new Error(
      "No workspace storage configured — cannot read input file."
    );
  }
  const uri = context.workspaceStorage.uriForKey(inputFile);
  const bytes = await context.workspaceStorage.retrieve(uri);
  if (!bytes) {
    throw new Error(`Input file not found in workspace storage: ${inputFile}`);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// generate_image
// ---------------------------------------------------------------------------

const GENERATE_IMAGE_SCHEMA: JsonSchema = {
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

const generateImage: CapabilityExport = {
  spec: {
    name: "generate_image",
    description:
      "Generate an image from a text prompt using a provider+model selected via find_model (capability=text_to_image). The result is saved as an asset (asset:// URI returned); pass `output_file` to also write a workspace copy.",
    inputSchema: GENERATE_IMAGE_SCHEMA,
    category: "write",
    userMessage: (params) =>
      `Generating image with ${String(params["provider"])}:${String(params["model"])}`
  },
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const prompt = params["prompt"];
    if (typeof prompt !== "string" || !prompt)
      return { error: "prompt is required" };

    try {
      const result = (await context.runProviderPrediction({
        provider: m.provider,
        capability: "text_to_image",
        model: m.model,
        params: {
          prompt,
          negative_prompt: params["negative_prompt"],
          width: params["width"],
          height: params["height"],
          quality: params["quality"]
        }
      })) as Uint8Array;
      const persisted = await persistOutput(context, result, {
        namePrefix: "generated-image",
        mime: inferImageMime(result),
        outputFile:
          typeof params["output_file"] === "string"
            ? (params["output_file"] as string)
            : undefined
      });
      return {
        type: "image",
        provider: m.provider,
        model: m.model,
        ...persisted
      };
    } catch (e) {
      return {
        error: `text_to_image failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

// ---------------------------------------------------------------------------
// edit_image
// ---------------------------------------------------------------------------

const EDIT_IMAGE_SCHEMA: JsonSchema = {
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

const editImage: CapabilityExport = {
  spec: {
    name: "edit_image",
    description:
      "Transform a source image with a text prompt using a provider+model selected via find_model (capability=image_to_image). Source can be an asset URI (asset://...) or a workspace path. Result is saved as an asset.",
    inputSchema: EDIT_IMAGE_SCHEMA,
    category: "write",
    userMessage: (params) =>
      `Editing image with ${String(params["provider"])}:${String(params["model"])}`
  },
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const inputFile = params["input_file"];
    const prompt = params["prompt"];
    if (typeof inputFile !== "string" || !inputFile)
      return { error: "input_file is required" };
    if (typeof prompt !== "string" || !prompt)
      return { error: "prompt is required" };

    try {
      const image = await readWorkspaceOrAssetFile(context, inputFile);
      const result = (await context.runProviderPrediction({
        provider: m.provider,
        capability: "image_to_image",
        model: m.model,
        params: {
          image,
          prompt,
          negative_prompt: params["negative_prompt"],
          target_width: params["target_width"],
          target_height: params["target_height"],
          strength: params["strength"]
        }
      })) as Uint8Array;
      const persisted = await persistOutput(context, result, {
        namePrefix: "edited-image",
        mime: inferImageMime(result),
        outputFile:
          typeof params["output_file"] === "string"
            ? (params["output_file"] as string)
            : undefined
      });
      return {
        type: "image",
        provider: m.provider,
        model: m.model,
        ...persisted
      };
    } catch (e) {
      return {
        error: `image_to_image failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

// ---------------------------------------------------------------------------
// generate_video
// ---------------------------------------------------------------------------

const GENERATE_VIDEO_SCHEMA: JsonSchema = {
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

const generateVideo: CapabilityExport = {
  spec: {
    name: "generate_video",
    description:
      "Generate a video from a text prompt using a provider+model selected via find_model (capability=text_to_video). Result is saved as an asset (asset:// URI returned).",
    inputSchema: GENERATE_VIDEO_SCHEMA,
    category: "write",
    userMessage: (params) =>
      `Generating video with ${String(params["provider"])}:${String(params["model"])}`
  },
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const prompt = params["prompt"];
    if (typeof prompt !== "string" || !prompt)
      return { error: "prompt is required" };

    try {
      const result = (await context.runProviderPrediction({
        provider: m.provider,
        capability: "text_to_video",
        model: m.model,
        params: {
          prompt,
          negative_prompt: params["negative_prompt"],
          num_frames: params["num_frames"],
          aspect_ratio: params["aspect_ratio"],
          resolution: params["resolution"]
        }
      })) as Uint8Array;
      const persisted = await persistOutput(context, result, {
        namePrefix: "generated-video",
        mime: "video/mp4",
        outputFile:
          typeof params["output_file"] === "string"
            ? (params["output_file"] as string)
            : undefined
      });
      return {
        type: "video",
        provider: m.provider,
        model: m.model,
        ...persisted
      };
    } catch (e) {
      return {
        error: `text_to_video failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

// ---------------------------------------------------------------------------
// animate_image
// ---------------------------------------------------------------------------

const ANIMATE_IMAGE_SCHEMA: JsonSchema = {
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

const animateImage: CapabilityExport = {
  spec: {
    name: "animate_image",
    description:
      "Animate a source image into a video using a provider+model selected via find_model (capability=image_to_video). Source can be a workspace path or asset URI; result is saved as an asset.",
    inputSchema: ANIMATE_IMAGE_SCHEMA,
    category: "write",
    userMessage: (params) =>
      `Animating image with ${String(params["provider"])}:${String(params["model"])}`
  },
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const inputFile = params["input_file"];
    if (typeof inputFile !== "string" || !inputFile)
      return { error: "input_file is required" };

    try {
      const image = await readWorkspaceOrAssetFile(context, inputFile);
      const result = (await context.runProviderPrediction({
        provider: m.provider,
        capability: "image_to_video",
        model: m.model,
        params: {
          image,
          prompt: params["prompt"],
          num_frames: params["num_frames"],
          aspect_ratio: params["aspect_ratio"],
          resolution: params["resolution"]
        }
      })) as Uint8Array;
      const persisted = await persistOutput(context, result, {
        namePrefix: "animated-video",
        mime: "video/mp4",
        outputFile:
          typeof params["output_file"] === "string"
            ? (params["output_file"] as string)
            : undefined
      });
      return {
        type: "video",
        provider: m.provider,
        model: m.model,
        ...persisted
      };
    } catch (e) {
      return {
        error: `image_to_video failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

// ---------------------------------------------------------------------------
// generate_speech
// ---------------------------------------------------------------------------

interface TTSChunkLike {
  data?: Uint8Array | string;
  samples?: Int16Array;
  sampleRate?: number;
  mimeType?: string;
}

function int16ToUint8(samples: Int16Array): Uint8Array {
  const bytes = new Uint8Array(samples.byteLength);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(i * 2, samples[i], true);
  }
  return bytes;
}

/**
 * Wrap raw little-endian int16 PCM bytes in a minimal RIFF/WAVE container so
 * the file is playable. Defaults match OpenAI's TTS PCM stream (24 kHz mono).
 */
function wrapPcmAsWav(
  pcm: Uint8Array,
  sampleRate = 24000,
  channels = 1
): Uint8Array {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = new Uint8Array(44);
  const v = new DataView(header.buffer);
  const w = (s: string, off: number): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  w("RIFF", 0);
  v.setUint32(4, 36 + pcm.length, true);
  w("WAVE", 8);
  w("fmt ", 12);
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM format
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true);
  w("data", 36);
  v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(header.length + pcm.length);
  out.set(header, 0);
  out.set(pcm, header.length);
  return out;
}

const AUDIO_EXT_TO_FORMAT: Record<string, string> = {
  mp3: "mp3",
  wav: "wav",
  flac: "flac",
  opus: "opus",
  ogg: "opus",
  aac: "aac",
  m4a: "aac"
};

function audioFormatFromOutputFile(
  outputFile: string | undefined
): string | null {
  if (!outputFile) return null;
  const ext = path.extname(outputFile).slice(1).toLowerCase();
  return AUDIO_EXT_TO_FORMAT[ext] ?? null;
}

function concatUint8(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const GENERATE_SPEECH_SCHEMA: JsonSchema = {
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

const generateSpeech: CapabilityExport = {
  spec: {
    name: "generate_speech",
    description:
      "Synthesize speech audio from text using a provider+model selected via find_model (capability=text_to_speech). Result is saved as an asset (asset:// URI returned).",
    inputSchema: GENERATE_SPEECH_SCHEMA,
    category: "write",
    userMessage: (params) =>
      `Synthesizing speech with ${String(params["provider"])}:${String(params["model"])}`
  },
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const text = params["text"];
    if (typeof text !== "string" || !text) return { error: "text is required" };

    const outputFile =
      typeof params["output_file"] === "string"
        ? (params["output_file"] as string)
        : undefined;
    const desiredFormat = audioFormatFromOutputFile(outputFile) ?? "mp3";

    try {
      // Preferred path: ask the provider for fully-encoded audio in the
      // desired container (mp3/wav/flac/...). Returns null when the provider
      // doesn't support encoded TTS — we then fall through to streaming PCM.
      let audio: Uint8Array | null = null;
      let mimeType: string | undefined;
      let outputFileFinal = outputFile;

      try {
        const provider = await context.getProvider(m.provider);
        const encoded = await provider.textToSpeechEncoded({
          text,
          model: m.model,
          voice: params["voice"] as string | undefined,
          speed: params["speed"] as number | undefined,
          audioFormat: desiredFormat
        });
        if (encoded && encoded.data) {
          audio = encoded.data;
          mimeType = encoded.mimeType;
        }
      } catch {
        // Fall through to streaming path.
      }

      if (!audio) {
        // Streaming path — provider returns either pre-encoded chunks
        // (carrying mimeType) or raw int16 PCM samples that we must wrap in
        // a WAV container before writing to disk so the file is playable.
        const parts: Uint8Array[] = [];
        let pcmOnly = true;
        // Capture the PCM sample rate from the stream — providers emit non-24k
        // PCM (MiniMax 32000, Together varies). Hardcoding 24000 in the WAV
        // header makes those play back at the wrong speed/pitch.
        let pcmSampleRate: number | undefined;
        for await (const item of context.streamProviderPrediction({
          provider: m.provider,
          capability: "text_to_speech",
          model: m.model,
          params: {
            text,
            voice: params["voice"],
            speed: params["speed"]
          }
        })) {
          const chunk = item as TTSChunkLike;
          if (chunk.data instanceof Uint8Array) {
            parts.push(chunk.data);
            if (chunk.mimeType) mimeType = chunk.mimeType;
            pcmOnly = false;
          } else if (typeof chunk.data === "string") {
            parts.push(Buffer.from(chunk.data, "base64"));
            if (chunk.mimeType) mimeType = chunk.mimeType;
            pcmOnly = false;
          } else if (chunk.samples) {
            pcmSampleRate ??= chunk.sampleRate;
            parts.push(int16ToUint8(chunk.samples));
          }
        }
        if (parts.length === 0)
          return { error: "Provider returned no audio data" };
        const merged = concatUint8(parts);
        if (pcmOnly && !mimeType) {
          // Wrap raw PCM in WAV so the bytes are playable. Rename .mp3 →
          // .wav since the actual data is now WAV, not MP3. Honor the provider's
          // actual sample rate (defaulting to 24k only when unknown).
          audio = wrapPcmAsWav(merged, pcmSampleRate ?? 24000);
          mimeType = "audio/wav";
          if (outputFileFinal) {
            const dir = path.dirname(outputFileFinal);
            const base = path.basename(
              outputFileFinal,
              path.extname(outputFileFinal)
            );
            outputFileFinal = path.join(dir === "." ? "" : dir, `${base}.wav`);
          }
        } else {
          audio = merged;
        }
      }

      const persisted = await persistOutput(context, audio, {
        namePrefix: "generated-speech",
        mime: mimeType ?? "audio/mpeg",
        outputFile: outputFileFinal
      });
      return {
        type: "audio",
        provider: m.provider,
        model: m.model,
        ...persisted
      };
    } catch (e) {
      return {
        error: `text_to_speech failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

// ---------------------------------------------------------------------------
// transcribe_audio
// ---------------------------------------------------------------------------

const TRANSCRIBE_AUDIO_SCHEMA: JsonSchema = {
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

const transcribeAudio: CapabilityExport = {
  spec: {
    name: "transcribe_audio",
    description:
      "Transcribe an audio file to text using a provider+model selected via find_model (capability=automatic_speech_recognition). Source can be a workspace path or asset:// URI.",
    inputSchema: TRANSCRIBE_AUDIO_SCHEMA,
    category: "write",
    userMessage: (params) =>
      `Transcribing audio with ${String(params["provider"])}:${String(params["model"])}`
  },
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const inputFile = params["input_file"];
    if (typeof inputFile !== "string" || !inputFile)
      return { error: "input_file is required" };

    try {
      const audio = await readWorkspaceOrAssetFile(context, inputFile);
      const result = (await context.runProviderPrediction({
        provider: m.provider,
        capability: "automatic_speech_recognition",
        model: m.model,
        params: {
          audio,
          language: params["language"],
          prompt: params["prompt"]
        }
      })) as { text: string; chunks?: unknown[] };
      const text = String(result.text ?? "");
      return {
        type: "transcription",
        provider: m.provider,
        model: m.model,
        text:
          text.length > MAX_INLINE_TEXT_PREVIEW
            ? text.slice(0, MAX_INLINE_TEXT_PREVIEW) +
              `… [${text.length - MAX_INLINE_TEXT_PREVIEW} chars truncated]`
            : text,
        full_length: text.length,
        chunks: Array.isArray(result.chunks) ? result.chunks.length : 0
      };
    } catch (e) {
      return {
        error: `transcribe failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

// ---------------------------------------------------------------------------
// embed_text
// ---------------------------------------------------------------------------

const EMBED_TEXT_SCHEMA: JsonSchema = {
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

const embedText: CapabilityExport = {
  spec: {
    name: "embed_text",
    description:
      "Compute embedding vector(s) for a text or list of texts using a provider+model selected via find_model (capability=generate_embedding).",
    inputSchema: EMBED_TEXT_SCHEMA,
    category: "write",
    userMessage: (params) =>
      `Embedding text with ${String(params["provider"])}:${String(params["model"])}`
  },
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const text = params["text"];
    if (typeof text !== "string" && !Array.isArray(text))
      return { error: "text must be a string or array of strings" };

    try {
      const result = (await context.runProviderPrediction({
        provider: m.provider,
        capability: "generate_embedding",
        model: m.model,
        params: {
          text,
          dimensions: params["dimensions"]
        }
      })) as number[][];
      return {
        type: "embedding",
        provider: m.provider,
        model: m.model,
        count: result.length,
        dimensions: result[0]?.length ?? 0,
        embeddings: result
      };
    } catch (e) {
      return {
        error: `generate_embedding failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

// ---------------------------------------------------------------------------
// The judging half: shared VLM plumbing
// ---------------------------------------------------------------------------

interface JudgeModelArgs {
  provider: string;
  model: string;
}

function parseJudgeModelArgs(
  params: Record<string, unknown>
): JudgeModelArgs | { error: string } {
  const provider = params["provider"];
  const model = params["model"];
  if (typeof provider !== "string" || !provider) {
    return {
      error:
        "provider must be a non-empty string (use find_model with a vision-capable chat model)"
    };
  }
  if (typeof model !== "string" || !model) {
    return {
      error:
        "model must be a non-empty string (use find_model with a vision-capable chat model)"
    };
  }
  return { provider, model };
}

/** Normalize an image source so the context media resolver can inline it. */
function normalizeImageSource(source: string): string {
  const trimmed = source.trim();
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("asset://") ||
    /^https?:\/\//i.test(trimmed)
  ) {
    return trimmed;
  }
  // Bare asset ids (what list_images and generate_image return) become
  // asset:// URIs, which resolveMessageMediaUris inlines as data URIs.
  return `asset://${trimmed}`;
}

function imagePart(source: string): MessageContent {
  return {
    type: "image_url",
    image: { type: "image", uri: normalizeImageSource(source) }
  };
}

function textPart(text: string): MessageContent {
  return { type: "text", text };
}

/** Pull the text out of a provider response message. */
function messageText(message: Message): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

async function judgeCall(
  context: ProcessingContext,
  m: JudgeModelArgs,
  content: MessageContent[]
): Promise<string> {
  const result = (await context.runProviderPrediction({
    provider: m.provider,
    capability: "generate_message",
    model: m.model,
    params: {
      messages: [{ role: "user", content }] satisfies Message[],
      max_tokens: JUDGE_MAX_TOKENS,
      temperature: 0
    }
  })) as Message;
  return messageText(result);
}

function tasteBlock(params: Record<string, unknown>): string {
  const profile = params["taste_profile"];
  if (typeof profile !== "string" || !profile.trim()) return "";
  return `\n\nThe user's known aesthetic preferences (weigh these alongside the brief):\n${profile.trim()}`;
}

// ---------------------------------------------------------------------------
// critique_image
// ---------------------------------------------------------------------------

interface CritiqueDefect {
  defect: string;
  location: string;
  fix: string;
}

interface CritiqueResult {
  verdict: "pass" | "revise";
  defects: CritiqueDefect[];
  strengths: string[];
}

function parseCritique(text: string): CritiqueResult | null {
  const parsed = extractJSON(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const verdict = obj["verdict"] === "pass" ? "pass" : "revise";
  const defects: CritiqueDefect[] = Array.isArray(obj["defects"])
    ? (obj["defects"] as unknown[])
        .filter((d): d is Record<string, unknown> =>
          Boolean(d && typeof d === "object")
        )
        .map((d) => ({
          defect: String(d["defect"] ?? ""),
          location: String(d["location"] ?? ""),
          fix: String(d["fix"] ?? "")
        }))
        .filter((d) => d.defect)
    : [];
  const strengths: string[] = Array.isArray(obj["strengths"])
    ? (obj["strengths"] as unknown[]).map(String).filter(Boolean)
    : [];
  return { verdict, defects, strengths };
}

const CRITIQUE_IMAGE_SCHEMA: JsonSchema = {
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

const critiqueImage: CapabilityExport = {
  spec: {
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
  },
  impl: async (run, params) => {
    const context = run.context;
    const m = parseJudgeModelArgs(params);
    if ("error" in m) return m;
    const image = params["image"];
    const brief = params["brief"];
    if (typeof image !== "string" || !image)
      return { error: "image is required" };
    if (typeof brief !== "string" || !brief)
      return { error: "brief is required" };

    const prompt =
      `You are a demanding art director reviewing one image against a brief.` +
      `\n\nBrief:\n${brief}${tasteBlock(params)}` +
      `\n\nExamine the image and report only defects you can point at: things that are` +
      ` wrong, missing relative to the brief, or technically broken (anatomy, geometry,` +
      ` illegible text, composition, lighting inconsistencies). For each defect say` +
      ` exactly where it is and the concrete change that fixes it.` +
      `\n\nRules:` +
      `\n- Never suggest adding embellishment or "more detail" — only fixes to named problems.` +
      `\n- If the composition itself is wrong for the brief, say so explicitly; that means` +
      ` regenerating, not patching.` +
      `\n- Verdict "pass" only if the image fulfills the brief with no defect a client would notice.` +
      `\n\nRespond with JSON only:` +
      `\n{"verdict": "pass" | "revise", "defects": [{"defect": "...", "location": "...",` +
      ` "fix": "..."}], "strengths": ["..."]}`;

    try {
      const text = await judgeCall(context, m, [
        textPart(prompt),
        imagePart(image)
      ]);
      const critique = parseCritique(text);
      if (!critique) {
        return {
          error: `Judge did not return parseable JSON: ${text.slice(0, 300)}`
        };
      }
      return {
        type: "critique",
        provider: m.provider,
        model: m.model,
        ...critique
      };
    } catch (e) {
      return {
        error: `critique_image failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

// ---------------------------------------------------------------------------
// compare_images
// ---------------------------------------------------------------------------

interface MatchRecord {
  a: string;
  b: string;
  winner: string;
  agreed: boolean;
  reason: string;
}

function parsePairVerdict(
  text: string
): { winner: 1 | 2; reason: string } | null {
  const parsed = extractJSON(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null;
  const obj = parsed as Record<string, unknown>;
  const winner = Number(obj["winner"]);
  if (winner !== 1 && winner !== 2) return null;
  return { winner, reason: String(obj["reason"] ?? "") };
}

const COMPARE_IMAGES_SCHEMA: JsonSchema = {
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

const compareImages: CapabilityExport = {
  spec: {
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
  },
  impl: async (run, params) => {
    const context = run.context;
    const m = parseJudgeModelArgs(params);
    if ("error" in m) return m;
    const images = params["images"];
    const brief = params["brief"];
    if (
      !Array.isArray(images) ||
      images.length < 2 ||
      images.some((i) => typeof i !== "string" || !i)
    ) {
      return { error: "images must be an array of 2-8 non-empty strings" };
    }
    if (images.length > MAX_COMPARE_IMAGES) {
      return {
        error: `images must contain at most ${MAX_COMPARE_IMAGES} candidates`
      };
    }
    if (typeof brief !== "string" || !brief)
      return { error: "brief is required" };

    const prompt =
      `You are judging which of two images better fulfills a creative brief.` +
      `\n\nBrief:\n${brief}${tasteBlock(params)}` +
      `\n\nImage 1 is shown first, image 2 second. Judge fulfillment of the brief and` +
      ` craft (composition, coherence, technical execution) — not which image is busier` +
      ` or more embellished. You must pick exactly one winner.` +
      `\n\nRespond with JSON only: {"winner": 1 | 2, "reason": "one sentence"}`;

    const judgePair = async (
      a: string,
      b: string
    ): Promise<{ winner: string; reason: string } | { error: string }> => {
      const call = async (first: string, second: string) => {
        const text = await judgeCall(context, m, [
          textPart(prompt),
          imagePart(first),
          imagePart(second)
        ]);
        const verdict = parsePairVerdict(text);
        if (!verdict) {
          throw new Error(
            `Judge did not return parseable JSON: ${text.slice(0, 200)}`
          );
        }
        return {
          winner: verdict.winner === 1 ? first : second,
          reason: verdict.reason
        };
      };
      try {
        // Same pair, both presentation orders: an order-dependent preference
        // cancels out; only a stable preference wins outright.
        const [forward, reversed] = [await call(a, b), await call(b, a)];
        if (forward.winner === reversed.winner) {
          return { winner: forward.winner, reason: forward.reason };
        }
        // crypto randomInt over Math.random: not security-sensitive (it only
        // picks the tiebreak presentation order), but it keeps CodeQL's
        // insecure-randomness rule quiet without an exception.
        const tiebreak =
          randomInt(2) === 0 ? await call(a, b) : await call(b, a);
        return {
          winner: tiebreak.winner,
          reason: `(order-sensitive verdict, tiebreak) ${tiebreak.reason}`
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    };

    const matches: MatchRecord[] = [];
    let round = images.map(String);
    try {
      while (round.length > 1) {
        const next: string[] = [];
        for (let i = 0; i + 1 < round.length; i += 2) {
          const result = await judgePair(round[i], round[i + 1]);
          if ("error" in result)
            return { error: `compare_images failed: ${result.error}` };
          matches.push({
            a: round[i],
            b: round[i + 1],
            winner: result.winner,
            agreed: !result.reason.startsWith("(order-sensitive"),
            reason: result.reason
          });
          next.push(result.winner);
        }
        if (round.length % 2 === 1) next.push(round[round.length - 1]);
        round = next;
      }
    } catch (e) {
      return {
        error: `compare_images failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }

    return {
      type: "comparison",
      provider: m.provider,
      model: m.model,
      winner: round[0],
      matches,
      note:
        "Winner of a pairwise knockout. Other candidates were not deleted — " +
        "surface them to the user if the pick looks wrong."
    };
  }
};

// ---------------------------------------------------------------------------
// score_image_adherence
// ---------------------------------------------------------------------------

interface AdherenceAnswer {
  question: string;
  answer: "yes" | "no";
  note: string;
}

const SCORE_ADHERENCE_SCHEMA: JsonSchema = {
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

const scoreImageAdherence: CapabilityExport = {
  spec: {
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
  },
  impl: async (run, params) => {
    const context = run.context;
    const m = parseJudgeModelArgs(params);
    if ("error" in m) return m;
    const image = params["image"];
    const brief = params["brief"];
    if (typeof image !== "string" || !image)
      return { error: "image is required" };
    if (typeof brief !== "string" || !brief)
      return { error: "brief is required" };

    try {
      let questions = Array.isArray(params["questions"])
        ? (params["questions"] as unknown[]).map(String).filter(Boolean)
        : [];

      if (questions.length === 0) {
        const decomposeText = await judgeCall(context, m, [
          textPart(
            `Decompose this creative brief into at most ${MAX_ADHERENCE_QUESTIONS} atomic` +
              ` yes/no questions, each verifiable by looking at a single image. Cover every` +
              ` explicit requirement (subjects, counts, colors, text, style, composition,` +
              ` mood). Phrase each so "yes" means the requirement is met. Skip anything not` +
              ` visually checkable.` +
              `\n\nBrief:\n${brief}` +
              `\n\nRespond with JSON only: {"questions": ["..."]}`
          )
        ]);
        const parsed = extractJSON(decomposeText);
        const list =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)["questions"]
            : parsed;
        questions = Array.isArray(list) ? list.map(String).filter(Boolean) : [];
        if (questions.length === 0) {
          return {
            error: `Could not decompose the brief into checks: ${decomposeText.slice(0, 300)}`
          };
        }
      }
      questions = questions.slice(0, MAX_ADHERENCE_QUESTIONS);

      const answerText = await judgeCall(context, m, [
        textPart(
          `Answer each question about the image with a strict yes or no. "yes" only if` +
            ` the image clearly satisfies it; when unsure, answer "no" and say why in the note.` +
            `\n\nQuestions:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` +
            `\n\nRespond with JSON only:` +
            `\n{"answers": [{"question": "...", "answer": "yes" | "no", "note": "..."}]}`
        ),
        imagePart(image)
      ]);
      const parsed = extractJSON(answerText);
      const rawAnswers =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)["answers"]
          : null;
      if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
        return {
          error: `Judge did not return parseable answers: ${answerText.slice(0, 300)}`
        };
      }
      const answers: AdherenceAnswer[] = rawAnswers
        .filter((a): a is Record<string, unknown> =>
          Boolean(a && typeof a === "object")
        )
        .map((a) => ({
          question: String(a["question"] ?? ""),
          answer: a["answer"] === "yes" ? "yes" : "no",
          note: String(a["note"] ?? "")
        }));
      const passed = answers.filter((a) => a.answer === "yes").length;
      return {
        type: "adherence",
        provider: m.provider,
        model: m.model,
        score: answers.length ? passed / answers.length : 0,
        passed,
        total: answers.length,
        failed: answers.filter((a) => a.answer === "no"),
        answers
      };
    } catch (e) {
      return {
        error: `score_image_adherence failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

/** Every media capability, in the order `getAllMcpTools` offered them. */
export const MEDIA_CAPABILITIES: readonly CapabilityExport[] = [
  generateImage,
  editImage,
  generateVideo,
  animateImage,
  generateSpeech,
  transcribeAudio,
  embedText,
  critiqueImage,
  compareImages,
  scoreImageAdherence
];

export const module: CapabilityModule = {
  module: "media",
  exports: MEDIA_CAPABILITIES
};

export {
  generateImage,
  editImage,
  generateVideo,
  animateImage,
  generateSpeech,
  transcribeAudio,
  embedText,
  critiqueImage,
  compareImages,
  scoreImageAdherence
};
