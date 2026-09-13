import { createHash } from "node:crypto";

/**
 * The subset of a fal result needed by the durable finalizer. The path is
 * stable for a given model result, so it is also suitable for output identity
 * and deterministic retry/storage keys.
 */
export interface FalOutputDescriptor {
  readonly outputKey: string;
  readonly outputIndex: number;
  readonly outputType: "media" | "structured";
  readonly providerRef: string | null;
  readonly rawResult: Record<string, unknown>;
  readonly storageKey?: string;
  readonly existingStorageKey?: string | null;
  readonly existingAssetId?: string | null;
}

/** Stable object-store locator for one output identity. */
export function deterministicFalStorageKey(
  generationId: string,
  attemptId: string,
  outputKey: string,
  outputIndex: number,
  extension = "bin"
): string {
  const identity = `${generationId}:${attemptId}:${outputKey}:${outputIndex}`;
  const digest = createHash("sha256").update(identity).digest("hex");
  const safeExtension =
    extension.replace(/[^a-z0-9]/giu, "").toLowerCase() || "bin";
  return `generations/${generationId}/${digest}.${safeExtension}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//u.test(value);
}

function mediaType(value: Record<string, unknown>): boolean {
  return (
    isUrl(value.url) ||
    isUrl(value.uri) ||
    isUrl(value.video) ||
    isUrl(value.audio)
  );
}

function descriptor(
  outputKey: string,
  outputIndex: number,
  outputType: "media" | "structured",
  value: Record<string, unknown>
): FalOutputDescriptor {
  const providerRef =
    [value.url, value.uri, value.video, value.audio].find(isUrl) ?? null;
  return { outputKey, outputIndex, outputType, providerRef, rawResult: value };
}

/**
 * Decode common fal image/video/audio/file envelopes without throwing away
 * structured fields. Unknown objects remain one structured output. Arrays are
 * addressed by index, which keeps retries idempotent and preserves every file.
 */
export function decodeFalOutputs(
  payload: Record<string, unknown>
): FalOutputDescriptor[] {
  const outputs: FalOutputDescriptor[] = [];
  const add = (key: string, value: unknown, index = 0): void => {
    if (isRecord(value)) {
      outputs.push(
        descriptor(key, index, mediaType(value) ? "media" : "structured", value)
      );
      return;
    }
    if (isUrl(value)) {
      outputs.push(descriptor(key, index, "media", { url: value }));
    }
  };

  const mediaKeys = [
    "image",
    "images",
    "video",
    "videos",
    "audio",
    "audio_file",
    "file",
    "files",
    "model_mesh",
    "model_glb",
    "mesh",
    "outputs",
    "results"
  ];
  for (const key of mediaKeys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      value.forEach((item, index) => add(key, item, index));
    } else if (value !== undefined) {
      add(key, value);
    }
  }

  if (outputs.length > 0) {
    const structured = Object.fromEntries(
      Object.entries(payload).filter(([key]) => !mediaKeys.includes(key))
    );
    if (Object.keys(structured).length > 0) {
      outputs.push(descriptor("structured", 0, "structured", structured));
    }
    return outputs;
  }
  return [
    descriptor(
      "result",
      0,
      mediaType(payload) ? "media" : "structured",
      payload
    )
  ];
}
