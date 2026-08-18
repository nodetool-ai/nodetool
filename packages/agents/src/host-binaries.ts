/**
 * Spawn a PATH binary with argv (no shell) inside the workspace.
 *
 * Used by the ffmpeg and yt-dlp capabilities. A missing binary is a named
 * error, not an ENOENT stack.
 *
 * What the caller gets is bounded on every axis a media tool can exhaust,
 * because the argv behind it comes from a model:
 *
 * - **Wall clock** — `timeoutMs`, SIGTERM then SIGKILL five seconds later.
 * - **Memory** — captured stdout/stderr stop at {@link MAX_CAPTURED_BYTES}
 *   each. `-loglevel debug` over a long clip used to accumulate the whole
 *   stream into one string in the server's heap.
 * - **Disk** — `maxArtifactBytes` watches the file being written and kills the
 *   child when it passes the cap. ffmpeg's own `-fs` does not hold: measured
 *   against ffmpeg 6.1, `-fs 50000` still produced a 164 KB mp4.
 * - **CPU** — {@link maxConcurrentHostBinaries} spawns run at once; the rest
 *   queue. One run cannot take every core from the request handlers.
 *
 * The filesystem/network half of the boundary lives in `host-binary-guard.ts`.
 */

import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { isNumber, isObjectLike } from "./utils/type-guards.js";

export type HostBinaryResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** True when output was cut at the capture cap; the child still ran on. */
  truncated?: boolean;
};

/** Captured bytes kept per stream. Beyond this the tail is dropped. */
export const MAX_CAPTURED_BYTES = 256 * 1024;

/** Default ceiling on a single artifact a host binary writes (2 GiB). */
export const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024;

/** How often the artifact watchdog stats the file it is watching. */
const ARTIFACT_POLL_MS = 500;

/**
 * Concurrent host-binary spawns. `NODETOOL_HOST_BINARY_CONCURRENCY` overrides
 * it; anything unparseable or non-positive keeps the default.
 */
export function maxConcurrentHostBinaries(): number {
  const raw = Number(process.env["NODETOOL_HOST_BINARY_CONCURRENCY"]);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 2;
}

let running = 0;
const waiting: Array<() => void> = [];

/** Take a slot, waiting behind the queue when every slot is busy. */
async function acquireSlot(): Promise<void> {
  if (running < maxConcurrentHostBinaries()) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
}

function releaseSlot(): void {
  running--;
  waiting.shift()?.();
}

/** Append to a captured stream, stopping at the cap. */
function capture(
  buffer: string,
  chunk: string
): { text: string; truncated: boolean } {
  if (buffer.length >= MAX_CAPTURED_BYTES) {
    return { text: buffer, truncated: true };
  }
  const room = MAX_CAPTURED_BYTES - buffer.length;
  if (chunk.length <= room) return { text: buffer + chunk, truncated: false };
  return { text: buffer + chunk.slice(0, room), truncated: true };
}

export class HostBinaryMissingError extends Error {
  readonly binary: string;
  constructor(binary: string) {
    super(
      `${binary} is not installed or is not on PATH. ` +
        `Install it with the Package Manager, or add it to PATH.`
    );
    this.name = "HostBinaryMissingError";
    this.binary = binary;
  }
}

export interface RunHostBinaryOptions {
  cwd: string;
  timeoutMs: number;
  /**
   * Workspace-relative file the run is writing. When set, the watchdog kills
   * the child once that file passes `maxArtifactBytes`.
   */
  artifactPath?: string;
  /** Ceiling for `artifactPath`. Defaults to {@link MAX_ARTIFACT_BYTES}. */
  maxArtifactBytes?: number;
}

export async function runHostBinary(
  cmd: string,
  args: string[],
  opts: RunHostBinaryOptions
): Promise<HostBinaryResult> {
  await acquireSlot();
  try {
    return await spawnBounded(cmd, args, opts);
  } finally {
    releaseSlot();
  }
}

function spawnBounded(
  cmd: string,
  args: string[],
  opts: RunHostBinaryOptions
): Promise<HostBinaryResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let overran = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const kill = (): void => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.timeoutMs);

    const artifactCap = opts.maxArtifactBytes ?? MAX_ARTIFACT_BYTES;
    const artifact =
      opts.artifactPath !== undefined && opts.artifactPath !== ""
        ? path.resolve(opts.cwd, opts.artifactPath)
        : undefined;
    const watchdog =
      artifact === undefined
        ? undefined
        : setInterval(() => {
            void stat(artifact)
              .then((info) => {
                if (info.size <= artifactCap || overran) return;
                overran = true;
                kill();
              })
              // Not written yet, or already gone: nothing to bound.
              .catch(() => undefined);
          }, ARTIFACT_POLL_MS);

    const done = (): void => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (watchdog) clearInterval(watchdog);
    };

    child.stdout.on("data", (chunk) => {
      const next = capture(stdout, String(chunk));
      stdout = next.text;
      truncated = truncated || next.truncated;
    });
    child.stderr.on("data", (chunk) => {
      const next = capture(stderr, String(chunk));
      stderr = next.text;
      truncated = truncated || next.truncated;
    });
    child.on("error", (err) => {
      done();
      const code =
        isObjectLike(err) && "code" in err
          ? String(err.code)
          : "";
      if (code === "ENOENT") {
        reject(new HostBinaryMissingError(cmd));
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      done();
      if (timedOut) {
        resolve({
          stdout,
          stderr: `${stderr}\nProcess timed out after ${opts.timeoutMs}ms`,
          exitCode: 124,
          truncated
        });
        return;
      }
      if (overran) {
        resolve({
          stdout,
          stderr:
            `${stderr}\nStopped: ${opts.artifactPath} passed the ` +
            `${artifactCap}-byte output limit`,
          exitCode: 124,
          truncated
        });
        return;
      }
      resolve({ stdout, stderr, exitCode: code ?? 0, truncated });
    });
  });
}

const EXT_MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif"
};

export function mimeFromFilename(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return EXT_MIME[ext] ?? "application/octet-stream";
}

/**
 * Whole seconds in `[1, max]`, or `fallback` when `raw` states no usable
 * duration. The floor is 1, not 0: truncating a sub-second request to 0 would
 * reach `runHostBinary` as `setTimeout(kill, 0)` and SIGTERM the child on the
 * next tick.
 */
export function clampTimeoutSeconds(
  raw: unknown,
  fallback: number,
  max: number
): number {
  const n = isNumber(raw) ? raw : fallback;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), max);
}
