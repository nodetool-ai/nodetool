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
 * - **CPU** — spawns run at most `maxConcurrentHostBinaries` at once per
 *   concurrency class; the rest queue. One run cannot take every core from
 *   the request handlers. The `render` class has its own cap
 *   (`NODETOOL_BLENDER_CONCURRENCY`) so a minutes-long render never holds a
 *   slot a two-second ffmpeg call is waiting for.
 *
 * The filesystem/network half of the boundary lives in
 * `host-binary-guard.ts` in `@nodetool-ai/agents`.
 */

import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { isNumber, isObjectLike } from "./type-predicates.js";

export type HostBinaryResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** True when output was cut at the capture cap; the child still ran on. */
  truncated?: boolean;
  /**
   * How long the run waited for a concurrency slot before spawning, in
   * milliseconds. Zero when a slot was free. Callers that report queueing
   * (e.g. `blender.queued_ms`) read it from here: the host runner is the
   * only place that sees the wait.
   */
  queuedMs?: number;
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

/**
 * Concurrent spawns in the `render` class. `NODETOOL_BLENDER_CONCURRENCY`
 * overrides it; anything unparseable or non-positive keeps the default of 1.
 */
function maxConcurrentBlenderRenders(): number {
  const raw = Number(process.env["NODETOOL_BLENDER_CONCURRENCY"]);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

/** The class every run queues on when it passes no `concurrencyClass`. */
const DEFAULT_CONCURRENCY_CLASS = "default";

/** The class for long renders; capped separately from the default class. */
const RENDER_CONCURRENCY_CLASS = "render";

type ConcurrencySlot = {
  running: number;
  waiting: Array<() => void>;
};

const slots = new Map<string, ConcurrencySlot>();

function slotFor(concurrencyClass: string): ConcurrencySlot {
  let slot = slots.get(concurrencyClass);
  if (slot === undefined) {
    slot = { running: 0, waiting: [] };
    slots.set(concurrencyClass, slot);
  }
  return slot;
}

function capFor(concurrencyClass: string): number {
  return concurrencyClass === RENDER_CONCURRENCY_CLASS
    ? maxConcurrentBlenderRenders()
    : maxConcurrentHostBinaries();
}

/**
 * Take a slot in the run's class, waiting behind that class's queue when
 * every slot is busy. Classes are independent: a run in one class never
 * blocks another class.
 *
 * A waiter does not increment on wake: the releasing run *hands over* its
 * slot, so the count never dips between the two. Decrementing first and
 * letting the waiter re-increment leaves a window — between resolving the
 * waiter's promise and its continuation running — in which the count reads one
 * below the truth, and a caller arriving inside it would take a slot the woken
 * waiter is also about to take. No test here reproduces that interleaving; the
 * hand-off removes the window rather than relying on it staying unreachable.
 */
async function acquireSlot(
  concurrencyClass: string,
  signal?: AbortSignal
): Promise<void> {
  const slot = slotFor(concurrencyClass);
  if (slot.running < capFor(concurrencyClass)) {
    slot.running++;
    return;
  }
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const waiter = (): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      const index = slot.waiting.indexOf(waiter);
      if (index >= 0) slot.waiting.splice(index, 1);
      const reason = signal?.reason as unknown;
      reject(
        reason instanceof Error
          ? reason
          : new Error(`Host binary run aborted: ${String(reason)}`)
      );
    };
    slot.waiting.push(waiter);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function releaseSlot(concurrencyClass: string): void {
  const slot = slotFor(concurrencyClass);
  const next = slot.waiting.shift();
  if (next) {
    next();
    return;
  }
  slot.running--;
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
  /**
   * Wall clock for the spawned run only, from spawn to `close`. Time spent
   * waiting for a concurrency slot is excluded and reported separately as
   * `queuedMs`, so a run queued behind a long render does not time out
   * while waiting. SIGTERM at the deadline, SIGKILL five seconds later.
   */
  timeoutMs: number;
  /**
   * Workspace-relative file the run is writing. When set, the watchdog kills
   * the child once that file passes `maxArtifactBytes`.
   */
  artifactPath?: string;
  /** Ceiling for `artifactPath`. Defaults to {@link MAX_ARTIFACT_BYTES}. */
  maxArtifactBytes?: number;
  /**
   * Aborts the run: SIGTERM now, SIGKILL five seconds later through the same
   * escalation path as the timeout. The promise rejects with the abort
   * reason once the child has actually exited, not when the signal fires —
   * a child that ignores SIGTERM keeps its concurrency slot and its working
   * directory until SIGKILL reaps it. An already-aborted signal rejects
   * without spawning, and an abort while queued releases the queue position
   * and rejects without spawning.
   */
  signal?: AbortSignal;
  /**
   * The child's whole environment when set, instead of `process.env`.
   * Lets the caller keep the server's secrets out of the child.
   */
  env?: Record<string, string>;
  /**
   * One call per complete stderr line, fed from the same stream the capture
   * reads. Lines keep arriving after the capture cap truncates the stored
   * copy.
   */
  onStderrLine?: (line: string) => void;
  /**
   * Which semaphore the run queues on. The default class keeps the
   * `NODETOOL_HOST_BINARY_CONCURRENCY` cap; the `render` class is capped by
   * `NODETOOL_BLENDER_CONCURRENCY` (default 1). Classes are independent.
   */
  concurrencyClass?: string;
}

export async function runHostBinary(
  cmd: string,
  args: string[],
  opts: RunHostBinaryOptions
): Promise<HostBinaryResult> {
  opts.signal?.throwIfAborted();
  const concurrencyClass =
    opts.concurrencyClass === undefined || opts.concurrencyClass === ""
      ? DEFAULT_CONCURRENCY_CLASS
      : opts.concurrencyClass;
  const queuedStart = Date.now();
  await acquireSlot(concurrencyClass, opts.signal);
  const queuedMs = Date.now() - queuedStart;
  try {
    const result = await spawnBounded(cmd, args, opts);
    return { ...result, queuedMs };
  } finally {
    releaseSlot(concurrencyClass);
  }
}

function spawnBounded(
  cmd: string,
  args: string[],
  opts: RunHostBinaryOptions
): Promise<HostBinaryResult> {
  return new Promise((resolve, reject) => {
    opts.signal?.throwIfAborted();
    const signal = opts.signal;
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: "pipe",
      env: opts.env ?? process.env
    });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let overran = false;
    let aborted = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const kill = (): void => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
    };

    // Record the abort and kill, but settle only on `close` below: the
    // caller frees its concurrency slot and deletes its scratch directory
    // when this promise settles, and both must wait until the child is
    // actually gone — a child that ignores SIGTERM lives on until SIGKILL.
    const onAbort = (): void => {
      aborted = true;
      kill();
    };

    const abortReason = (): unknown => {
      const reason = signal?.reason as unknown;
      return reason instanceof Error
        ? reason
        : new Error(`Host binary run aborted: ${String(reason)}`);
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
      if (signal !== undefined) signal.removeEventListener("abort", onAbort);
    };

    // A line with no newline yet. Flushed as a line at MAX_CAPTURED_BYTES so
    // a child that never prints a newline cannot grow this buffer without
    // bound; every newline-terminated line still arrives as exactly one call.
    let stderrPending = "";
    const feedStderrLines = (chunk: string): void => {
      const onStderrLine = opts.onStderrLine;
      if (onStderrLine === undefined) return;
      stderrPending += chunk;
      let newline = stderrPending.indexOf("\n");
      while (newline >= 0) {
        const line = stderrPending.slice(0, newline).replace(/\r$/, "");
        stderrPending = stderrPending.slice(newline + 1);
        try {
          onStderrLine(line);
        } catch {
          // A progress callback must not kill the run it observes.
        }
        newline = stderrPending.indexOf("\n");
      }
      if (stderrPending.length > MAX_CAPTURED_BYTES) {
        const line = stderrPending;
        stderrPending = "";
        try {
          onStderrLine(line);
        } catch {
          // A progress callback must not kill the run it observes.
        }
      }
    };

    if (signal !== undefined) signal.addEventListener("abort", onAbort);

    child.stdout.on("data", (chunk) => {
      const next = capture(stdout, String(chunk));
      stdout = next.text;
      truncated = truncated || next.truncated;
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      const next = capture(stderr, text);
      stderr = next.text;
      truncated = truncated || next.truncated;
      feedStderrLines(text);
    });
    child.on("error", (err) => {
      done();
      if (aborted) {
        reject(abortReason());
        return;
      }
      const code =
        isObjectLike(err) && "code" in err ? String(err.code) : "";
      if (code === "ENOENT") {
        reject(new HostBinaryMissingError(cmd));
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      done();
      if (aborted) {
        reject(abortReason());
        return;
      }
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
