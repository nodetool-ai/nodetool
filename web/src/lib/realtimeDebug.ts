/**
 * Realtime debug logging helpers.
 *
 * Realtime traffic (camera frames in, generated frames out, per-frame metrics)
 * runs at video rates and must not log per frame by default. This module
 * gates per-frame log lines behind a sampling rate that the user controls
 * from the Realtime page (see `RealtimeDebugStore`).
 *
 * Sampling is per channel: each call site passes a stable channel name and
 * gets its own counter, so a 1-in-100 rate emits one log per 100 calls per
 * channel rather than one per 100 across all channels.
 */
import { useRealtimeDebugStore } from "../stores/RealtimeDebugStore";

/**
 * WebSocket message types that occur on the per-frame realtime path. Logs
 * tagged with these types are sampled through `realtimeDebugLog`. Anything
 * not in this set keeps its existing logging behaviour.
 */
export const REALTIME_PER_FRAME_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "push_realtime_frame",
  "realtime_session_ack",
  "realtime_metrics",
  "realtime_video_frame",
  "realtime_frame_out",
  "realtime_inference_metrics",
  "realtime_analysis_event"
]);

export const isRealtimePerFrameMessageType = (
  type: string | undefined | null
): boolean => (typeof type === "string" ? REALTIME_PER_FRAME_MESSAGE_TYPES.has(type) : false);

const channelCounters = new Map<string, number>();

/**
 * Sampled debug logger for per-frame realtime call sites. Returns true when
 * the call actually logged so callers can branch on whether to compute
 * additional log payloads. Rate `0` disables the channel entirely.
 */
export const realtimeDebugLog = (channel: string, ...args: unknown[]): boolean => {
  const rate = useRealtimeDebugStore.getState().logRate;
  if (rate === 0) return false;

  const next = (channelCounters.get(channel) ?? 0) + 1;
  channelCounters.set(channel, next);

  if (rate === 1 || next % rate === 1) {
    // eslint-disable-next-line no-console
    console.debug(`[realtime:${channel}] (#${next})`, ...args);
    return true;
  }
  return false;
};

/** For tests and explicit reset paths. */
export const __resetRealtimeDebugCounters = (): void => {
  channelCounters.clear();
};
