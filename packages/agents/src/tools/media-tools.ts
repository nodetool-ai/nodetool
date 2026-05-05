/**
 * Generic provider-backed media generation tools for any agent loop.
 *
 * Each tool is a thin wrapper around `ProcessingContext.runProviderPrediction`
 * (or `streamProviderPrediction` for capabilities that require it). They take
 * `provider` + `model_id` + capability-specific params, dispatch to whichever
 * `BaseProvider` is registered for that id, and return a JSON-friendly result.
 *
 * Persistence: outputs are saved as proper **assets** when the context
 * exposes a `createAsset` model interface — the tool returns an
 * `asset_id` + `asset_uri` ("asset://<id>.<ext>") that subsequent steps and
 * the chat UI can reference. When no asset interface is wired (CLI without
 * a model layer, tests), the tool falls back to writing the bytes to the
 * caller-supplied `output_file` under the workspace.
 *
 * Pair with `find_model` so the agent first picks a `{provider, model_id}`
 * and then calls the right generation tool.
 */

import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import {
  persistOutput,
  workspaceDir,
  inferImageMime
} from "./asset-persist.js";

const MAX_INLINE_TEXT_PREVIEW = 500;

async function readWorkspaceOrAssetFile(
  context: ProcessingContext,
  inputFile: string
): Promise<Uint8Array> {
  const ws = workspaceDir(context);
  const filePath = ws ? path.join(ws, inputFile) : inputFile;
  const buf = await fs.readFile(filePath);
  return new Uint8Array(buf);
}

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

/* ------------------------------------------------------------------ */
/*  Image generation                                                  */
/* ------------------------------------------------------------------ */

export class GenerateImageTool extends Tool {
  readonly name = "generate_image";
  readonly description =
    "Generate an image from a text prompt using a provider+model selected via find_model (capability=text_to_image). The result is saved as an asset (asset:// URI returned); pass `output_file` to also write a workspace copy.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      provider: { type: "string" as const, description: "Provider id from find_model." },
      model: { type: "string" as const, description: "Model id from find_model." },
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

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
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
      return { type: "image", provider: m.provider, model: m.model, ...persisted };
    } catch (e) {
      return { error: `text_to_image failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Generating image with ${String(params["provider"])}:${String(params["model"])}`;
  }
}

export class EditImageTool extends Tool {
  readonly name = "edit_image";
  readonly description =
    "Transform a source image with a text prompt using a provider+model selected via find_model (capability=image_to_image). Source can be an asset URI (asset://...) or a workspace path. Result is saved as an asset.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      provider: { type: "string" as const, description: "Provider id from find_model." },
      model: { type: "string" as const, description: "Model id from find_model." },
      input_file: {
        type: "string" as const,
        description: "Workspace-relative path of the source image (or asset:// URI)."
      },
      prompt: { type: "string" as const, description: "Text prompt describing the desired transformation." },
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

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
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
      return { type: "image", provider: m.provider, model: m.model, ...persisted };
    } catch (e) {
      return { error: `image_to_image failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Editing image with ${String(params["provider"])}:${String(params["model"])}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Video generation                                                  */
/* ------------------------------------------------------------------ */

export class GenerateVideoTool extends Tool {
  readonly name = "generate_video";
  readonly description =
    "Generate a video from a text prompt using a provider+model selected via find_model (capability=text_to_video). Result is saved as an asset (asset:// URI returned).";
  readonly inputSchema = {
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

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
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
      return { type: "video", provider: m.provider, model: m.model, ...persisted };
    } catch (e) {
      return { error: `text_to_video failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Generating video with ${String(params["provider"])}:${String(params["model"])}`;
  }
}

export class AnimateImageTool extends Tool {
  readonly name = "animate_image";
  readonly description =
    "Animate a source image into a video using a provider+model selected via find_model (capability=image_to_video). Source can be a workspace path or asset URI; result is saved as an asset.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      provider: { type: "string" as const },
      model: { type: "string" as const },
      input_file: {
        type: "string" as const,
        description: "Workspace-relative path of the source image (or asset:// URI)."
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

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
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
      return { type: "video", provider: m.provider, model: m.model, ...persisted };
    } catch (e) {
      return { error: `image_to_video failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Animating image with ${String(params["provider"])}:${String(params["model"])}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Audio: TTS + ASR                                                  */
/* ------------------------------------------------------------------ */

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

function audioFormatFromOutputFile(outputFile: string | undefined): string | null {
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

export class GenerateSpeechTool extends Tool {
  readonly name = "generate_speech";
  readonly description =
    "Synthesize speech audio from text using a provider+model selected via find_model (capability=text_to_speech). Result is saved as an asset (asset:// URI returned).";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      provider: { type: "string" as const },
      model: { type: "string" as const },
      text: { type: "string" as const, description: "Text to speak." },
      output_file: {
        type: "string" as const,
        description: "Optional workspace-relative path to also write the audio file (mp3/wav/pcm depending on provider)."
      },
      voice: { type: "string" as const },
      speed: { type: "number" as const, description: "Speech speed (e.g. 0.25–4.0)." }
    },
    required: ["provider", "model", "text"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const text = params["text"];
    if (typeof text !== "string" || !text)
      return { error: "text is required" };

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
            parts.push(int16ToUint8(chunk.samples));
          }
        }
        if (parts.length === 0)
          return { error: "Provider returned no audio data" };
        const merged = concatUint8(parts);
        if (pcmOnly && !mimeType) {
          // Wrap raw PCM in WAV so the bytes are playable. Rename .mp3 →
          // .wav since the actual data is now WAV, not MP3.
          audio = wrapPcmAsWav(merged);
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
      return { error: `text_to_speech failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Synthesizing speech with ${String(params["provider"])}:${String(params["model"])}`;
  }
}

export class TranscribeAudioTool extends Tool {
  readonly name = "transcribe_audio";
  readonly description =
    "Transcribe an audio file to text using a provider+model selected via find_model (capability=automatic_speech_recognition). Source can be a workspace path or asset:// URI.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      provider: { type: "string" as const },
      model: { type: "string" as const },
      input_file: {
        type: "string" as const,
        description: "Workspace-relative path of the audio file to transcribe (or asset:// URI)."
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

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
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
      return { error: `transcribe failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Transcribing audio with ${String(params["provider"])}:${String(params["model"])}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Embeddings                                                        */
/* ------------------------------------------------------------------ */

export class EmbedTextTool extends Tool {
  readonly name = "embed_text";
  readonly description =
    "Compute embedding vector(s) for a text or list of texts using a provider+model selected via find_model (capability=generate_embedding).";
  readonly inputSchema = {
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
        description: "Optional target dimensions if the model supports truncation."
      }
    },
    required: ["provider", "model", "text"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
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
      return { error: `generate_embedding failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Embedding text with ${String(params["provider"])}:${String(params["model"])}`;
  }
}
