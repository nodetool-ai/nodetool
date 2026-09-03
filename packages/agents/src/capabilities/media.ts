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
import { randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Message, MessageContent } from "@nodetool-ai/protocol";
import type {
  GenerationRequest,
  ImageBox,
  ImageSegmentationMask,
  JsonSchema,
  ProcessingContext,
  SegmentPoint,
  Workspace
} from "@nodetool-ai/runtime";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import {
  HostBinaryMissingError,
  clampTimeoutSeconds,
  mimeFromFilename,
  runHostBinary,
  type RunHostBinaryOptions
} from "../host-binaries.js";
import {
  MAX_DOWNLOAD_BYTES,
  buildYtDlpArgv,
  confineArgvToWorkspace,
  hardenFfmpegArgv,
  refuseFlagLikeValue
} from "../host-binary-guard.js";
import {
  assertFetchUrlAllowed,
  assertResolvedHostAllowed
} from "../network-guard.js";
import { encodeBase64 as encodeMediaBase64 } from "../sandbox-bytes.js";
import {
  DEFAULT_MIME,
  MAX_MEDIA_REF_BYTES,
  filesystemPathForUri,
  mimeForRef
} from "../sandbox-media-ref.js";
import {
  MIME_TO_EXT,
  inferImageMime,
  persistOutput
} from "../tools/asset-persist.js";
import type { SavedOutput } from "../tools/asset-persist.js";
import { persistBinaryOutput } from "../tools/binary-output.js";
import { extractJSON } from "../utils/json-parser.js";
import { isYtDlpEnabled } from "../yt-dlp-gate.js";
import {
  isFunction,
  isNonBlankString,
  isNonEmptyString,
  isObjectLike,
  isRecord,
  isString
} from "../utils/type-guards.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
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
  ytDlpSpec,
  DEFAULT_UNDERSTAND_VIDEO_TOKENS,
  DEFAULT_VIDEO_PROMPT,
  MAX_COMPARE_IMAGES,
  MAX_UNDERSTAND_VIDEO_TOKENS,
  GENERATE_IMAGE_SCHEMA,
  EDIT_IMAGE_SCHEMA,
  GENERATE_VIDEO_SCHEMA,
  ANIMATE_IMAGE_SCHEMA,
  GENERATE_SPEECH_SCHEMA,
  GENERATE_MUSIC_SCHEMA,
  TRANSCRIBE_AUDIO_SCHEMA,
  EMBED_TEXT_SCHEMA,
  READ_MEDIA_BYTES_SCHEMA,
  CRITIQUE_IMAGE_SCHEMA,
  COMPARE_IMAGES_SCHEMA,
  SCORE_ADHERENCE_SCHEMA,
  UNDERSTAND_VIDEO_SCHEMA
} from "./media.specs.js";

export {
  MAX_COMPARE_IMAGES,
  GENERATE_IMAGE_SCHEMA,
  EDIT_IMAGE_SCHEMA,
  GENERATE_VIDEO_SCHEMA,
  ANIMATE_IMAGE_SCHEMA,
  GENERATE_SPEECH_SCHEMA,
  GENERATE_MUSIC_SCHEMA,
  TRANSCRIBE_AUDIO_SCHEMA,
  EMBED_TEXT_SCHEMA,
  READ_MEDIA_BYTES_SCHEMA,
  CRITIQUE_IMAGE_SCHEMA,
  COMPARE_IMAGES_SCHEMA,
  SCORE_ADHERENCE_SCHEMA,
  UNDERSTAND_VIDEO_SCHEMA
} from "./media.specs.js";

const MAX_INLINE_TEXT_PREVIEW = 500;
const MAX_ADHERENCE_QUESTIONS = 12;
const JUDGE_MAX_TOKENS = 1500;

interface MediaModelArgs {
  provider: string;
  model: string;
}

function readModelId(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined;
}

/**
 * Read a provider+model from the shapes find_model actually returns: a hit
 * (`provider` + `model_id` + `ref`), its `.ref` (`provider` + `id`), or the
 * documented `{provider, model}` pair. Nested `model` objects win over the
 * top-level pair so `generate_video({prompt, model: hit.ref})` works.
 */
function modelFromRecord(value: unknown): MediaModelArgs | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.ref)) {
    const fromRef = modelFromRecord(value.ref);
    if (fromRef !== null) return fromRef;
  }
  const provider = readModelId(value.provider);
  const id =
    readModelId(value.model_id) ??
    (isNonEmptyString(value.model) ? value.model : undefined) ??
    readModelId(value.id);
  if (provider !== undefined && id !== undefined) {
    return { provider, model: id };
  }
  return null;
}

/**
 * A provider rejection, with the model that was called in it.
 *
 * "text_to_video failed: Unprocessable Entity" told a live session nothing:
 * the model it had picked was an image-to-video endpoint, and the message
 * named neither the model nor the way out. `find_model` now filters by
 * direction, and when a provider still refuses, the error says which model to
 * re-pick.
 */
function predictionError(
  capability: string,
  m: MediaModelArgs,
  e: unknown
): { error: string } {
  const detail = e instanceof Error ? e.message : String(e);
  return {
    error:
      `${capability} failed for ${m.provider}:${m.model} — ${detail}. ` +
      `If the model does not do ${capability}, pick another with ` +
      `find_model({capability: "${capability}"}).`
  };
}

function parseModelArgs(
  params: Record<string, unknown>
): MediaModelArgs | { error: string } {
  const fromModel = modelFromRecord(params.model);
  if (fromModel !== null) return fromModel;
  if (isRecord(params.model) && isNonEmptyString(params.provider)) {
    const nested = params.model;
    const id =
      readModelId(nested.model_id) ??
      readModelId(nested.id) ??
      (isNonEmptyString(nested.model) ? nested.model : undefined);
    if (id !== undefined) {
      return { provider: params.provider, model: id };
    }
  }
  const fromParams = modelFromRecord(params);
  if (fromParams !== null) return fromParams;
  if (isNonEmptyString(params.model) && params.model.includes("/")) {
    const slash = params.model.indexOf("/");
    return {
      provider: params.model.slice(0, slash),
      model: params.model.slice(slash + 1)
    };
  }
  if (!isNonEmptyString(params.provider)) {
    return { error: "provider must be a non-empty string (use find_model)" };
  }
  if (!isNonEmptyString(params.model)) {
    return { error: "model must be a non-empty string (use find_model)" };
  }
  return { provider: params.provider, model: params.model };
}

async function readWorkspaceOrAssetFile(
  context: ProcessingContext,
  inputFile: string
): Promise<Uint8Array> {
  // asset:// URIs are the primary handle the generate_* capabilities return (an
  // asset is created with no workspace copy), and the docs advertise asset://
  // sources. Route them through the asset resolver — the workspace treats them
  // as literal keys (asset://id.png → key "asset:/id.png") and fails.
  if (inputFile.startsWith("asset://")) {
    const { bytes } = await context.resolveAssetBytes(inputFile);
    if (!bytes) {
      throw new Error(`Asset not found: ${inputFile}`);
    }
    return bytes;
  }
  // Read through the workspace so a cloud deployment behaves like a local one.
  if (!context.workspace) {
    throw new Error("No workspace configured — cannot read input file.");
  }
  const bytes = await context.workspace.read(inputFile);
  if (!bytes) {
    throw new Error(`Input file not found in workspace: ${inputFile}`);
  }
  return bytes;
}

/**
 * A generation that produced no handle is a failure, not a success.
 *
 * A run whose bytes never became an asset (no asset interface, `createAsset`
 * threw, no workspace to fall back to) used to return `{type, provider, model,
 * bytes, mime_type}` — success-shaped, with `asset_uri` undefined, which an
 * agent printed as "OK undefined" and carried on from. Report what was missing
 * instead.
 */
function outputError(
  capability: string,
  m: MediaModelArgs,
  missing: string
): { error: string } {
  return {
    error: `${capability} for ${m.provider}:${m.model} returned no usable output — ${missing}.`
  };
}

/** The provider's bytes, or null when it produced none. */
function generatedBytes(result: unknown): Uint8Array | null {
  return result instanceof Uint8Array && result.length > 0 ? result : null;
}

/** Whether a persisted output carries a handle the caller can read back. */
function hasOutputHandle(persisted: SavedOutput): boolean {
  return (
    isNonEmptyString(persisted.asset_uri) || isNonEmptyString(persisted.path)
  );
}

// ---------------------------------------------------------------------------
// The generation seam, as the capabilities use it
// ---------------------------------------------------------------------------

/** Background generations a run may have open at once (design § 10.1). */
const MAX_BACKGROUND_GENERATIONS = 16;
const openBackground = new WeakMap<ProcessingContext, number>();

function toolCallIdOf(params: Record<string, unknown>): string | null {
  const id = params["_tool_call_id"];
  return isNonEmptyString(id) ? id : null;
}

function outputFileOf(params: Record<string, unknown>): string | undefined {
  return isString(params["output_file"]) ? params["output_file"] : undefined;
}

/** What a capability asks the seam for, beyond the provider parameters. */
interface MediaGeneration {
  capability: GenerationRequest["capability"];
  m: MediaModelArgs;
  params: Record<string, unknown>;
  namePrefix: string;
  type: "image" | "video" | "audio";
  /** A fixed MIME (video/mp4); unset means sniff the bytes. */
  mime?: string;
}

/** The request every media capability hands `runGeneration`. */
function generationRequest(
  id: string,
  params: Record<string, unknown>,
  spec: MediaGeneration
): GenerationRequest {
  const outputFile = outputFileOf(params);
  const persist: GenerationRequest["persist"] = {};
  if (outputFile) persist.name = path.basename(outputFile);
  if (spec.mime) persist.mime = spec.mime;
  return {
    id,
    provider: spec.m.provider,
    capability: spec.capability,
    model: spec.m.model,
    params: spec.params,
    origin: { surface: "capability", tool_call_id: toolCallIdOf(params) },
    persist
  };
}

/**
 * Write the bytes where the caller can read them back: the asset the seam
 * saved when it could, plus a workspace copy when `output_file` was named or
 * no asset exists. `persistOutput` handles the no-asset case as before.
 */
async function finishOutput(
  context: ProcessingContext,
  bytes: Uint8Array,
  assets: ReadonlyArray<{ asset_id?: string | null; uri: string }>,
  opts: { namePrefix: string; mime: string; outputFile?: string }
): Promise<SavedOutput> {
  const first = assets[0];
  if (!first || !isNonEmptyString(first.asset_id)) {
    return persistOutput(context, bytes, opts);
  }
  const result: SavedOutput = {
    bytes: bytes.length,
    mime_type: opts.mime,
    asset_id: first.asset_id,
    asset_uri: first.uri,
    url: first.uri
  };
  if (opts.outputFile && context.workspace) {
    try {
      await context.workspace.write(opts.outputFile, bytes, opts.mime);
      result.path = opts.outputFile;
    } catch {
      // Non-fatal — the asset is the handle.
    }
  }
  return result;
}

/**
 * The asset the seam saved for a generation, read off the registry's settled
 * outcome. The encoded-audio paths return the provider's result rather than
 * the seam's, so this is how a capability learns what was persisted.
 */
async function seamAssetFor(id: string): Promise<string | null> {
  const { generationRegistry } = await import("@nodetool-ai/runtime");
  const outcome = generationRegistry.outcome(id);
  return outcome?.asset_ids[0] ?? null;
}

/** What a `background: true` call answers with. */
function backgroundReceipt(
  id: string,
  spec: MediaGeneration
): Record<string, unknown> {
  return {
    type: spec.type,
    generation_id: id,
    status: "running",
    background: true,
    provider: spec.m.provider,
    model: spec.m.model,
    capability: spec.capability,
    next: "Call await_generation with this generation_id to collect the asset, or get_generation to check on it."
  };
}

/**
 * Start a generation without waiting for it. The seam records the row and
 * saves the asset whether or not anyone awaits; the count is bounded so a
 * loop cannot open an unbounded number of paid calls.
 */
function startBackgroundGeneration(
  context: ProcessingContext,
  req: GenerationRequest,
  spec: MediaGeneration,
  params: Record<string, unknown>
): Record<string, unknown> {
  const open = openBackground.get(context) ?? 0;
  if (open >= MAX_BACKGROUND_GENERATIONS) {
    return {
      error: `${MAX_BACKGROUND_GENERATIONS} background generations are already open on this run. Collect one with await_generation before starting another.`
    };
  }
  openBackground.set(context, open + 1);
  const outputFile = outputFileOf(params);
  void context
    .runGeneration(req)
    .then(async (result) => {
      const bytes = generatedBytes(result.output);
      if (bytes && outputFile && context.workspace) {
        await context.workspace.write(
          outputFile,
          bytes,
          spec.mime ?? inferImageMime(bytes)
        );
      }
    })
    .catch(() => {
      // Recorded on the row by the tracker; nothing to report here.
    })
    .finally(() => {
      openBackground.set(
        context,
        Math.max(0, (openBackground.get(context) ?? 1) - 1)
      );
    });
  return backgroundReceipt(req.id ?? "", spec);
}

/**
 * Run one media generation through the seam and answer with the handle:
 * the asset (and workspace path) plus the `generation_id` the `generations`
 * capabilities take.
 */
async function runMediaGeneration(
  run: CapabilityRun,
  params: Record<string, unknown>,
  spec: MediaGeneration
): Promise<unknown> {
  const context = run.context;
  const id = randomUUID();
  const req = generationRequest(id, params, spec);
  if (params["background"] === true) {
    return startBackgroundGeneration(context, req, spec, params);
  }
  try {
    const result = await context.runGeneration(req);
    const bytes = generatedBytes(result.output);
    if (!bytes) {
      return {
        ...outputError(
          spec.capability,
          spec.m,
          `the provider returned no ${spec.type} data`
        ),
        generation_id: id
      };
    }
    const persisted = await finishOutput(context, bytes, result.assets, {
      namePrefix: spec.namePrefix,
      mime: spec.mime ?? inferImageMime(bytes),
      outputFile: outputFileOf(params)
    });
    if (!hasOutputHandle(persisted)) {
      return {
        ...outputError(
          spec.capability,
          spec.m,
          `the ${persisted.bytes}-byte result could not be stored (no asset was created and no workspace file was written)`
        ),
        generation_id: id
      };
    }
    return {
      type: spec.type,
      provider: spec.m.provider,
      model: spec.m.model,
      generation_id: id,
      ...persisted
    };
  } catch (e) {
    return { ...predictionError(spec.capability, spec.m, e), generation_id: id };
  }
}

const generateImage: CapabilityExport = {
  spec: generateImageSpec,
  impl: async (run, params) => {
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const prompt = params["prompt"];
    if (!isNonEmptyString(prompt))
      return { error: "prompt is required" };
    return runMediaGeneration(run, params, {
      capability: "text_to_image",
      m,
      type: "image",
      namePrefix: "generated-image",
      params: {
        prompt,
        negative_prompt: params["negative_prompt"],
        width: params["width"],
        height: params["height"],
        quality: params["quality"]
      }
    });
  }
};

const editImage: CapabilityExport = {
  spec: editImageSpec,
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const inputFile = params["input_file"];
    const prompt = params["prompt"];
    if (!isNonEmptyString(inputFile))
      return { error: "input_file is required" };
    if (!isNonEmptyString(prompt))
      return { error: "prompt is required" };
    let image: Uint8Array;
    try {
      image = await readWorkspaceOrAssetFile(context, inputFile);
    } catch (e) {
      return predictionError("image_to_image", m, e);
    }
    return runMediaGeneration(run, params, {
      capability: "image_to_image",
      m,
      type: "image",
      namePrefix: "edited-image",
      params: {
        image,
        prompt,
        negative_prompt: params["negative_prompt"],
        target_width: params["target_width"],
        target_height: params["target_height"],
        strength: params["strength"]
      }
    });
  }
};

/** Coerce one `points` entry from the model's arguments. */
function parseSegmentPoint(value: unknown): SegmentPoint | null {
  if (!isRecord(value)) return null;
  const x = value["x"];
  const y = value["y"];
  if (typeof x !== "number" || typeof y !== "number") return null;
  return { x, y, include: value["include"] !== false };
}

function parseSegmentBox(value: unknown): ImageBox | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return null;
  }
  return { x, y, width, height };
}

const segmentImage: CapabilityExport = {
  spec: segmentImageSpec,
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const inputFile = params["input_file"];
    if (!isNonEmptyString(inputFile))
      return { error: "input_file is required" };

    const rawPoints = params["points"];
    const points = Array.isArray(rawPoints)
      ? rawPoints.map(parseSegmentPoint).filter((p): p is SegmentPoint => p !== null)
      : [];

    try {
      const image = await readWorkspaceOrAssetFile(context, inputFile);
      const masks = (await context.runProviderPrediction({
        provider: m.provider,
        capability: "segment_image",
        model: m.model,
        params: {
          image,
          prompt: params["prompt"],
          points: points.length > 0 ? points : undefined,
          box: parseSegmentBox(params["box"]) ?? undefined,
          max_masks: params["max_masks"],
          min_confidence: params["min_confidence"]
        }
      })) as ImageSegmentationMask[];

      const saved = [];
      for (const [index, found] of masks.entries()) {
        const persisted = await persistOutput(context, found.mask, {
          namePrefix: `segment-mask-${index + 1}`,
          mime: found.mimeType || inferImageMime(found.mask)
        });
        saved.push({
          label: found.label ?? null,
          confidence: found.confidence ?? null,
          box: found.box ?? null,
          width: found.width ?? null,
          height: found.height ?? null,
          ...persisted
        });
      }
      return {
        type: "segmentation",
        provider: m.provider,
        model: m.model,
        // An empty list is the model's answer, not a failure — say so, because
        // a bare `[]` reads as a broken call.
        found: saved.length,
        masks: saved
      };
    } catch (e) {
      return predictionError("segment_image", m, e);
    }
  }
};

const generateVideo: CapabilityExport = {
  spec: generateVideoSpec,
  impl: async (run, params) => {
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const prompt = params["prompt"];
    if (!isNonEmptyString(prompt))
      return { error: "prompt is required" };
    return runMediaGeneration(run, params, {
      capability: "text_to_video",
      m,
      type: "video",
      namePrefix: "generated-video",
      mime: "video/mp4",
      params: {
        prompt,
        negative_prompt: params["negative_prompt"],
        num_frames: params["num_frames"],
        aspect_ratio: params["aspect_ratio"],
        resolution: params["resolution"]
      }
    });
  }
};

const animateImage: CapabilityExport = {
  spec: animateImageSpec,
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const inputFile = params["input_file"];
    if (!isNonEmptyString(inputFile))
      return { error: "input_file is required" };
    let image: Uint8Array;
    try {
      image = await readWorkspaceOrAssetFile(context, inputFile);
    } catch (e) {
      return predictionError("image_to_video", m, e);
    }
    return runMediaGeneration(run, params, {
      capability: "image_to_video",
      m,
      type: "video",
      namePrefix: "animated-video",
      mime: "video/mp4",
      params: {
        image,
        prompt: params["prompt"],
        num_frames: params["num_frames"],
        aspect_ratio: params["aspect_ratio"],
        resolution: params["resolution"]
      }
    });
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

/** What a provider needs to produce one encoded take. */
interface EncodedSpeechParams {
  text: string;
  voice: unknown;
  speed: unknown;
  audioFormat: string;
}

/**
 * Ask for fully-encoded speech through whichever seam this context has.
 *
 * `context.textToSpeechEncoded` is the one `nodetool.audio.TextToSpeech` uses,
 * and the one that emits the prediction events a run is billed and traced by,
 * so it is tried first. Reaching past it to `getProvider` was the only path
 * before, and it cost every FAL and KIE voice on a context that carries the
 * prediction seams but not `getProvider`: the TypeError landed in the caller's
 * catch, and the streaming fallback then reported "fal_ai does not support
 * textToSpeech" — of a provider whose entire TTS catalog is encoded.
 */
async function encodedSpeech(
  context: ProcessingContext,
  m: MediaModelArgs,
  params: EncodedSpeechParams,
  generation?: Pick<GenerationRequest, "id" | "origin" | "persist">
): Promise<{ data?: Uint8Array; mimeType?: string } | null> {
  if (isFunction(context.textToSpeechEncoded)) {
    return await context.textToSpeechEncoded({
      ...generation,
      provider: m.provider,
      capability: "text_to_speech",
      model: m.model,
      params: {
        text: params.text,
        voice: params.voice,
        speed: params.speed,
        audioFormat: params.audioFormat
      }
    });
  }
  if (isFunction(context.getProvider)) {
    const provider = await context.getProvider(m.provider);
    return await provider.textToSpeechEncoded({
      text: params.text,
      model: m.model,
      voice: params.voice as string | undefined,
      speed: params.speed as number | undefined,
      audioFormat: params.audioFormat
    });
  }
  throw new Error("this runtime's context has no encoded text_to_speech path");
}

const generateSpeech: CapabilityExport = {
  spec: generateSpeechSpec,
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const text = params["text"];
    if (!isNonEmptyString(text)) return { error: "text is required" };

    const outputFile = isString(params["output_file"])
      ? params["output_file"]
      : undefined;
    const desiredFormat = audioFormatFromOutputFile(outputFile) ?? "mp3";
    const generationId = randomUUID();
    const generation: Pick<GenerationRequest, "id" | "origin" | "persist"> = {
      id: generationId,
      origin: { surface: "capability", tool_call_id: toolCallIdOf(params) },
      persist: outputFile ? { name: path.basename(outputFile) } : {}
    };
    const speechParams = {
      text,
      voice: params["voice"],
      speed: params["speed"],
      audioFormat: desiredFormat
    };

    if (params["background"] === true) {
      const spec: MediaGeneration = {
        capability: "text_to_speech",
        m,
        type: "audio",
        namePrefix: "generated-speech",
        params: speechParams
      };
      const open = openBackground.get(context) ?? 0;
      if (open >= MAX_BACKGROUND_GENERATIONS) {
        return {
          error: `${MAX_BACKGROUND_GENERATIONS} background generations are already open on this run. Collect one with await_generation before starting another.`
        };
      }
      openBackground.set(context, open + 1);
      void encodedSpeech(context, m, speechParams, generation)
        .catch(() => null)
        .finally(() => {
          openBackground.set(
            context,
            Math.max(0, (openBackground.get(context) ?? 1) - 1)
          );
        });
      return backgroundReceipt(generationId, spec);
    }

    try {
      // Preferred path: ask the provider for fully-encoded audio in the
      // desired container (mp3/wav/flac/...). Returns null when the provider
      // doesn't support encoded TTS — we then fall through to streaming PCM.
      let audio: Uint8Array | null = null;
      let mimeType: string | undefined;
      let outputFileFinal = outputFile;
      // The asset the seam saved on the encoded path, when it could.
      let seamAssetId: string | null = null;
      // Why the encoded path gave up, kept for the failure message. A provider
      // that only does encoded TTS (FAL, KIE) leaves the streaming method as
      // the base class's, which throws "<provider> does not support
      // textToSpeech" — so discarding this error reported the one thing that
      // was not wrong, and a session spent three rounds hunting for a TTS
      // model when the real answer was in the sentence thrown here.
      let encodedError: string | undefined;

      try {
        const encoded = await encodedSpeech(
          context,
          m,
          speechParams,
          generation
        );
        if (encoded && encoded.data) {
          audio = encoded.data;
          mimeType = encoded.mimeType;
          seamAssetId = await seamAssetFor(generationId);
        }
      } catch (e) {
        encodedError = e instanceof Error ? e.message : String(e);
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
        try {
          for await (const item of context.streamProviderPrediction({
            id: generationId,
            origin: generation.origin,
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
            } else if (isString(chunk.data)) {
              parts.push(Buffer.from(chunk.data, "base64"));
              if (chunk.mimeType) mimeType = chunk.mimeType;
              pcmOnly = false;
            } else if (chunk.samples) {
              pcmSampleRate ??= chunk.sampleRate;
              parts.push(int16ToUint8(chunk.samples));
            }
          }
        } catch (e) {
          // Both paths failed. Report the encoded one first: on a provider
          // that only does encoded TTS the streaming error is the base class's
          // "does not support textToSpeech", which is true of the method and
          // false of the provider.
          if (encodedError) {
            throw new Error(
              `${encodedError} (the streaming fallback then failed too: ${
                e instanceof Error ? e.message : String(e)
              })`
            );
          }
          throw e;
        }
        if (parts.length === 0) {
          return {
            error: encodedError
              ? `Provider returned no audio data: ${encodedError}`
              : "Provider returned no audio data"
          };
        }
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

      const mime = mimeType ?? "audio/mpeg";
      const persisted = await finishOutput(
        context,
        audio,
        seamAssetId
          ? [
              {
                asset_id: seamAssetId,
                uri: `asset://${seamAssetId}.${MIME_TO_EXT[mime] ?? "bin"}`
              }
            ]
          : [],
        {
          namePrefix: "generated-speech",
          mime,
          outputFile: outputFileFinal
        }
      );
      return {
        type: "audio",
        provider: m.provider,
        model: m.model,
        generation_id: generationId,
        ...persisted
      };
    } catch (e) {
      return { ...predictionError("text_to_speech", m, e), generation_id: generationId };
    }
  }
};

/**
 * Music from a prompt — the counterpart to {@link generateSpeech}, and the
 * hole every other generation capability made conspicuous.
 *
 * Without it, scoring a cut meant running `nodetool.audio.TextToMusic` through
 * `run_node`: a one-node graph, and therefore the graph validator, a typed
 * `music_model` property and a model ref to satisfy before a single second of
 * audio existed. A live session spent five rounds there and shipped silent.
 */
const generateMusic: CapabilityExport = {
  spec: generateMusicSpec,
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const prompt = params["prompt"];
    if (!isNonEmptyString(prompt)) return { error: "prompt is required" };

    if (!isFunction(context.textToMusic)) {
      return {
        error: "this runtime's context has no text_to_music path"
      };
    }

    const outputFile = isString(params["output_file"])
      ? params["output_file"]
      : undefined;
    const desiredFormat = audioFormatFromOutputFile(outputFile) ?? "mp3";
    const generationId = randomUUID();
    const musicParams = {
      prompt,
      lyrics: params["lyrics"],
      duration_seconds: params["duration_seconds"],
      audioFormat: desiredFormat
    };
    const req: GenerationRequest = {
      id: generationId,
      provider: m.provider,
      capability: "text_to_music",
      model: m.model,
      params: musicParams,
      origin: { surface: "capability", tool_call_id: toolCallIdOf(params) },
      persist: outputFile ? { name: path.basename(outputFile) } : {}
    };
    const spec: MediaGeneration = {
      capability: "text_to_music",
      m,
      type: "audio",
      namePrefix: "generated-music",
      params: musicParams
    };

    if (params["background"] === true) {
      const open = openBackground.get(context) ?? 0;
      if (open >= MAX_BACKGROUND_GENERATIONS) {
        return {
          error: `${MAX_BACKGROUND_GENERATIONS} background generations are already open on this run. Collect one with await_generation before starting another.`
        };
      }
      openBackground.set(context, open + 1);
      void context
        .textToMusic(req)
        .catch(() => null)
        .finally(() => {
          openBackground.set(
            context,
            Math.max(0, (openBackground.get(context) ?? 1) - 1)
          );
        });
      return backgroundReceipt(generationId, spec);
    }

    try {
      const encoded = await context.textToMusic(req);
      if (!encoded?.data || encoded.data.length === 0) {
        return { error: "Provider returned no audio data", generation_id: generationId };
      }
      const mime = encoded.mimeType ?? "audio/mpeg";
      const seamAssetId = await seamAssetFor(generationId);
      const persisted = await finishOutput(
        context,
        encoded.data,
        seamAssetId
          ? [
              {
                asset_id: seamAssetId,
                uri: `asset://${seamAssetId}.${MIME_TO_EXT[mime] ?? "bin"}`
              }
            ]
          : [],
        { namePrefix: "generated-music", mime, outputFile }
      );
      return {
        type: "audio",
        provider: m.provider,
        model: m.model,
        generation_id: generationId,
        ...persisted
      };
    } catch (e) {
      return { ...predictionError("text_to_music", m, e), generation_id: generationId };
    }
  }
};

const transcribeAudio: CapabilityExport = {
  spec: transcribeAudioSpec,
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const inputFile = params["input_file"];
    if (!isNonEmptyString(inputFile))
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

const embedText: CapabilityExport = {
  spec: embedTextSpec,
  impl: async (run, params) => {
    const context = run.context;
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const text = params["text"];
    if (!isString(text) && !Array.isArray(text))
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
  if (!isNonEmptyString(provider)) {
    return {
      error:
        "provider must be a non-empty string (use find_model with a vision-capable chat model)"
    };
  }
  if (!isNonEmptyString(model)) {
    return {
      error:
        "model must be a non-empty string (use find_model with a vision-capable chat model)"
    };
  }
  return { provider, model };
}

/** Normalize a media source so the context media resolver can inline it. */
function normalizeMediaSource(source: string): string {
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
    image: { type: "image", uri: normalizeMediaSource(source) }
  };
}

function videoPart(source: string): MessageContent {
  return {
    type: "video",
    video: { type: "video", uri: normalizeMediaSource(source) }
  };
}

function textPart(text: string): MessageContent {
  return { type: "text", text };
}

/** Pull the text out of a provider response message. */
function messageText(message: Message): string {
  const content = message.content;
  if (isString(content)) return content;
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
  content: MessageContent[],
  maxTokens: number = JUDGE_MAX_TOKENS
): Promise<string> {
  const result = (await context.runProviderPrediction({
    provider: m.provider,
    capability: "generate_message",
    model: m.model,
    params: {
      messages: [{ role: "user", content }] satisfies Message[],
      max_tokens: maxTokens,
      temperature: 0
    }
  })) as Message;
  return messageText(result);
}

function tasteBlock(params: Record<string, unknown>): string {
  const profile = params["taste_profile"];
  if (!isNonBlankString(profile)) return "";
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
  if (!isRecord(parsed)) {
    return null;
  }
  const obj = parsed;
  const verdict = obj["verdict"] === "pass" ? "pass" : "revise";
  const defects: CritiqueDefect[] = Array.isArray(obj["defects"])
    ? (obj["defects"] as unknown[])
        .filter(isObjectLike)
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

const critiqueImage: CapabilityExport = {
  spec: critiqueImageSpec,
  impl: async (run, params) => {
    const context = run.context;
    const m = parseJudgeModelArgs(params);
    if ("error" in m) return m;
    const image = params["image"];
    const brief = params["brief"];
    if (!isNonEmptyString(image))
      return { error: "image is required" };
    if (!isNonEmptyString(brief))
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
  if (!isRecord(parsed)) return null;
  const obj = parsed;
  const winner = Number(obj["winner"]);
  if (winner !== 1 && winner !== 2) return null;
  return { winner, reason: String(obj["reason"] ?? "") };
}

const compareImages: CapabilityExport = {
  spec: compareImagesSpec,
  impl: async (run, params) => {
    const context = run.context;
    const m = parseJudgeModelArgs(params);
    if ("error" in m) return m;
    const images = params["images"];
    const brief = params["brief"];
    if (
      !Array.isArray(images) ||
      images.length < 2 ||
      images.some((i) => !isNonEmptyString(i))
    ) {
      return { error: "images must be an array of 2-8 non-empty strings" };
    }
    if (images.length > MAX_COMPARE_IMAGES) {
      return {
        error: `images must contain at most ${MAX_COMPARE_IMAGES} candidates`
      };
    }
    if (!isNonEmptyString(brief))
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

const scoreImageAdherence: CapabilityExport = {
  spec: scoreImageAdherenceSpec,
  impl: async (run, params) => {
    const context = run.context;
    const m = parseJudgeModelArgs(params);
    if ("error" in m) return m;
    const image = params["image"];
    const brief = params["brief"];
    if (!isNonEmptyString(image))
      return { error: "image is required" };
    if (!isNonEmptyString(brief))
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
        const list = isRecord(parsed) ? parsed["questions"] : parsed;
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
      const rawAnswers: unknown = isRecord(parsed) ? parsed["answers"] : null;
      if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
        return {
          error: `Judge did not return parseable answers: ${answerText.slice(0, 300)}`
        };
      }
      const answers: AdherenceAnswer[] = rawAnswers
        .filter(isObjectLike)
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

// ---------------------------------------------------------------------------
// understand_video
// ---------------------------------------------------------------------------

/**
 * Read a video with a multimodal chat model.
 *
 * The video rides as a `video` content part next to the instruction; the
 * context's media resolver inlines an `asset://` URI and the provider decides
 * whether the bytes go inline or through its files API.
 *
 * A provider with no video content part is not refused here any more: the
 * runtime samples the clip into stills with ffmpeg and sends those. The reply
 * carries `read_as` so the caller knows which of the two it got — a frame read
 * has no audio and nothing between the samples, and an answer that depends on
 * either should be treated as a guess.
 */
const understandVideo: CapabilityExport = {
  spec: understandVideoSpec,
  impl: async (run, params) => {
    const m = parseJudgeModelArgs(params);
    if ("error" in m) return m;
    const video = params["video"];
    if (!isNonEmptyString(video)) {
      return { error: "video is required" };
    }
    const promptParam = params["prompt"];
    const prompt = isNonBlankString(promptParam)
      ? promptParam
      : DEFAULT_VIDEO_PROMPT;
    const requested = Number(params["max_tokens"]);
    const maxTokens =
      Number.isFinite(requested) && requested > 0
        ? Math.min(Math.floor(requested), MAX_UNDERSTAND_VIDEO_TOKENS)
        : DEFAULT_UNDERSTAND_VIDEO_TOKENS;

    try {
      const native = await run.context.providerSupportsVideoInput(m.provider);
      const text = await judgeCall(
        run.context,
        m,
        [textPart(prompt), videoPart(video)],
        maxTokens
      );
      return {
        text,
        provider: m.provider,
        model: m.model,
        read_as: native ? "video" : "sampled_frames"
      };
    } catch (e) {
      return {
        error: `understand_video failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

/**
 * The gated read behind a media reference.
 *
 * The sandbox's own `media.bytes` needs a `ProcessingContext`, which a chat
 * action deliberately runs without (#4780) — so a chat user could generate an
 * image and never read it back. This is the same resolution past the
 * permission gate, with the context the run already carries.
 *
 * A filesystem path is refused rather than contained here: `read_file` is the
 * gated way to a workspace file, and a second containment rule beside
 * `resolveGuestPath` is the thing worth not having.
 */
const readMediaBytes: CapabilityExport = {
  spec: readMediaBytesSpec,
  impl: async (run, params) => {
    const uri = params.uri;
    if (!isNonBlankString(uri)) {
      return { error: "uri is required and must be a non-empty string" };
    }
    const trimmed = uri.trim();
    if (filesystemPathForUri(trimmed) !== null) {
      return {
        error: `read_media_bytes does not read filesystem paths (${trimmed}). Use read_file for a workspace file, or pass an asset:// URI.`
      };
    }
    // A bare id is what an agent reaches for after reading `asset_id` off a
    // generation result; accept it rather than making that a failed round trip.
    const ref = trimmed.includes("://")
      ? { uri: trimmed }
      : { uri: trimmed, asset_id: trimmed };
    try {
      const bytes = await loadMediaRefBytes(ref, run.context);
      if (!bytes) {
        return {
          error: `Could not read ${trimmed}. Pass the asset:// URI a generation returned (its asset_uri), or list_assets to find one.`
        };
      }
      if (bytes.length > MAX_MEDIA_REF_BYTES) {
        return {
          error: `${trimmed} is ${bytes.length} bytes, over the ${MAX_MEDIA_REF_BYTES} byte limit`
        };
      }
      return {
        uri: trimmed,
        size: bytes.length,
        mime_type: mimeForRef(ref, DEFAULT_MIME.document),
        content_base64: encodeMediaBase64(bytes)
      };
    } catch (e) {
      return {
        error: `read_media_bytes failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

/**
 * A real directory a host media binary can run in, plus the workspace it
 * belongs to.
 *
 * A local workspace *is* that directory, so the binary reads and writes the
 * user's files in place. A cloud workspace has no directory, so the run gets a
 * scratch one: inputs named in argv are staged into it beforehand
 * ({@link stageHostBinaryInputs}) and the output is read back out of it
 * afterwards ({@link persistWorkspaceFile}). Either way the binary sees plain
 * paths and needs no knowledge of where the workspace actually lives.
 */
async function hostBinaryRoot(
  context: ProcessingContext
): Promise<{ workspace: Workspace; cwd: string } | { error: string }> {
  const workspace = context.workspace;
  if (!workspace) {
    return { error: "a workspace is required to run a host media binary" };
  }
  try {
    return { workspace, cwd: await workspace.scratchDir() };
  } catch (e) {
    return {
      error: `could not prepare a working directory: ${
        e instanceof Error ? e.message : String(e)
      }`
    };
  }
}

/**
 * Copy every argv path that names an existing workspace file into the scratch
 * directory, so the binary finds its inputs where it expects them.
 *
 * A no-op on a local workspace, where the scratch directory is the workspace.
 * Only whole arguments are staged: an input reaches ffmpeg as its own argv
 * entry (`-i clip.mp4`), and a path buried inside a filter token names an
 * output far more often than an input.
 */
async function stageHostBinaryInputs(
  workspace: Workspace,
  argv: readonly string[]
): Promise<void> {
  if (workspace.localDir) return;
  for (const arg of argv) {
    if (!arg || arg.startsWith("-")) continue;
    try {
      if (await workspace.exists(arg)) await workspace.materialize(arg);
    } catch {
      // Not a workspace path, or not readable — the binary reports it.
    }
  }
}

function stringArgs(raw: unknown): string[] | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "args must be a non-empty array of strings" };
  }
  const args: string[] = [];
  for (const item of raw) {
    if (!isString(item)) {
      return { error: "args must be a non-empty array of strings" };
    }
    args.push(item);
  }
  return args;
}

/**
 * Take what the binary produced and put it in the workspace.
 *
 * The file is on disk either way — in the workspace folder on a local run, in
 * the scratch directory on a cloud one — so it is read from there and written
 * through `persistBinaryOutput`, which stores it in the workspace and (when
 * asked) as an asset.
 */
async function persistWorkspaceFile(
  context: ProcessingContext,
  workspace: Workspace,
  relPath: string
): Promise<Record<string, unknown> | undefined> {
  let abs: string;
  try {
    const root = workspace.localDir ?? (await workspace.scratchDir());
    abs = path.join(root, workspace.key(relPath));
  } catch (e) {
    return { persist_error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const bytes = await readFile(abs);
    const persisted = await persistBinaryOutput(context, bytes, {
      outputFile: relPath,
      contentType: mimeFromFilename(relPath),
      uiPrefix: "media"
    });
    return { ...persisted };
  } catch (e) {
    return { persist_error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * What a refused `://` in ffmpeg argv should do instead. The guard's default
 * says "stage it first" without saying how; here there is a parameter for it.
 */
const FFMPEG_REMEDY =
  'Pass the ref in `inputs` instead — {"clip.mp4": "asset://<id>.mp4"} ' +
  "copies it into the workspace, then name `clip.mp4` in args.";

/** The same remedy for `ffprobe`, whose one path argument replaces argv. */
const FFPROBE_REMEDY =
  'Pass the ref in `inputs` instead — {"clip.mp4": "asset://<id>.mp4"} ' +
  'copies it into the workspace, then set path to "clip.mp4".';

/** Largest single file `ffmpeg`'s `inputs` stages into the workspace. */
const MAX_STAGED_INPUT_BYTES = 100 * 1024 * 1024;
/** Files one `inputs` bag may stage. */
const MAX_STAGED_INPUTS = 8;
/** Bytes one `inputs` bag may stage in total. */
const MAX_STAGED_TOTAL_BYTES = 256 * 1024 * 1024;

/**
 * Copy the refs in `inputs` into the workspace under the names the caller
 * gave them, so argv can name plain local files.
 *
 * ffmpeg opens local files only — a URL or an `asset://` URI in argv is
 * refused, and rightly so. But chat code has no workspace API of its own, so
 * before this there was no way to put an asset where ffmpeg could see it: the
 * capability was on the belt and unusable, and the refusal told the caller to
 * "download first" with nothing to download with. Staging is that missing
 * half, and it changes no boundary — the bytes are resolved host-side by the
 * same resolver `save_asset` uses, and every name still goes through
 * {@link confineArgvToWorkspace}.
 */
async function stageInputs(
  context: ProcessingContext,
  workspace: Workspace,
  cwd: string,
  raw: unknown
): Promise<{ staged: Record<string, number> } | { error: string }> {
  if (raw === undefined || raw === null) return { staged: {} };
  if (!isRecord(raw)) {
    return {
      error:
        'inputs must be an object of {"<workspace-relative name>": "<asset:// URI, /api/storage/ key, or data: URI>"}'
    };
  }
  const entries = Object.entries(raw);
  if (entries.length > MAX_STAGED_INPUTS) {
    return {
      error: `inputs stages at most ${MAX_STAGED_INPUTS} files; ${entries.length} were given.`
    };
  }
  const names = entries.map(([name]) => name);
  const refusal = await confineArgvToWorkspace(names, cwd);
  if (refusal) return refusal;

  const staged: Record<string, number> = {};
  let total = 0;
  for (const [name, ref] of entries) {
    if (!isNonBlankString(name)) {
      return { error: "inputs keys must be non-empty workspace paths." };
    }
    if (!isNonBlankString(ref)) {
      return {
        error: `inputs["${name}"] must be a string ref (asset:// URI, /api/storage/ key, or data: URI).`
      };
    }
    let bytes: Uint8Array | null = null;
    let readError: string | undefined;
    try {
      bytes = await loadMediaRefBytes({ uri: ref.trim() }, context);
    } catch (e) {
      // Keep why. Naming only the accepted forms is useless to a caller who
      // already passed one — an unreachable bucket, a revoked credential and a
      // typo all arrive here, and only the first two are worth retrying. Told
      // just "pass an asset:// URI", a model re-sends the ref it has and then
      // starts guessing at URL shapes.
      readError = e instanceof Error ? e.message : String(e);
    }
    // Zero bytes is a failed read wearing a buffer, the same way it is in
    // `save_asset` — staging it would hand ffmpeg an empty file and the
    // failure would surface as an unhelpable decode error.
    if (!bytes || bytes.byteLength === 0) {
      return {
        error:
          `inputs["${name}"]: could not read ${ref}. ` +
          (readError
            ? `Reading it failed: ${readError}. `
            : "It resolved to no bytes. ") +
          `Accepted: an asset:// URI, the /api/storage/ key a tool returned, ` +
          `or a data: URI.`
      };
    }
    if (bytes.byteLength > MAX_STAGED_INPUT_BYTES) {
      return {
        error: `inputs["${name}"] is ${bytes.byteLength} bytes, over the ${MAX_STAGED_INPUT_BYTES}-byte limit.`
      };
    }
    total += bytes.byteLength;
    if (total > MAX_STAGED_TOTAL_BYTES) {
      return {
        error: `inputs stages ${total} bytes, over the ${MAX_STAGED_TOTAL_BYTES}-byte total limit.`
      };
    }
    // Through the workspace, so the staged input is durable and a cloud run
    // stages at all; then onto disk in `cwd`, because the binary opens a real
    // path. On a local workspace `materialize` hands back the file just
    // written, so this is one write, not two.
    try {
      await workspace.write(name, bytes);
      await workspace.materialize(name);
    } catch (e) {
      return {
        error: `inputs["${name}"] could not be staged: ${
          e instanceof Error ? e.message : String(e)
        }`
      };
    }
    staged[name] = bytes.byteLength;
  }
  return { staged };
}

const ffmpeg: CapabilityExport = {
  spec: ffmpegSpec,
  impl: async (run, params) => {
    const root = await hostBinaryRoot(run.context);
    if ("error" in root) return root;
    const { workspace, cwd } = root;
    const args = stringArgs(params["args"]);
    if ("error" in args) return args;

    const stagedResult = await stageInputs(
      run.context,
      workspace,
      cwd,
      params["inputs"]
    );
    if ("error" in stagedResult) return stagedResult;

    const outputFile = isNonBlankString(params["output_file"])
      ? params["output_file"].trim()
      : "";
    const argv = [...args];
    if (outputFile && !argv.includes(outputFile)) {
      argv.push(outputFile);
    }

    const refusal = await confineArgvToWorkspace(argv, cwd, FFMPEG_REMEDY);
    if (refusal) return refusal;
    const hardened = hardenFfmpegArgv(argv);
    if ("error" in hardened) return hardened;

    const persistTarget =
      outputFile ||
      [...argv].reverse().find((item) => item && !item.startsWith("-")) ||
      "";
    const timeoutMs =
      clampTimeoutSeconds(params["timeout_seconds"], 180, 600) * 1000;
    const runOptions: RunHostBinaryOptions = { cwd, timeoutMs };
    // Only a known output path can be watched for size; without one the
    // wall clock and the capture cap are the run's bounds.
    if (persistTarget) {
      runOptions.artifactPath = persistTarget;
    }
    try {
      await stageHostBinaryInputs(workspace, hardened.argv);
      const result = await runHostBinary("ffmpeg", hardened.argv, runOptions);
      const persisted =
        result.exitCode === 0 && persistTarget
          ? await persistWorkspaceFile(run.context, workspace, persistTarget)
          : undefined;
      const report: Record<string, unknown> = {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exitCode,
        ...(persisted ?? {})
      };
      if (Object.keys(stagedResult.staged).length > 0) {
        report["staged"] = stagedResult.staged;
      }
      return report;
    } catch (e) {
      if (e instanceof HostBinaryMissingError) {
        return { error: e.message };
      }
      return {
        error: `ffmpeg failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

/**
 * What ffprobe reports as numbers, as numbers.
 *
 * ffprobe's JSON is all strings — `"duration": "8.000000"` — so arithmetic on
 * it silently produces `"8.000000".toFixed is not a function`, or worse, a
 * concatenation. The raw payload stays exactly as ffprobe wrote it; this is a
 * second, typed view of the four fields a caller actually plans a cut with.
 */
export function ffprobeSummary(parsed: Record<string, unknown>): Record<
  string,
  unknown
> {
  const format = isObjectLike(parsed["format"]) ? parsed["format"] : {};
  const streams = Array.isArray(parsed["streams"]) ? parsed["streams"] : [];
  const numeric = (value: unknown): number | null => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const ofKind = (kind: string): Record<string, unknown> | undefined =>
    streams.find(
      (s): s is Record<string, unknown> =>
        isObjectLike(s) && s["codec_type"] === kind
    );
  const video = ofKind("video");
  const audio = ofKind("audio");
  const summary: Record<string, unknown> = {
    duration_seconds: numeric(format["duration"]) ?? numeric(video?.["duration"]),
    has_video: video !== undefined,
    has_audio: audio !== undefined
  };
  if (video) {
    summary["width"] = numeric(video["width"]);
    summary["height"] = numeric(video["height"]);
  }
  return summary;
}

/**
 * ffprobe with an argv NodeTool writes, not the caller.
 *
 * Everything a caller can say is one workspace path, so the whole boundary is
 * the confinement check — there is no flag surface to guard, and no way to ask
 * ffprobe to open a socket. `inputs` stages assets under workspace names the
 * same way `ffmpeg`'s does: without it the two halves of one loop disagreed,
 * and a caller who had just staged a clip for ffmpeg could not ask ffprobe how
 * long it was without staging it a second time through a no-op ffmpeg copy.
 */
const ffprobe: CapabilityExport = {
  spec: ffprobeSpec,
  impl: async (run, params) => {
    const root = await hostBinaryRoot(run.context);
    if ("error" in root) return root;
    const { workspace, cwd } = root;
    const target = params["path"];
    if (!isNonBlankString(target)) {
      return { error: "path is required" };
    }
    const stagedResult = await stageInputs(
      run.context,
      workspace,
      cwd,
      params["inputs"]
    );
    if ("error" in stagedResult) return stagedResult;
    const refusal = await confineArgvToWorkspace(
      [target.trim()],
      cwd,
      FFPROBE_REMEDY
    );
    if (refusal) return refusal;
    await stageHostBinaryInputs(workspace, [target.trim()]);

    const timeoutMs =
      clampTimeoutSeconds(params["timeout_seconds"], 30, 120) * 1000;
    try {
      const result = await runHostBinary(
        "ffprobe",
        [
          "-v",
          "error",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          target.trim()
        ],
        { cwd, timeoutMs }
      );
      if (result.exitCode !== 0) {
        return {
          error: `ffprobe failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`
        };
      }
      const parsed: unknown = JSON.parse(result.stdout);
      if (!isObjectLike(parsed)) {
        return { error: "ffprobe returned no readable JSON" };
      }
      const report: Record<string, unknown> = {
        path: target.trim(),
        ...parsed,
        summary: ffprobeSummary(parsed)
      };
      if (Object.keys(stagedResult.staged).length > 0) {
        report["staged"] = stagedResult.staged;
      }
      return report;
    } catch (e) {
      if (e instanceof HostBinaryMissingError) {
        return { error: e.message };
      }
      return {
        error: `ffprobe failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

const DEFAULT_YT_DLP_OUTPUT = "downloads/yt-dlp/%(id)s.%(ext)s";

const ytDlp: CapabilityExport = {
  spec: ytDlpSpec,
  impl: async (run, params) => {
    // The cloud profile leaves this off every belt, so a model never sees it.
    // A host that resolves the capability by name still lands here.
    if (!isYtDlpEnabled()) {
      return { error: "yt_dlp is not available on this deployment" };
    }
    const root = await hostBinaryRoot(run.context);
    if ("error" in root) return root;
    const { workspace, cwd } = root;
    const url = params["url"];
    if (!isNonBlankString(url)) {
      return { error: "url is required" };
    }
    // The downloader opens its own sockets from inside the server, so an
    // http(s) check alone leaves the metadata service and every internal
    // host reachable. Same guard the sandbox fetch bridge uses, plus the
    // resolution step a hostname needs.
    try {
      assertFetchUrlAllowed(url);
      await assertResolvedHostAllowed(url, "yt_dlp");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: message.replace(/^fetch: /, "yt_dlp: ") };
    }

    const outputFile = isNonBlankString(params["output_file"])
      ? params["output_file"].trim()
      : DEFAULT_YT_DLP_OUTPUT;
    const format = isNonBlankString(params["format"])
      ? params["format"].trim()
      : "";
    const timeoutMs =
      clampTimeoutSeconds(params["timeout_seconds"], 300, 900) * 1000;

    // The template is the caller's, so it escapes the workspace as easily as
    // an ffmpeg path does. `format` reaches yt-dlp as a selector, never a path.
    const refusal = await confineArgvToWorkspace([outputFile], cwd);
    if (refusal) return refusal;
    const flagLike =
      refuseFlagLikeValue(outputFile, "output_file") ??
      (format ? refuseFlagLikeValue(format, "format") : undefined);
    if (flagLike) return flagLike;

    const outDir = path.dirname(outputFile);
    if (outDir && outDir !== ".") {
      try {
        await mkdir(path.join(cwd, outDir), { recursive: true });
      } catch (e) {
        return {
          error: `could not create output directory: ${
            e instanceof Error ? e.message : String(e)
          }`
        };
      }
    }

    const download: Parameters<typeof buildYtDlpArgv>[0] = { url, outputFile };
    if (format) {
      download.format = format;
    }
    const argv = buildYtDlpArgv(download);

    try {
      const result = await runHostBinary("yt-dlp", argv, {
        cwd,
        timeoutMs
      });
      const printed = result.stdout.trim().split("\n").filter(Boolean).at(-1);
      // `--print after_move:filepath` names the finished file. Nothing printed
      // on a clean exit means nothing was written — which is what an aborted
      // over-cap download looks like, since `--print` silences the reason.
      if (result.exitCode === 0 && !printed) {
        return {
          success: false,
          url,
          error:
            `yt-dlp wrote no file. The download may have passed the ` +
            `${MAX_DOWNLOAD_BYTES}-byte limit, or the URL carried nothing to ` +
            `download.`,
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: result.exitCode
        };
      }
      const produced =
        printed && !printed.startsWith("http")
          ? path.isAbsolute(printed)
            ? path.relative(cwd, printed)
            : printed
          : outputFile.includes("%(")
            ? ""
            : outputFile;
      const persisted =
        result.exitCode === 0 && produced
          ? await persistWorkspaceFile(run.context, workspace, produced)
          : undefined;
      return {
        success: result.exitCode === 0,
        url,
        output_file: produced || outputFile,
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exitCode,
        ...(persisted ?? {})
      };
    } catch (e) {
      if (e instanceof HostBinaryMissingError) {
        return { error: e.message };
      }
      return {
        error: `yt-dlp failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

/** Every media capability, in the order `getAllMcpTools` offered them. */
export const MEDIA_CAPABILITIES: readonly CapabilityExport[] = [
  generateImage,
  editImage,
  segmentImage,
  generateVideo,
  animateImage,
  generateSpeech,
  generateMusic,
  transcribeAudio,
  embedText,
  readMediaBytes,
  critiqueImage,
  compareImages,
  scoreImageAdherence,
  understandVideo,
  ffmpeg,
  ffprobe,
  ytDlp
];

export const module: CapabilityModule = {
  module: "media",
  exports: MEDIA_CAPABILITIES
};

export {
  generateImage,
  editImage,
  segmentImage,
  generateVideo,
  animateImage,
  generateSpeech,
  generateMusic,
  transcribeAudio,
  embedText,
  readMediaBytes,
  critiqueImage,
  compareImages,
  scoreImageAdherence,
  understandVideo,
  ffmpeg,
  ffprobe,
  ytDlp
};
