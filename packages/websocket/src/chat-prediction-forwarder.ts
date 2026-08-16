/**
 * Forwards ProcessingContext `prediction` events onto a chat socket.
 *
 * The chat turn's context already emits provider/model/capability on every
 * `runProviderPrediction` call. Without this listener those events stay in
 * the context queue and never reach ChatUI.
 */

import type { ProcessingMessage } from "@nodetool-ai/protocol";

export function attachChatPredictionForwarder(
  addMessageListener: (
    listener: (msg: ProcessingMessage) => void
  ) => () => void,
  send: (msg: Record<string, unknown>) => void,
  ids: { threadId: string | null; workflowId?: string | null }
): () => void {
  return addMessageListener((msg) => {
    if (msg.type !== "prediction") {
      return;
    }
    const forwarded = {
      ...msg,
      thread_id: ids.threadId
    } satisfies Record<string, unknown>;
    send(
      ids.workflowId == null
        ? forwarded
        : { ...forwarded, workflow_id: ids.workflowId }
    );
  });
}
