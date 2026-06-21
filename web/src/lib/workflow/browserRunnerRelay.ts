/**
 * Shared in-browser relay normalization for kernel-streamed messages.
 *
 * Both browser run paths — the Web Worker path (`browserWorkerClient.ts`) and
 * the main-thread fallback (`browserWorkflowRunner.ts`) — must normalize each
 * message the same way a server run does before it reaches `deliverLocal`:
 * materialize raw-RGBA / inline bytes (so `<img>` can render them) and, for
 * `generation_complete`, stamp an arrival-order `index` per `(job, node)`.
 *
 * The browser path never persists (RFC §8.5 / Decision 9), so `index` is
 * arrival order only — no DB ordering. GPU-texture read-back happens earlier on
 * the worker path (`browserRunner.worker.ts`, before postMessage); this module
 * only does the CPU-side materialize + index stamp, so it is jest-safe and can
 * be unit-tested without spawning a real `Worker`.
 */
import { materializeBrowserOutputs } from "./materializeBrowserOutputs";
import type { WebSocketMessage } from "../websocket/GlobalWebSocketManager";

/**
 * Stamp an arrival-order `index` per `(job, node)` on a `generation_complete`
 * message, mutating it in place and bumping the per-node counter. No-op for
 * other message types.
 */
export function stampGenerationIndex(
  message: WebSocketMessage,
  generationIndexByNode: Map<string, number>
): void {
  if (message.type !== "generation_complete") return;
  const mutable = message as Record<string, unknown>;
  const nodeId = (mutable.node_id as string | undefined) ?? "";
  const arrivalIndex = generationIndexByNode.get(nodeId) ?? 0;
  mutable.index = arrivalIndex;
  generationIndexByNode.set(nodeId, arrivalIndex + 1);
}

/**
 * Materialize a worker-streamed message in place (raw-RGBA → PNG, inline bytes
 * → uri) and, for `generation_complete`, stamp its arrival-order `index`. This
 * is the worker-path counterpart of the inline normalization in
 * `runBrowserGraphJobLocal`; GPU read-back already happened in the worker.
 */
export function normalizeWorkerStreamMessage(
  message: WebSocketMessage,
  generationIndexByNode: Map<string, number>
): void {
  const mutable = message as Record<string, unknown>;
  if (message.type === "node_update" && mutable.result != null) {
    mutable.result = materializeBrowserOutputs(mutable.result);
  } else if (message.type === "output_update" && mutable.value != null) {
    mutable.value = materializeBrowserOutputs(mutable.value);
  } else if (message.type === "generation_complete") {
    stampGenerationIndex(message, generationIndexByNode);
    if (mutable.outputs != null) {
      mutable.outputs = materializeBrowserOutputs(mutable.outputs);
    }
  }
}
