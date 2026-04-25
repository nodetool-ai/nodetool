import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProcessingContext } from "@nodetool/runtime";

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

type TransformersModule = {
  pipeline: PipelineFn;
  RawImage?: {
    fromBlob(blob: Blob): Promise<unknown>;
    fromURL(url: string): Promise<unknown>;
  };
  read_audio?: (
    src: string | URL | ArrayBuffer | Float32Array,
    samplingRate: number
  ) => Promise<Float32Array>;
};

let cachedModule: Promise<TransformersModule> | null = null;

/**
 * Lazily import `@huggingface/transformers`. Cached after first load.
 * Throws a clear error if the package is not installed.
 */
export async function loadTransformers(): Promise<TransformersModule> {
  if (!cachedModule) {
    cachedModule = (async () => {
      try {
        // Use a variable so bundlers don't try to resolve at build time.
        const moduleName = "@huggingface/transformers";
        return (await import(moduleName)) as TransformersModule;
      } catch (err) {
        throw new Error(
          "The '@huggingface/transformers' package is required to run " +
            "Transformers.js nodes. Install it with `npm install @huggingface/transformers`. " +
            `Original error: ${(err as Error)?.message ?? err}`
        );
      }
    })();
  }
  return cachedModule;
}

/**
 * Override the loaded transformers module. Intended for tests so they can
 * stub `pipeline`, `RawImage`, and `read_audio` without installing the
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

/** Resolve an audio ref into a Float32Array sampled at the requested rate. */
export async function loadAudioSamples(
  ref: AudioRefLike | undefined,
  samplingRate: number,
  context?: ProcessingContext
): Promise<Float32Array> {
  const bytes = await loadMediaBytes(ref, context);
  if (!bytes.length) {
    throw new Error("Audio input is empty");
  }
  const transformers = await loadTransformers();
  if (!transformers.read_audio) {
    throw new Error(
      "Transformers.js does not expose read_audio; cannot decode audio input."
    );
  }
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return transformers.read_audio(ab, samplingRate);
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
