/**
 * Sends Create requests straight to `generate_media`. No thread or message row
 * is made: GenerationActivityStore records each request when it is sent, and
 * the Create grid reads it from there.
 */
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";
import { randomRequestId } from "../../lib/websocket/rpcRequest";

export interface CreateSubmitResult {
  /** Request ids of the takes that reached the socket, in send order. */
  sent: string[];
  /** The first send failure, when a take never left. */
  error: Error | null;
}

/**
 * Sends the takes one after the other. A take that cannot be sent stops the
 * rest, so the person retries one failure rather than a half-sent batch.
 */
export const submitCreateBatch = async (
  requests: readonly object[]
): Promise<CreateSubmitResult> => {
  const sent: string[] = [];
  for (const data of requests) {
    const requestId = randomRequestId();
    try {
      await globalWebSocketManager.send({
        command: "generate_media",
        request_id: requestId,
        data
      });
      sent.push(requestId);
    } catch (cause) {
      return {
        sent,
        error: cause instanceof Error ? cause : new Error(String(cause))
      };
    }
  }
  return { sent, error: null };
};
