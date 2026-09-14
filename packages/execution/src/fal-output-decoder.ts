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

/**
 * Field names that carry a media URL inside one fal envelope. These are the
 * same names the live provider extractors read (`extractImageUrls`,
 * `extractVideoUrl`, `extractAudioUrl` in `@nodetool-ai/runtime`), so a
 * response shape the live path saves is also a media output during recovery.
 * `packages/execution/tests/fal-media-shape-parity.test.ts` holds them level.
 */
export const FAL_MEDIA_URL_FIELDS = [
  "url",
  "uri",
  "image",
  "image_url",
  "video",
  "video_url",
  "audio",
  "audio_url"
] as const;

function mediaUrl(value: Record<string, unknown>): string | null {
  for (const field of FAL_MEDIA_URL_FIELDS) {
    const candidate = value[field];
    if (isUrl(candidate)) return candidate;
  }
  return null;
}

function descriptor(
  outputKey: string,
  outputIndex: number,
  outputType: "media" | "structured",
  value: Record<string, unknown>
): FalOutputDescriptor {
  return {
    outputKey,
    outputIndex,
    outputType,
    providerRef: mediaUrl(value),
    rawResult: value
  };
}

/** Keys whose value is a media envelope, or an array of them. */
export const FAL_MEDIA_ENVELOPE_KEYS = [
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
] as const;

/** Keys whose value is a bare media URL, or an array of them. */
export const FAL_MEDIA_URL_ALIAS_KEYS = [
  "image_url",
  "image_urls",
  "video_url",
  "video_urls",
  "audio_url",
  "audio_urls"
] as const;

const FAL_MEDIA_KEYS = new Set<string>([
  ...FAL_MEDIA_ENVELOPE_KEYS,
  ...FAL_MEDIA_URL_ALIAS_KEYS
]);

/**
 * Decode common fal image/video/audio/file envelopes without throwing away
 * structured fields. Unknown objects remain one structured output. Arrays are
 * addressed by index, which keeps retries idempotent and preserves every file.
 */
export function decodeFalOutputs(
  payload: Record<string, unknown>
): FalOutputDescriptor[] {
  const outputs: FalOutputDescriptor[] = [];
  const seen = new Set<string>();
  const add = (
    key: string,
    value: unknown,
    index = 0,
    dedupe = false
  ): void => {
    if (isRecord(value)) {
      const url = mediaUrl(value);
      if (url && dedupe && seen.has(url)) return;
      if (url) seen.add(url);
      outputs.push(descriptor(key, index, url ? "media" : "structured", value));
      return;
    }
    if (isUrl(value)) {
      if (dedupe && seen.has(value)) return;
      seen.add(value);
      outputs.push(descriptor(key, index, "media", { url: value }));
    }
  };
  const collect = (keys: readonly string[], dedupe: boolean): void => {
    for (const key of keys) {
      const value = payload[key];
      if (Array.isArray(value)) {
        value.forEach((item, index) => add(key, item, index, dedupe));
      } else if (value !== undefined) {
        add(key, value, 0, dedupe);
      }
    }
  };

  collect(FAL_MEDIA_ENVELOPE_KEYS, false);
  // The flat aliases name the same file as the envelope above them, so a
  // payload carrying both must not be downloaded and billed as two assets.
  collect(FAL_MEDIA_URL_ALIAS_KEYS, true);

  if (outputs.length > 0) {
    const structured = Object.fromEntries(
      Object.entries(payload).filter(([key]) => !FAL_MEDIA_KEYS.has(key))
    );
    if (Object.keys(structured).length > 0) {
      outputs.push(descriptor("structured", 0, "structured", structured));
    }
    return outputs;
  }
  return [
    descriptor("result", 0, mediaUrl(payload) ? "media" : "structured", payload)
  ];
}
