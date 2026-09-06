/**
 * Shared failure mapping for the Blender nodes.
 *
 * A node wraps its whole job in `runBlenderNodeStep`, which catches the
 * failure where it happens rather than handing an unparsed value on: it
 * rethrows with the node name prefixed, maps the wall-clock timeout onto
 * the knobs that fix it, and passes an abort through unwrapped so the node
 * rejects with the abort reason and no partial output. The empty-passes and
 * unknown-format refusals already carry the node name, so they pass through
 * unchanged.
 */

import { BlenderJobError } from "../runner.js";

export interface BlenderNodeStep {
  /** Node type prefixed onto every failure this step raises. */
  nodeName: string;
  /** Message replacing a runner timeout, naming the knobs that fix it. */
  timeoutMessage: string;
  /** Cancellation passes through unwrapped when this signal aborted. */
  signal?: AbortSignal;
}

export async function runBlenderNodeStep<T>(
  step: BlenderNodeStep,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    // Cancellation rejects with the abort reason: pass it through
    // unwrapped so the node rejects with the abort reason.
    if (step.signal?.aborted) throw error;
    if (error instanceof BlenderJobError) {
      if (error.code === "timeout") {
        throw new BlenderJobError("timeout", step.timeoutMessage);
      }
      // A refusal that already carries the node name (empty passes,
      // unknown export format) passes through unchanged.
      if (error.message.startsWith(step.nodeName)) throw error;
      throw new BlenderJobError(
        error.code,
        `${step.nodeName}: ${error.message}`
      );
    }
    if (error instanceof Error) {
      throw new Error(`${step.nodeName}: ${error.message}`);
    }
    throw new Error(`${step.nodeName}: ${String(error)}`);
  }
}
