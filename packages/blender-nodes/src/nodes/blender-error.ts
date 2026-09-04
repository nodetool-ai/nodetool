/**
 * Shared failure mapping for the Blender nodes.
 *
 * Every node rethrows a `runBlenderJob` failure with its own name
 * prefixed, maps the wall-clock timeout onto the knobs that fix it, and
 * passes an abort through unwrapped so the node rejects with the abort
 * reason and no partial output. The empty-passes and unknown-format
 * refusals already carry the node name, so they pass through unchanged.
 */

import { BlenderJobError } from "../runner.js";

export function rethrowBlenderError(
  error: unknown,
  nodeName: string,
  timeoutMessage: string,
  signal?: AbortSignal
): never {
  // Cancellation rejects with the abort reason: pass it through
  // unwrapped so the node rejects with the abort reason.
  if (signal?.aborted) throw error;
  if (error instanceof BlenderJobError && error.code === "timeout") {
    throw new BlenderJobError("timeout", timeoutMessage);
  }
  if (error instanceof BlenderJobError) {
    // A refusal that already carries the node name (empty passes,
    // unknown export format) passes through unchanged.
    if (error.message.startsWith(nodeName)) throw error;
    throw new BlenderJobError(error.code, `${nodeName}: ${error.message}`);
  }
  if (error instanceof Error) {
    throw new Error(`${nodeName}: ${error.message}`);
  }
  throw new Error(`${nodeName}: ${String(error)}`);
}
