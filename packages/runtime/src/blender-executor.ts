/**
 * Blender worker executor — runs a `BlenderJob` on a GPU worker over the
 * Python bridge, the transport half of Stage 4a (D6).
 *
 * This is the worker-tier counterpart of `LocalBlenderRunner` in
 * `@nodetool-ai/blender-nodes` (which this package must not import — the
 * dependency runs the other way, so the job travels here as a structural
 * type). `WorkerBlenderRunner` (Stage 4b) wraps this function behind the
 * `BlenderRunner` interface; nodes never call it directly.
 *
 * Contract, mirroring the local tier step for step (D6):
 *
 *  - inputs travel as bridge blobs: the request carries the verbatim `job`,
 *    an `inputs` manifest mapping each logical input name to its blob key,
 *    the input bytes under those keys, and a worker-side `timeout`.
 *  - outputs come back as bridge blobs on the terminal `result` frame.
 *  - the same output caps apply as on the local tier, enforced from the
 *    worker's declared `sizes` BEFORE any blob bytes are consumed — and
 *    re-checked against the actual byte lengths, so a lying worker cannot
 *    bypass them either way.
 *  - a name in the worker's result that the job did not declare is ignored
 *    and logged at warn, exactly as `LocalBlenderRunner` does.
 *  - `blender.event` progress frames become `onProgress(frame, total)` calls.
 *  - the run is abortable through an `AbortSignal`: aborting sends the
 *    worker a `cancel` frame for this exact request (it does not just abandon
 *    the local promise) and rejects with the signal's reason, unwrapped —
 *    the same way the local tier rejects with the abort reason.
 *
 * Error codes are the local tier's codes verbatim (`render_failed`,
 * `missing_output`, `output_too_large`, `bad_job`, `bad_result`, …): the
 * worker's op failure (`ok: false`) preserves its code, and a transport or
 * malformed-result failure is `bad_result`, the way a crashed Blender is.
 * Stage 4b maps these into `BlenderJobError`; this module cannot throw that
 * class itself without a dependency cycle.
 */

import { randomUUID } from "node:crypto";

import { createLogger } from "@nodetool-ai/config";

import { isNumber, isString } from "./type-predicates.js";
import type {
  BlenderExecuteJob,
  BlenderExecuteResult,
  PythonBridge
} from "./python-bridge-types.js";

const log = createLogger("runtime:blender-executor");

/**
 * Structural `BlenderJob` (`packages/blender-nodes/src/job.ts`). Kept local
 * so this package never imports `@nodetool-ai/blender-nodes`: every field a
 * real `BlenderJob` carries satisfies these shapes, and the worker's
 * `run_job.py` owns the op schema.
 */
export type BlenderWorkerJob = BlenderExecuteJob;

export interface BlenderExecutorOptions {
  /** Wall clock for the run. Sent to the worker as whole seconds. */
  timeoutMs: number;
  /** Abort: the cancel reaches the worker, the promise rejects with `reason`. */
  signal?: AbortSignal;
  onProgress?: (frame: number, total: number) => void;
  /** Per-output byte cap — the local tier's `MAX_OUTPUT_BYTES`. */
  maxOutputBytes: number;
  /** Cap on the sum of all outputs — the local tier's `MAX_TOTAL_OUTPUT_BYTES`. */
  maxTotalOutputBytes: number;
  /**
   * Additional worker-owned files sent as blobs, keyed by their relative
   * paths. `WorkerBlenderRunner` uses this for the Blender op tree; these are
   * deliberately outside `job.inputs`, which remains the complete manifest
   * of workflow-provided inputs.
   */
  extraBlobs?: Record<string, Uint8Array>;
}

export interface BlenderExecutorStats {
  blender_version: string;
  render_seconds: number;
  frames?: number;
  objects?: number;
  depth_near?: number;
  depth_far?: number;
  camera?: string;
  [key: string]: unknown;
}

export interface BlenderExecutorResult {
  /** Keyed by the job's logical output names. Only declared outputs. */
  outputs: Record<string, Uint8Array>;
  stats: BlenderExecutorStats;
}

/**
 * Worker-tier Blender failure. `code` is the local tier's code for the same
 * case, so Stage 4b can map it one-to-one into `BlenderJobError`.
 */
export class BlenderExecutorError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BlenderExecutorError";
    this.code = code;
  }
}

/**
 * Run one Blender job on a worker bridge and collect its outputs.
 *
 * Route only to a bridge whose {@link PythonBridge.supportsBlender} is true —
 * an older worker answers `blender.execute` with `Unknown message type`,
 * which surfaces here as `bad_result`.
 */
export async function executeBlender(
  bridge: PythonBridge,
  job: BlenderWorkerJob,
  inputs: Record<string, Uint8Array>,
  options: BlenderExecutorOptions
): Promise<BlenderExecutorResult> {
  const {
    timeoutMs,
    signal,
    onProgress,
    maxOutputBytes,
    maxTotalOutputBytes,
    extraBlobs
  } = options;
  // Mirror the local tier: an input the job did not declare is `bad_job`
  // before anything is sent.
  for (const name of Object.keys(inputs)) {
    if (!(name in job.inputs)) {
      throw new BlenderExecutorError(
        "bad_job",
        `Input "${name}" is not declared in job.inputs.`
      );
    }
  }
  // The blob key for an input is its logical name: unambiguous, and the
  // manifest still declares the mapping for workers that stage by key.
  const manifest: Record<string, string> = {};
  const blobs: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(inputs)) {
    manifest[name] = name;
    blobs[name] = bytes;
  }
  for (const [key, bytes] of Object.entries(extraBlobs ?? {})) {
    if (key in blobs) {
      throw new BlenderExecutorError(
        "bad_job",
        `Additional Blender blob "${key}" conflicts with a declared input.`
      );
    }
    blobs[key] = bytes;
  }
  const requestId = randomUUID();
  const timeout = Math.max(1, Math.ceil(timeoutMs / 1000));

  return new Promise<BlenderExecutorResult>((resolve, reject) => {
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
    };
    const cancel = (): void => {
      try {
        bridge.cancelBlenderExecute(requestId);
      } catch {
        // Worker may already be gone; cancel is best-effort.
      }
    };
    const abortHandler = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      // The abort reaches the worker: without the cancel frame the Blender
      // process would keep rendering a run nobody reads.
      cancel();
      // Unwrapped, the way the local tier rejects with the abort reason.
      reject(
        signal?.reason ??
          new Error(`Blender execution "${requestId}" was aborted.`)
      );
    };
    const timeoutHandler = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      // The worker receives its own timeout, but the transport promise must
      // also have a local deadline in case the worker stops responding.
      cancel();
      reject(
        new BlenderExecutorError(
          "timeout",
          `Blender render timed out after ${timeoutMs}ms. ` +
            "The worker did not complete the request in time."
        )
      );
    };
    if (signal?.aborted) {
      abortHandler();
      return;
    }
    if (signal) {
      signal.addEventListener("abort", abortHandler, { once: true });
    }
    timeoutHandle = setTimeout(timeoutHandler, Math.max(1, timeoutMs));
    Promise.resolve()
      .then(() => {
        // An abort can fire after executeBlender returns but before this
        // microtask dispatches the bridge request.
        if (settled) {
          throw signal?.reason ?? new Error("Blender execution was aborted.");
        }
        return bridge.blenderExecute(
          job,
          manifest,
          { blobs, timeout },
          (event) => {
            if (
              event.event === "progress" &&
              onProgress &&
              isNumber(event.frame) &&
              isNumber(event.total)
            ) {
              onProgress(event.frame, event.total);
            }
          },
          requestId
        )
      })
      .then(
        (result) => {
          if (settled) return;
          settled = true;
          cleanup();
          try {
            resolve(
              collectBlenderOutputs(job, result, {
                maxOutputBytes,
                maxTotalOutputBytes
              })
            );
          } catch (err) {
            reject(err);
          }
        },
        (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          // A terminal `error` frame (worker crash, unknown message type) is
          // `bad_result`, the way a crashed Blender with no result.json is.
          reject(new BlenderExecutorError("bad_result", messageOf(err)));
        }
      );
  });
}

/**
 * An `ok: false` result. The op's `{code, message}` passes through verbatim;
 * whatever the worker did send survives into the message, so a frame with
 * only a code, or an `error` that is a bare string, is not flattened to a
 * generic "no payload" text.
 */
function failureError(result: BlenderExecuteResult): BlenderExecutorError {
  const raw: unknown = result.error;
  if (isString(raw)) {
    return new BlenderExecutorError("bad_result", raw);
  }
  const error = raw != null && typeof raw === "object" ? raw : {};
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  if (isString(message) && message !== "") {
    return new BlenderExecutorError(
      isString(code) && code !== "" ? code : "bad_result",
      message
    );
  }
  if (isString(code) && code !== "") {
    return new BlenderExecutorError(
      code,
      `Blender worker failed with code "${code}" and no message.`
    );
  }
  return new BlenderExecutorError(
    "bad_result",
    "Blender worker reported failure without an error payload " +
      `(fields: ${Object.keys(result).join(", ") || "none"}).`
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Turn the terminal `result` into outputs, enforcing the local tier's step 5.
 * A name the job did not declare is ignored at warn; a declared output that
 * is missing, or above either cap, throws the local tier's code with the
 * local tier's message shape.
 */
function collectBlenderOutputs(
  job: BlenderWorkerJob,
  result: BlenderExecuteResult,
  caps: { maxOutputBytes: number; maxTotalOutputBytes: number }
): BlenderExecutorResult {
  const { maxOutputBytes, maxTotalOutputBytes } = caps;
  // The bridge delivers blobs inline in the terminal frame, so "before
  // transfer" means before any blob entry is consumed: the declared-size
  // pass below throws before a single output byte is read.
  if (!result.ok) {
    throw failureError(result);
  }
  if (!Array.isArray(result.produced)) {
    throw new BlenderExecutorError(
      "bad_result",
      "Blender worker returned ok without a produced list " +
        `(fields: ${Object.keys(result).join(", ") || "none"}).`
    );
  }
  const stats = readStats(result.stats);
  const declared = Object.entries(job.outputs);
  const produced = new Set(result.produced);
  for (const name of result.produced) {
    if (!(name in job.outputs)) {
      log.warn(`Blender produced undeclared output "${name}"; ignoring.`);
    }
  }
  // Declared sizes first: refuse an oversize result without pulling blob
  // bytes into the outputs record. Entries without a usable declared size
  // fall through to the actual-length check below.
  let declaredTotal = 0;
  for (const [name] of declared) {
    if (!produced.has(name)) {
      throw new BlenderExecutorError(
        "missing_output",
        `Blender did not produce declared output "${name}" (file "${job.outputs[name]}").`
      );
    }
    const size = result.sizes?.[name];
    if (isNumber(size) && size >= 0) {
      if (size > maxOutputBytes) {
        throw new BlenderExecutorError(
          "output_too_large",
          `Output "${name}" is ${size} bytes, above the ${maxOutputBytes}-byte per-output cap.`
        );
      }
      declaredTotal += size;
      if (declaredTotal > maxTotalOutputBytes) {
        throw new BlenderExecutorError(
          "output_too_large",
          `Outputs total ${declaredTotal} bytes, above the ${maxTotalOutputBytes}-byte total cap (reached at "${name}").`
        );
      }
    }
  }
  // Then the bytes themselves: a missing blob, a non-bytes entry, or an
  // actual length above either cap fails the same way, so a worker that
  // lies in `sizes` gains nothing.
  const outputs: Record<string, Uint8Array> = {};
  let actualTotal = 0;
  for (const [name] of declared) {
    const raw = result.blobs?.[name];
    if (!(raw instanceof Uint8Array)) {
      throw new BlenderExecutorError(
        "missing_output",
        `Blender worker returned no bytes for declared output "${name}".`
      );
    }
    if (raw.byteLength > maxOutputBytes) {
      throw new BlenderExecutorError(
        "output_too_large",
        `Output "${name}" is ${raw.byteLength} bytes, above the ${maxOutputBytes}-byte per-output cap.`
      );
    }
    actualTotal += raw.byteLength;
    if (actualTotal > maxTotalOutputBytes) {
      throw new BlenderExecutorError(
        "output_too_large",
        `Outputs total ${actualTotal} bytes, above the ${maxTotalOutputBytes}-byte total cap (reached at "${name}").`
      );
    }
    // Normalize to a plain Uint8Array: the bridge codec hands back Buffers
    // on Node, and the local tier wraps its reads the same way, so both
    // tiers hand callers the same type.
    outputs[name] = new Uint8Array(raw);
  }
  return { outputs, stats };
}

/** Narrow the worker's stats record to the local tier's stats shape. */
function readStats(stats: Record<string, unknown> | undefined): BlenderExecutorStats {
  if (
    !stats ||
    !isString(stats["blender_version"]) ||
    !isNumber(stats["render_seconds"])
  ) {
    throw new BlenderExecutorError(
      "bad_result",
      "Blender worker returned ok without usable stats."
    );
  }
  const out: BlenderExecutorStats = {
    blender_version: stats["blender_version"],
    render_seconds: stats["render_seconds"]
  };
  for (const key of ["frames", "objects"] as const) {
    if (isNumber(stats[key])) out[key] = stats[key];
  }
  for (const key of ["depth_near", "depth_far"] as const) {
    if (isNumber(stats[key])) out[key] = stats[key];
  }
  if (isString(stats["camera"])) out["camera"] = stats["camera"];
  return out;
}
