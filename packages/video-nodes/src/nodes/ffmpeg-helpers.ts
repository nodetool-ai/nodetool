/**
 * Shared media helpers for the video nodes.
 *
 * Internal to the package — deliberately NOT re-exported from `src/index.ts`.
 * Everything here is free of node-specific state so `timeline.ts` can import
 * it directly.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { VideoRef } from "@nodetool-ai/node-sdk";
import { packetTimes, probeMedia } from "@nodetool-ai/runtime/media";
import {
  isNonEmptyString,
  isObjectLike,
  isString
} from "@nodetool-ai/node-sdk";

/** Build a VideoRef from raw bytes (raw base64 `data`, `type: "video"`). */
export function videoRef(
  data: Uint8Array,
  extras: Partial<VideoRef> = {}
): VideoRef {
  return {
    type: "video",
    data: Buffer.from(data).toString("base64"),
    ...extras
  };
}

/** A fresh empty VideoRef prop default. Each call returns its own object. */
export function defaultVideoRef(): VideoRef {
  return {
    type: "video",
    uri: "",
    asset_id: null,
    data: null,
    metadata: null,
    duration: null,
    format: null
  };
}

/** Resolve a `file://` URI (or plain path) to a filesystem path. */
export function filePath(uriOrPath: string): string {
  if (uriOrPath.startsWith("file://")) {
    try {
      return fileURLToPath(new URL(uriOrPath));
    } catch {
      // Fallback for non-standard URIs like file://C:\path
      return uriOrPath.slice("file://".length);
    }
  }
  return uriOrPath;
}

/**
 * Resolve a folder value to a filesystem path. Accepts a plain string path/URI
 * or a folder ref object (`{ uri }`); returns "" when no usable path is present.
 */
export function folderPath(raw: unknown): string {
  if (isString(raw)) {
    return raw.startsWith("file:") ? filePath(raw) : raw;
  }
  if (isObjectLike(raw)) {
    const uri = (raw as Record<string, unknown>).uri;
    if (isNonEmptyString(uri)) return filePath(uri);
  }
  return "";
}

/** Expand %Y/%m/%d/%H/%M/%S date tokens in a filename. */
export function dateName(name: string): string {
  const now = new Date();
  const pad = (v: number): string => String(v).padStart(2, "0");
  return name
    .replaceAll("%Y", String(now.getFullYear()))
    .replaceAll("%m", pad(now.getMonth() + 1))
    .replaceAll("%d", pad(now.getDate()))
    .replaceAll("%H", pad(now.getHours()))
    .replaceAll("%M", pad(now.getMinutes()))
    .replaceAll("%S", pad(now.getSeconds()));
}

/**
 * Return a non-colliding path: `target` itself if free, otherwise `name-1.ext`,
 * `name-2.ext`, … Guards saves in the same second (dateName granularity) from
 * silently overwriting each other.
 */
export async function uniqueTargetPath(target: string): Promise<string> {
  const exists = async (p: string): Promise<boolean> => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  };
  if (!(await exists(target))) return target;
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  for (let i = 1; ; i++) {
    const candidate = path.join(dir, `${base}-${i}${ext}`);
    if (!(await exists(candidate))) return candidate;
  }
}

/**
 * Parse an ffprobe `r_frame_rate` value ("30000/1001" or "25") into a number.
 * Returns 0 for malformed values or zero denominators instead of NaN/Infinity.
 */
export function parseFrameRate(raw: string): number {
  const parts = raw.trim().split("/");
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    return Number.isFinite(num) && den > 0 ? num / den : 0;
  }
  const val = Number(parts[0]);
  return Number.isFinite(val) && val > 0 ? val : 0;
}

/**
 * A file's duration in seconds, read in process. A file that is not media, or
 * names no duration, answers 0.
 */
export async function probeDurationSeconds(file: string): Promise<number> {
  try {
    return (await probeMedia(file)).durationSec ?? 0;
  } catch {
    return 0;
  }
}

/** Mediabunny codec names, as libav (and so ffprobe) names them. */
const LIBAV_CODEC_NAMES: Record<string, string> = {
  avc: "h264",
  hevc: "hevc",
  vp8: "vp8",
  vp9: "vp9",
  av1: "av1",
  prores: "prores",
  aac: "aac",
  opus: "opus",
  mp3: "mp3",
  vorbis: "vorbis",
  flac: "flac",
  ac3: "ac3",
  eac3: "eac3",
  alac: "alac",
  "pcm-u8": "pcm_u8",
  "pcm-s16": "pcm_s16le",
  "pcm-s16be": "pcm_s16be",
  "pcm-s24": "pcm_s24le",
  "pcm-s24be": "pcm_s24be",
  "pcm-s32": "pcm_s32le",
  "pcm-s32be": "pcm_s32be",
  "pcm-f32": "pcm_f32le",
  "pcm-f32be": "pcm_f32be",
  "pcm-f64": "pcm_f64le",
  "pcm-f64be": "pcm_f64be",
  ulaw: "pcm_mulaw",
  alaw: "pcm_alaw"
};

/** libav's name for a codec Mediabunny names `codec`; empty when unknown. */
export function libavCodecName(codec: string | null): string {
  return codec ? (LIBAV_CODEC_NAMES[codec] ?? codec) : "";
}

/** What the video nodes read off a file, in ffprobe's terms. */
export interface VideoInfo {
  durationSec: number;
  width: number;
  height: number;
  /** The frame lattice rate (ffprobe's `r_frame_rate`), else the average. */
  fps: number;
  /** libav's name for the video codec, e.g. `h264`; empty when unknown. */
  codec: string;
  hasAudio: boolean;
}

/**
 * Probe a file's picture and sound in process. Throws when the file is not
 * media Mediabunny reads; the nodes that degrade to an empty answer catch it.
 */
export async function probeVideoInfo(file: string): Promise<VideoInfo> {
  const probe = await probeMedia(file);
  const video = probe.video;
  return {
    durationSec: probe.durationSec ?? 0,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: video ? (video.nominalFps ?? video.averageFps) : 0,
    codec: libavCodecName(video?.codec ?? null),
    hasAudio: probe.audio !== null
  };
}

/** How many video frames `file` holds, counted from its packets. */
export async function countVideoFrames(file: string): Promise<number> {
  return (await packetTimes(file))?.length ?? 0;
}

/** Whether `file` has an audio stream. Unreadable media has none. */
export async function probeHasAudioStream(file: string): Promise<boolean> {
  try {
    return (await probeMedia(file)).audio !== null;
  } catch {
    return false;
  }
}

/** Write `bytes` to a temp file with `suffix`, returning its path + cleanup. */
export async function withTempFile(
  suffix: string,
  bytes: Uint8Array
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-video-"));
  const file = path.join(dir, `input${suffix}`);
  await fs.writeFile(file, bytes);
  return {
    path: file,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    }
  };
}

/**
 * Normalize provider-prediction output to `Uint8Array`. Accepts `Uint8Array`,
 * `Buffer`, or `ArrayBuffer`; anything else throws a clear error naming the node
 * and the received type instead of casting blindly.
 */
export function coerceProviderBytes(
  value: unknown,
  nodeName: string
): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  const received =
    value === null
      ? "null"
      : Array.isArray(value)
        ? "array"
        : isObjectLike(value)
          ? (value.constructor?.name ?? "object")
          : typeof value;
  throw new Error(
    `${nodeName}: provider returned ${received}, expected video bytes ` +
      `(Uint8Array/Buffer).`
  );
}

/** `rate` as atempo factors, each inside the filter's own 0.5–2 range. */
export function atempoChain(rate: number): string[] {
  const factors: string[] = [];
  let remaining = rate;
  while (remaining > 2) {
    factors.push("2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    factors.push("0.5");
    remaining *= 2;
  }
  factors.push(String(Number(remaining.toFixed(6))));
  return factors;
}
