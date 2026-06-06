import type { Message } from "../../../stores/ApiTypes";

export interface ThreadStats {
  /** Model of the most recent assistant message that declared one. */
  model: string | null;
  /** Provider of the most recent assistant message that declared one. */
  provider: string | null;
  /** Duration of the last turn (last user msg → final assistant msg), in ms. */
  runtimeMs: number | null;
  /** Timestamp of the final assistant message. */
  lastRunAt: string | null;
  /** Total cost across all messages, or null when no message reported a cost. */
  spend: number | null;
}

const EMPTY_STATS: ThreadStats = {
  model: null,
  provider: null,
  runtimeMs: null,
  lastRunAt: null,
  spend: null
};

/**
 * Derives the per-conversation header metrics from the loaded messages.
 * Everything is best-effort: fields stay null when the underlying data is
 * absent (e.g. a thread with no assistant reply yet). No persistence — these
 * are recomputed from whatever messages the open thread has in memory.
 */
export function deriveThreadStats(messages: Message[]): ThreadStats {
  if (!messages || messages.length === 0) {
    return EMPTY_STATS;
  }

  let model: string | null = null;
  let provider: string | null = null;
  let lastAssistantIdx = -1;
  let spend: number | null = null;

  for (let i = 0; i < messages.length; i++) {
    const cost = messages[i].cost;
    if (typeof cost === "number" && Number.isFinite(cost)) {
      spend = (spend ?? 0) + cost;
    }
    if (messages[i].role !== "assistant") continue;
    lastAssistantIdx = i;
    if (messages[i].model) model = messages[i].model ?? null;
    if (messages[i].provider) provider = messages[i].provider ?? null;
  }

  if (lastAssistantIdx === -1) {
    return { ...EMPTY_STATS, spend };
  }

  const lastAssistant = messages[lastAssistantIdx];
  const lastRunAt = lastAssistant.created_at ?? null;

  let runtimeMs: number | null = null;
  if (lastRunAt) {
    let startAt: string | null = null;
    for (let i = lastAssistantIdx; i >= 0; i--) {
      if (messages[i].role === "user" && messages[i].created_at) {
        startAt = messages[i].created_at ?? null;
        break;
      }
    }
    if (startAt) {
      const delta = new Date(lastRunAt).getTime() - new Date(startAt).getTime();
      if (Number.isFinite(delta) && delta >= 0) {
        runtimeMs = delta;
      }
    }
  }

  return { model, provider, runtimeMs, lastRunAt, spend };
}
