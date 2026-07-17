/**
 * Shared ffmpeg/ffprobe helpers for the video nodes.
 *
 * Internal to the package — deliberately NOT re-exported from `src/index.ts`.
 * Everything here is free of node-specific state so `timeline.ts` (and any other
 * ffmpeg-backed module) can import it directly.
 *
 * Policy: a spawn failure because the binary is missing (`ENOENT`) surfaces as
 * {@link MissingBinaryError} carrying the binary name. A genuine tool failure
 * (non-zero exit) rejects with the underlying error, whose `.stderr` carries
 * ffmpeg's diagnostics — callers turn that into an actionable message instead of
 * silently passing the input through.
 */
import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { VideoRef } from "@nodetool-ai/node-sdk";

export const execFile = promisify(execFileCb);

export const FFMPEG_MAX_BUFFER = 50 * 1024 * 1024;

/** A required binary (ffmpeg/ffprobe) is not installed or not on PATH. */
export class MissingBinaryError extends Error {
  readonly binary: string;
  constructor(binary: string) {
    super(
      `${binary} is not installed or not on PATH. Install ${binary} (the ` +
        `Package Manager UI can do this) to process video — these nodes shell ` +
        `out to ffmpeg/ffprobe and cannot run without it.`
    );
    this.name = "MissingBinaryError";
    this.binary = binary;
  }
}

/**
 * Whether `err` is a spawn ENOENT (binary not on PATH) rather than the tool
 * running and reporting a non-zero exit. Scope this to the spawn itself so an
 * unrelated filesystem ENOENT is never mislabeled as a missing binary.
 */
function isSpawnEnoent(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

/** Run ffmpeg, mapping a missing binary to {@link MissingBinaryError}. */
export async function execFfmpeg(
  args: string[],
  options: { maxBuffer?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFile("ffmpeg", args, options);
  } catch (error) {
    if (isSpawnEnoent(error)) throw new MissingBinaryError("ffmpeg");
    throw error;
  }
}

/** Run ffprobe, mapping a missing binary to {@link MissingBinaryError}. */
export async function execFfprobe(
  args: string[],
  options: { maxBuffer?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFile("ffprobe", args, options);
  } catch (error) {
    if (isSpawnEnoent(error)) throw new MissingBinaryError("ffprobe");
    throw error;
  }
}

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
  if (typeof raw === "string") {
    return raw.startsWith("file:") ? filePath(raw) : raw;
  }
  if (raw && typeof raw === "object") {
    const uri = (raw as Record<string, unknown>).uri;
    if (typeof uri === "string" && uri.length > 0) return filePath(uri);
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
 * Probe a file's duration in seconds. A missing ffprobe binary surfaces as
 * {@link MissingBinaryError}; a genuine probe failure (corrupt input) returns 0.
 */
export async function ffprobeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execFfprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file
    ]);
    const val = parseFloat(stdout.trim());
    return isNaN(val) ? 0 : val;
  } catch (error) {
    if (error instanceof MissingBinaryError) throw error;
    return 0;
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
        : typeof value === "object"
          ? ((value as { constructor?: { name?: string } }).constructor?.name ??
            "object")
          : typeof value;
  throw new Error(
    `${nodeName}: provider returned ${received}, expected video bytes ` +
      `(Uint8Array/Buffer).`
  );
}
