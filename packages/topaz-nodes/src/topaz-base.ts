/**
 * Topaz request building and result mapping for the node pack.
 *
 * The wire flow lives in `TopazProvider` (`packages/runtime`), which the nodes
 * reach through `context.callProviderEndpoint`:
 *  - Image: the multipart fields and the image bytes go in the endpoint input,
 *    and the output is the download lookup body (`{ download_url, ... }`).
 *  - Video: the create body (`source`, `output`, `filters`) and the source
 *    bytes go in the input, and the output is the final status body, whose
 *    signed result URL lives at `download.url`.
 *
 * The video source metadata Topaz requires at job creation is probed here, in
 * process.
 */

import { imageRefFromBytes, loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { MediaRefValue, ProcessingContext } from "@nodetool-ai/runtime";
import { packetTimes, probeMedia } from "@nodetool-ai/runtime/media";

const TOPAZ_PROVIDER = "topaz";


export type TopazVideoKind = "upscale" | "interpolate";

/** The manifest model a node runs, and the node id its generation record names. */
export interface TopazJob {
  modelId: string;
  nodeId?: string;
}

export interface TopazVideoJob extends TopazJob {
  videoKind: TopazVideoKind;
}

export interface TopazVideoMetadata {
  resolution: { width: number; height: number };
  container: string;
  size: number;
  duration: number;
  frameRate: number;
  frameCount: number;
}

/**
 * Derive the source container (file extension, no leading dot) from a VideoRef.
 * Prefers an explicit `format` field, then the URI extension, then `mp4`.
 */
export function sourceContainerFromRef(ref: unknown): string {
  if (!ref || typeof ref !== "object") return "mp4";
  const r = ref as { format?: string | null; uri?: string };
  if (r.format) return r.format.replace(/^\./, "").toLowerCase();
  if (r.uri) {
    const m = r.uri.match(/\.(mp4|m4v|mov|mkv|webm|avi)(?:[?#]|$)/i);
    if (m) return m[1].toLowerCase();
  }
  return "mp4";
}

/**
 * Resolve an asset ref to raw bytes. Delegates to the canonical
 * {@link loadMediaRefBytes}, which — unlike the copy this replaced — checks
 * `data.length > 0` rather than bare truthiness (a zero-length `Uint8Array` is
 * truthy and shadowed a perfectly good `uri`) and resolves an `asset_id`-only
 * ref. Throws rather than returning null: every caller here needs the bytes.
 */
export async function refToBytes(
  ref: unknown,
  context?: ProcessingContext
): Promise<Uint8Array> {
  if (!ref || typeof ref !== "object") {
    throw new Error("Asset is required");
  }
  const bytes = await loadMediaRefBytes(ref as MediaRefValue, context);
  if (!bytes) throw new Error("Asset has no data or URI");
  return bytes;
}

/** Image result → ImageRef (with sharp metadata when available). */
export const topazImageRef = imageRefFromBytes;

export async function probeVideoMetadata(
  bytes: Uint8Array,
  container = "mp4"
): Promise<TopazVideoMetadata> {
  let probe: Awaited<ReturnType<typeof probeMedia>>;
  try {
    probe = await probeMedia(bytes);
  } catch (err) {
    throw new Error(`Failed to probe video metadata: ${String(err)}`);
  }
  const video = probe.video;
  if (!video || !video.width || !video.height) {
    throw new Error("The probe found no video stream with dimensions");
  }
  const duration = probe.durationSec ?? 0;
  const frameRate = video.averageFps;
  const frameCount = (await packetTimes(bytes))?.length || Math.round(duration * frameRate);
  return {
    resolution: { width: video.width, height: video.height },
    container,
    size: bytes.byteLength,
    duration,
    frameRate,
    frameCount
  };
}

/**
 * The multipart fields an image endpoint is sent. Empty values are left out,
 * and 0 for output_width/output_height means "infer from the other
 * dimension", so it is left out too.
 */
export function topazImageFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined || v === "") continue;
    if ((k === "output_width" || k === "output_height") && v === 0) continue;
    out[k] = v;
  }
  return out;
}

async function downloadResult(
  context: ProcessingContext,
  url: string
): Promise<Uint8Array> {
  return context.downloadProviderMedia({ provider: TOPAZ_PROVIDER, url });
}

export async function topazExecuteImageTask(
  context: ProcessingContext,
  job: TopazJob,
  fields: Record<string, unknown>,
  imageBytes: Uint8Array
): Promise<Uint8Array> {
  const call: Parameters<ProcessingContext["callProviderEndpoint"]>[0] = {
    provider: TOPAZ_PROVIDER,
    capability: "upscale_image",
    model: job.modelId,
    route: "image",
    input: { image: imageBytes, ...topazImageFields(fields) }
  };
  if (job.nodeId) call.nodeId = job.nodeId;
  const { output } = await context.callProviderEndpoint(call);
  // Spec: { download_url, head_url, expiry }.
  const lookup = (output ?? {}) as Record<string, unknown>;
  const finalUrl = (lookup.download_url ?? lookup.url) as string | undefined;
  if (!finalUrl) {
    throw new Error(`No download URL in response: ${JSON.stringify(lookup)}`);
  }
  return downloadResult(context, finalUrl);
}

const INTERPOLATION_MODELS = new Set([
  "apf-2",
  "apo-8",
  "chf-3",
  "chr-2",
  "aion-1"
]);

const AUDIO_MODE_MAP: Record<
  string,
  { audioTransfer: "Copy" | "Convert" | "None"; audioCodec?: "AAC" | "AC3" | "PCM" }
> = {
  copy: { audioTransfer: "Copy", audioCodec: "AAC" },
  aac: { audioTransfer: "Convert", audioCodec: "AAC" },
  ac3: { audioTransfer: "Convert", audioCodec: "AC3" },
  pcm: { audioTransfer: "Convert", audioCodec: "PCM" },
  none: { audioTransfer: "None" }
};

function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function buildUpscaleFilter(
  fields: Record<string, unknown>
) {
  const filter: Record<string, unknown> = { model: String(fields.model) };
  if (fields.video_type) filter.videoType = String(fields.video_type);
  if (fields.auto) filter.auto = String(fields.auto);
  // Manual-mode tuning. The API ignores out-of-range or unsupported values
  // for a given model — the swagger says these are the documented controls.
  const numericMap = {
    compression: "compression",
    details: "details",
    noise: "noise",
    halo: "halo",
    blur: "blur",
    recover_original_detail: "recoverOriginalDetailValue"
  } satisfies Record<string, string>;
  for (const [src, dst] of Object.entries(numericMap)) {
    const v = num(fields[src]);
    if (v !== undefined && v !== 0) filter[dst] = v;
  }
  return filter;
}

function buildInterpolationFilter(
  fields: Record<string, unknown>
) {
  const filter: Record<string, unknown> = { model: String(fields.model) };
  const slowmo = num(fields.slowmo);
  if (slowmo !== undefined && slowmo !== 1) filter.slowmo = slowmo;
  const fps = num(fields.fps);
  if (fps !== undefined && fps > 0) filter.fps = fps;
  if (fields.duplicate) filter.duplicate = true;
  const threshold = num(fields.duplicate_threshold);
  if (threshold !== undefined && fields.duplicate) {
    filter.duplicateThreshold = threshold;
  }
  return filter;
}

function buildVideoFilters(
  videoKind: TopazVideoKind,
  fields: Record<string, unknown>
): Array<Record<string, unknown>> {
  if (videoKind === "interpolate") {
    return [buildInterpolationFilter(fields)];
  }
  // Default to upscale when the model code is a known upscale model.
  if (INTERPOLATION_MODELS.has(String(fields.model))) {
    // Caller wired a frame-interpolation model into the Enhance node. Build
    // the appropriate filter so the API call still succeeds.
    return [buildInterpolationFilter(fields)];
  }
  return [buildUpscaleFilter(fields)];
}

function buildVideoOutput(
  fields: Record<string, unknown>,
  sourceMeta: TopazVideoMetadata
) {
  const audioMode = String(fields.audio_mode ?? "copy").toLowerCase();
  const audio = AUDIO_MODE_MAP[audioMode] ?? AUDIO_MODE_MAP.copy;

  const output: Record<string, unknown> = {
    resolution: {
      width: num(fields.output_width) || sourceMeta.resolution.width,
      height: num(fields.output_height) || sourceMeta.resolution.height
    },
    frameRate: num(fields.output_frame_rate) || sourceMeta.frameRate,
    container: String(fields.output_container ?? "mp4"),
    videoEncoder: String(fields.video_encoder ?? "H264"),
    // One of dynamicCompressionLevel or videoBitrate is required.
    dynamicCompressionLevel: String(fields.dynamic_compression_level ?? "Mid"),
    audioTransfer: audio.audioTransfer
  };
  if (audio.audioCodec) output.audioCodec = audio.audioCodec;
  if (fields.crop_to_fit) output.cropToFit = true;
  return output;
}

/** The create-request body for a video endpoint: `{ source, output, filters }`. */
export function topazVideoCreateBody(
  videoKind: TopazVideoKind,
  fields: Record<string, unknown>,
  sourceMeta: TopazVideoMetadata
): Record<string, unknown> {
  return {
    source: sourceMeta,
    output: buildVideoOutput(fields, sourceMeta),
    filters: buildVideoFilters(videoKind, fields)
  };
}

export async function topazExecuteVideoTask(
  context: ProcessingContext,
  job: TopazVideoJob,
  fields: Record<string, unknown>,
  videoBytes: Uint8Array,
  sourceMeta: TopazVideoMetadata
): Promise<Uint8Array> {
  const call: Parameters<ProcessingContext["callProviderEndpoint"]>[0] = {
    provider: TOPAZ_PROVIDER,
    capability: job.videoKind === "interpolate" ? "interpolate_video" : "upscale_video",
    model: job.modelId,
    route: "video",
    input: { ...topazVideoCreateBody(job.videoKind, fields, sourceMeta), video: videoBytes }
  };
  if (job.nodeId) call.nodeId = job.nodeId;
  const { output } = await context.callProviderEndpoint(call);
  // Spec: { download: { url, expiresIn, expiresAt } }.
  const final = (output ?? {}) as Record<string, unknown>;
  const download = (final.download ?? {}) as Record<string, unknown>;
  const downloadUrl = (download.url ??
    final.downloadUrl ??
    final.download_url ??
    final.url) as string | undefined;
  if (!downloadUrl) {
    throw new Error(
      `No download URL in final status: ${JSON.stringify(final)}`
    );
  }
  return downloadResult(context, downloadUrl);
}
