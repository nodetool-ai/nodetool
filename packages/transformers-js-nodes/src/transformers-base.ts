import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { getDefaultTransformersJsCacheDir } from "@nodetool-ai/config";
import type { ProcessingContext } from "@nodetool-ai/runtime";

const execFileP = promisify(execFile);

/**
 * Shared helpers for Transformers.js nodes.
 *
 * The `@huggingface/transformers` package is loaded lazily so the rest of the
 * package can be imported, type-checked and registered even when the optional
 * runtime dependency is not installed (the `pipeline()` call will throw a
 * descriptive error at execution time instead).
 */

type PipelineFn = (
  task: string,
  model?: string,
  options?: Record<string, unknown>
) => Promise<unknown>;

type TransformersEnv = {
  cacheDir?: string;
  allowRemoteModels?: boolean;
  allowLocalModels?: boolean;
};

type TransformersModule = {
  pipeline: PipelineFn;
  env?: TransformersEnv;
  RawImage?: {
    fromBlob(blob: Blob): Promise<unknown>;
    fromURL(url: string): Promise<unknown>;
  };
  TextStreamer?: new (
    tokenizer: unknown,
    options?: {
      skip_prompt?: boolean;
      skip_special_tokens?: boolean;
      callback_function?: (text: string) => void;
      token_callback_function?: (tokens: unknown) => void;
    }
  ) => unknown;
  InterruptableStoppingCriteria?: new () => {
    interrupt(): void;
  };
};

let cachedModule: Promise<TransformersModule> | null = null;
let cacheDirOverride: string | null = null;

/**
 * Override the Transformers.js cache directory at runtime. Pass `null` to
 * revert to the default resolved by `getDefaultTransformersJsCacheDir()`.
 *
 * Must be called before the first `loadTransformers()` to take effect, since
 * `env.cacheDir` is set on the singleton module on first import.
 */
export function setTransformersJsCacheDir(dir: string | null): void {
  cacheDirOverride = dir;
}

/** Resolve the cache directory: explicit override → env var → data-dir default. */
export function getTransformersJsCacheDir(): string {
  return cacheDirOverride ?? getDefaultTransformersJsCacheDir();
}

/**
 * Lazily import `@huggingface/transformers`. Cached after first load.
 *
 * On first load we point `env.cacheDir` at the resolved Nodetool cache
 * directory (default: `<data-dir>/transformers-js-cache`) and ensure the
 * directory exists. This keeps downloaded ONNX models in a predictable,
 * persistent location instead of a transient `./.cache` next to cwd.
 *
 * Throws a clear error if the package is not installed.
 */
export async function loadTransformers(): Promise<TransformersModule> {
  if (!cachedModule) {
    cachedModule = (async () => {
      let mod: TransformersModule;
      try {
        // Use a variable so bundlers don't try to resolve at build time.
        const moduleName = "@huggingface/transformers";
        mod = (await import(moduleName)) as TransformersModule;
      } catch (err) {
        throw new Error(
          "The '@huggingface/transformers' package is required to run " +
            "Transformers.js nodes. Install it with `npm install @huggingface/transformers`. " +
            `Original error: ${(err as Error)?.message ?? err}`
        );
      }

      const cacheDir = getTransformersJsCacheDir();
      try {
        await fs.mkdir(cacheDir, { recursive: true });
      } catch {
        // Permissions/IO failures here are non-fatal — Transformers.js will
        // surface a clearer error on the first download attempt.
      }
      if (mod.env) {
        mod.env.cacheDir = cacheDir;
        mod.env.allowRemoteModels = true;
        mod.env.allowLocalModels = true;
      }

      return mod;
    })();
  }
  return cachedModule;
}

/**
 * Override the loaded transformers module. Intended for tests so they can
 * stub `pipeline` and `RawImage` without installing the
 * heavyweight optional dependency.
 */
export function __setTransformersModuleForTesting(
  fake: TransformersModule | null
): void {
  cachedModule = fake ? Promise.resolve(fake) : null;
  pipelineCache.clear();
}

type PipelineCacheKey = string;
const pipelineCache = new Map<PipelineCacheKey, Promise<unknown>>();

export interface PipelineOptions {
  task: string;
  model?: string;
  dtype?: string;
  device?: string;
  revision?: string;
}

/**
 * Build (or reuse) a Transformers.js pipeline for the given task/model.
 *
 * Pipelines are cached globally by their (task, model, dtype, device, revision)
 * tuple. Loading large models is expensive, so reusing pipelines across
 * invocations is essential for sensible performance.
 */
export async function getPipeline(options: PipelineOptions): Promise<unknown> {
  const { task, model, dtype, device, revision } = options;
  const key: PipelineCacheKey = JSON.stringify([
    task,
    model ?? null,
    dtype ?? null,
    device ?? null,
    revision ?? null
  ]);
  let entry = pipelineCache.get(key);
  if (!entry) {
    entry = (async () => {
      const transformers = await loadTransformers();
      const pipelineOptions: Record<string, unknown> = {};
      if (dtype) pipelineOptions.dtype = dtype;
      if (device) pipelineOptions.device = device;
      if (revision) pipelineOptions.revision = revision;
      return transformers.pipeline(task, model, pipelineOptions);
    })();
    pipelineCache.set(key, entry);
    // Drop failed entries so a later invocation can retry.
    entry.catch(() => pipelineCache.delete(key));
  }
  return entry;
}

/** Reset the pipeline cache. Intended for tests. */
export function clearPipelineCache(): void {
  pipelineCache.clear();
}

// ---------------------------------------------------------------------------
// Common option lists
// ---------------------------------------------------------------------------

export const DTYPE_VALUES = [
  "auto",
  "fp32",
  "fp16",
  "q8",
  "int8",
  "uint8",
  "q4",
  "bnb4",
  "q4f16"
];

export const DEVICE_VALUES = ["auto", "cpu", "wasm", "webgpu", "cuda", "dml"];

/**
 * Translate the user-facing "auto" placeholder into `undefined` so we keep
 * Transformers.js' own default selection logic.
 */
export function normalizeOption(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  if (!str || str === "auto") return undefined;
  return str;
}

// ---------------------------------------------------------------------------
// Media reference helpers
// ---------------------------------------------------------------------------

export type ImageRefLike = {
  uri?: string;
  data?: Uint8Array | string;
  mimeType?: string;
};

export type AudioRefLike = {
  uri?: string;
  data?: Uint8Array | string;
  mimeType?: string;
};

function decodeBase64Data(data: Uint8Array | string | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  return Uint8Array.from(Buffer.from(data, "base64"));
}

function uriToFilePath(uri: string): string {
  if (uri.startsWith("file://")) {
    try {
      return fileURLToPath(new URL(uri));
    } catch {
      return uri.slice("file://".length);
    }
  }
  return uri;
}

/**
 * Resolve a media ref to raw bytes, consulting (in order):
 * 1. inline `data` (base64 string or Uint8Array)
 * 2. `context.storage` for opaque URIs managed by the runtime
 * 3. `file://` URIs read from disk
 * 4. `http(s)://` URIs fetched over the network
 * 5. `data:` URIs (base64 inline)
 */
export async function loadMediaBytes(
  ref: ImageRefLike | AudioRefLike | undefined,
  context?: ProcessingContext
): Promise<Uint8Array> {
  if (!ref || typeof ref !== "object") return new Uint8Array();
  if (ref.data) return decodeBase64Data(ref.data);
  const uri = typeof ref.uri === "string" ? ref.uri : "";
  if (!uri) return new Uint8Array();

  if (context?.storage) {
    const stored = await context.storage.retrieve(uri);
    if (stored !== null && stored !== undefined) {
      return new Uint8Array(stored);
    }
  }

  if (uri.startsWith("file://")) {
    return new Uint8Array(await fs.readFile(uriToFilePath(uri)));
  }
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${uri}: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  if (uri.startsWith("data:")) {
    const payload = uri.split(",", 2)[1] ?? "";
    return Uint8Array.from(Buffer.from(payload, "base64"));
  }
  return new Uint8Array();
}

/** Convert raw image bytes into a Transformers.js RawImage instance. */
export async function bytesToRawImage(
  bytes: Uint8Array,
  mimeType?: string
): Promise<unknown> {
  if (!bytes.length) {
    throw new Error("Image input is empty");
  }
  const transformers = await loadTransformers();
  if (!transformers.RawImage) {
    throw new Error(
      "Transformers.js does not expose RawImage; cannot decode image input."
    );
  }
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: mimeType ?? "application/octet-stream" });
  return transformers.RawImage.fromBlob(blob);
}

/** Resolve an image ref into a RawImage suitable for pipelines. */
export async function loadRawImage(
  ref: ImageRefLike | undefined,
  context?: ProcessingContext
): Promise<unknown> {
  const bytes = await loadMediaBytes(ref, context);
  return bytesToRawImage(bytes, ref?.mimeType);
}

/**
 * Parse 16-bit / 8-bit PCM WAV bytes into Float32 samples + metadata.
 *
 * Mirrors `parseWavBytes` in `@nodetool-ai/base-nodes` (`src/lib/audio-wav.ts`)
 * so behavior stays consistent with the rest of the audio stack. Inlined
 * here so this package does not have to take a runtime dependency on the
 * much larger base-nodes pack just for a WAV decoder; if the canonical
 * decoder ever changes, update both.
 */
function parseWavBytes(bytes: Uint8Array): {
  samples: Float32Array;
  sampleRate: number;
  numChannels: number;
} | null {
  if (bytes.length < 44) return null;
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return null;
  }

  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const numChannels = buf.readUInt16LE(22);

  let dataOffset = 36;
  while (dataOffset < buf.length - 8) {
    const chunkId = buf.toString("ascii", dataOffset, dataOffset + 4);
    const chunkSize = buf.readUInt32LE(dataOffset + 4);
    if (chunkId === "data") {
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  const bytesPerSample = bitsPerSample / 8;
  if (bytesPerSample !== 1 && bytesPerSample !== 2) return null;
  const totalSamples = Math.floor((buf.length - dataOffset) / bytesPerSample);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const pos = dataOffset + i * bytesPerSample;
    if (bitsPerSample === 16) {
      samples[i] = buf.readInt16LE(pos) / 0x7fff;
    } else if (bitsPerSample === 8) {
      samples[i] = (buf.readUInt8(pos) - 128) / 128;
    }
  }
  return { samples, sampleRate, numChannels };
}

/** Mix interleaved multi-channel samples down to mono by averaging channels. */
function mixToMono(
  interleaved: Float32Array,
  numChannels: number
): Float32Array {
  if (numChannels <= 1) return interleaved;
  const frames = Math.floor(interleaved.length / numChannels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < numChannels; c++) {
      sum += interleaved[i * numChannels + c];
    }
    mono[i] = sum / numChannels;
  }
  return mono;
}

/**
 * Linear resample mono Float32 samples to a target rate. Good enough for
 * speech models — Whisper expects 16 kHz mono Float32 and the linear
 * interpolation artifact is negligible at that target.
 */
function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = src - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

/**
 * Convert arbitrary audio bytes (mp3 / m4a / flac / ogg / etc.) to a mono
 * 16-bit PCM WAV at the requested sample rate by shelling out to ffmpeg.
 *
 * `ffmpeg` is one of the runtime tools managed by Nodetool's Package
 * Manager (alongside yt-dlp, pandoc) and is also a hard requirement for
 * the existing video / TTS nodes in `@nodetool-ai/base-nodes`, so it is
 * effectively guaranteed to be on PATH in any environment that runs media
 * workflows. When it is not available we throw a clear error pointing the
 * user at the WAV-only fallback so they know how to recover.
 */
async function ffmpegToWav(
  bytes: Uint8Array,
  targetSampleRate: number
): Promise<Uint8Array> {
  const dir = await fs.mkdtemp(joinPath(tmpdir(), "nodetool-tjs-audio-"));
  const inPath = joinPath(dir, "input.bin");
  const outPath = joinPath(dir, "output.wav");
  try {
    await fs.writeFile(inPath, bytes);
    await execFileP(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        inPath,
        "-ac",
        "1", // mono
        "-ar",
        String(targetSampleRate),
        "-c:a",
        "pcm_s16le", // 16-bit PCM
        "-f",
        "wav",
        outPath
      ],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    return new Uint8Array(await fs.readFile(outPath));
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e?.code === "ENOENT") {
      throw new Error(
        "Audio decode failed: input is not WAV and `ffmpeg` is not on PATH. " +
          "Install ffmpeg (the Package Manager UI can do this for you) or " +
          "convert the audio to WAV (PCM 8/16-bit) before feeding it to a " +
          "Transformers.js audio node."
      );
    }
    const stderr = e?.stderr ? `: ${e.stderr.trim()}` : "";
    throw new Error(`ffmpeg failed to decode audio${stderr}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * Resolve an audio ref into a mono Float32Array sampled at the requested
 * rate.
 *
 * Transformers.js's own `read_audio()` helper requires the browser
 * `AudioContext` API and does not work in Node, even when passed an
 * ArrayBuffer (it ends up calling `decodeAudioData`). The official guidance
 * is to decode audio externally and feed the pipeline a Float32Array
 * directly:
 *   https://huggingface.co/docs/transformers.js/guides/node-audio-processing
 *
 * Decode strategy:
 *   1. Fast path — if the bytes are already a WAV (PCM 8/16-bit), parse
 *      them in-process. No subprocess overhead.
 *   2. Fallback — for any other format (mp3 / m4a / flac / ogg / etc.)
 *      shell out to ffmpeg to convert to mono 16-bit WAV at the target
 *      rate, then parse the result. Letting ffmpeg do the resampling
 *      avoids a second pass and gives much better quality than the linear
 *      resampler used for the in-process WAV path.
 */
export async function loadAudioSamples(
  ref: AudioRefLike | undefined,
  samplingRate: number,
  context?: ProcessingContext
): Promise<Float32Array> {
  const bytes = await loadMediaBytes(ref, context);
  if (!bytes.length) {
    throw new Error("Audio input is empty");
  }

  let wav = parseWavBytes(bytes);
  if (!wav) {
    const converted = await ffmpegToWav(bytes, samplingRate);
    wav = parseWavBytes(converted);
    if (!wav) {
      // ffmpeg succeeded but produced something we can't parse — should
      // not happen with the explicit `-f wav -c:a pcm_s16le` flags above.
      throw new Error("ffmpeg produced unparseable WAV output");
    }
  }

  const mono = mixToMono(wav.samples, wav.numChannels);
  return resampleLinear(mono, wav.sampleRate, samplingRate);
}

// ---------------------------------------------------------------------------
// Output normalization helpers
// ---------------------------------------------------------------------------

export function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function asString(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

// ---------------------------------------------------------------------------
// Hugging Face model ref helpers
// ---------------------------------------------------------------------------

/**
 * Shape of an `hf.*` typed model value as produced by the web Hugging Face
 * model picker. The picker emits an object; legacy graphs may still hold a
 * plain string repo id, so we accept both.
 */
export type HfModelRef = {
  type?: string;
  repo_id?: string;
  path?: string | null;
  variant?: string | null;
  allow_patterns?: string[] | null;
  ignore_patterns?: string[] | null;
};

/**
 * Extract a Hugging Face repo id from a property value. Accepts either the
 * object emitted by the model picker (`{ repo_id, ... }`) or a bare string
 * for backwards compatibility with graphs that predate the picker.
 */
export function extractRepoId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const ref = value as HfModelRef;
    if (typeof ref.repo_id === "string") return ref.repo_id;
  }
  return "";
}

/**
 * Build a default value for a `tjs.<task>` typed `model` prop. The web UI
 * uses the `type` discriminator to render the matching model picker.
 */
export function tjsModelDefault(
  type: string,
  repoId: string
): Required<Pick<HfModelRef, "type" | "repo_id">> &
  Pick<HfModelRef, "path" | "variant" | "allow_patterns" | "ignore_patterns"> {
  return {
    type,
    repo_id: repoId,
    path: null,
    variant: null,
    allow_patterns: null,
    ignore_patterns: null
  };
}
