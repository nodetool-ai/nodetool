/**
 * Cancel one generation the caller owns. Shared by the `cancel_generation`
 * capability and the WebSocket `cancel_generation` command, so an agent and
 * the editor stop a render the same way.
 *
 * The abort is what stops a local provider call; the row is what the seam
 * closes when that call unwinds. Durable work belongs to another worker, so
 * only its cancellation intent is recorded.
 */

import { Prediction } from "@nodetool-ai/models";
import { generationRegistry } from "@nodetool-ai/runtime";

export type GenerationCancelOutcome =
  /** The row is missing, settled, or belongs to someone else. */
  | { status: "not_running"; durable: boolean }
  /** Durable work: the intent is recorded and its worker closes the row. */
  | { status: "cancellation_requested"; row: Prediction }
  /** The provider call ran in this process and was aborted. */
  | { status: "aborted" }
  /** The call runs in another process. Its row was closed as cancelled. */
  | { status: "closed" };

export async function cancelGenerationForUser(
  generationId: string,
  userId: string
): Promise<GenerationCancelOutcome> {
  const existing = await Prediction.findForUser(userId, generationId);
  if (existing?.lifecycle_owner === "durable") {
    const requested = await Prediction.requestCancellation(
      generationId,
      userId
    );
    return requested
      ? { status: "cancellation_requested", row: existing }
      : { status: "not_running", durable: true };
  }
  if (generationRegistry.cancel(generationId, userId)) {
    return { status: "aborted" };
  }
  if (await Prediction.markCancelledIfRunning(generationId, userId)) {
    return { status: "closed" };
  }
  return { status: "not_running", durable: false };
}
