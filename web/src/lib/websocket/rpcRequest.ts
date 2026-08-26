/**
 * One request, one reply, correlated by request id.
 *
 * The unified runner answers `generate_media`, `generate_text`,
 * `transcribe_audio` and the read-only `list_*`/`get_*` commands with a single
 * `rpc_response` frame on the request id rather than a message stream. This is
 * how a surface asks for one of them without standing up its own subscription
 * bookkeeping.
 *
 * A surface that must survive a remount mid-flight (the storyboard's per-shot
 * renders) subscribes by hand instead — the promise here dies with the caller.
 */

import {
  globalWebSocketManager,
  type WebSocketMessage
} from "./GlobalWebSocketManager";

interface RpcResponse extends WebSocketMessage {
  type: "rpc_response";
  request_id: string;
  result?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}

/** A client-generated id the reply is matched on. */
export const randomRequestId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export async function rpcRequest(
  command: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  await globalWebSocketManager.ensureConnection();
  const requestId = randomRequestId();
  return new Promise((resolve, reject) => {
    const unsubscribe = globalWebSocketManager.subscribe(requestId, (msg) => {
      if (msg.type !== "rpc_response") return;
      const response = msg as RpcResponse;
      if (response.request_id !== requestId) return;
      unsubscribe();
      if (response.error) {
        reject(new Error(response.error.message ?? "RPC failed"));
        return;
      }
      resolve(response.result ?? {});
    });
    globalWebSocketManager
      .send({ command, request_id: requestId, data })
      .catch((err) => {
        unsubscribe();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}
