/**
 * What became of a set of `generate_media` requests.
 *
 * A `generate_media` reply is an `rpc_response` carrying no `job_id` and no
 * `thread_id`, so the server writes it to the socket that asked and drops it
 * if that socket has gone (`WebSocketClientSession.sendMessage`). Re-subscribing
 * to the request id after a reload therefore recovers nothing: the frame was
 * already delivered to a socket that no longer exists.
 *
 * The generation row outlives the socket. It is opened before the provider call
 * and closed with the assets it produced, so asking for it by the request id
 * the client persisted before sending is what actually recovers a render paid
 * for while the browser was shut.
 *
 * A request id with no row comes back absent, not failed: the row may not have
 * been opened yet, and treating "unknown" as "failed" would throw away a render
 * still in flight.
 */

import { rpcRequest } from "./rpcRequest";

/** The terminal states a row can be read in, plus the one that is not. */
export type GenerationLookupStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface GenerationLookup {
  requestId: string;
  generationId: string;
  status: GenerationLookupStatus;
  /** The assets the call produced. Empty until it completed. */
  assetIds: string[];
  error: string | null;
}

const TERMINAL: ReadonlySet<GenerationLookupStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted"
]);

/** Whether this outcome is settled, so nothing more will arrive for it. */
export const isSettled = (status: GenerationLookupStatus): boolean =>
  TERMINAL.has(status);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readStatus = (value: unknown): GenerationLookupStatus =>
  value === "completed" ||
  value === "failed" ||
  value === "cancelled" ||
  value === "interrupted"
    ? value
    : "running";

const readAssetIds = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];

/**
 * Look the request ids up, keyed by request id.
 *
 * Never throws: this runs on the reattachment path, where the point is to
 * recover what can be recovered. A server too old to know the command, or a
 * socket that will not connect, yields an empty map and the caller falls back
 * to subscribing — which is exactly the behaviour it had before this existed.
 */
export async function lookupGenerations(
  requestIds: readonly string[]
): Promise<Map<string, GenerationLookup>> {
  const found = new Map<string, GenerationLookup>();
  if (requestIds.length === 0) {
    return found;
  }
  // Prediction.byRequestIds caps each server query at 128 request ids.
  const ids = [...new Set(requestIds)];
  for (let offset = 0; offset < ids.length; offset += 128) {
    let result: Record<string, unknown>;
    try {
      result = await rpcRequest("lookup_generations", {
        request_ids: ids.slice(offset, offset + 128)
      }, 15_000);
    } catch {
      // A failed lookup leaves this batch unresolved for the next poll.
      continue;
    }
    const rows = Array.isArray(result.generations) ? result.generations : [];
    for (const row of rows) {
      if (!isRecord(row) || typeof row.request_id !== "string") {
        continue;
      }
      found.set(row.request_id, {
        requestId: row.request_id,
        generationId:
          typeof row.generation_id === "string" ? row.generation_id : "",
        status: readStatus(row.status),
        assetIds: readAssetIds(row.asset_ids),
        error: typeof row.error === "string" ? row.error : null
      });
    }
  }
  return found;
}
