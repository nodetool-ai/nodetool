import { createLogger } from "@nodetool/config";

const log = createLogger("nodetool.websocket.realtime-egress-policy");

export type VideoSinkEgressTarget = {
  nodeId: string;
  handle: string;
};

function truthyEnv(value: string | undefined): boolean {
  if (value == null || value === "") {
    return false;
  }
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Limits how many VideoSink outputs receive full `realtime_frame_out` payloads per session.
 *
 * Multiple sinks multiply wire bandwidth (~30 Hz × N sinks blows past Phase R budgets).
 * Default: send **one** sink unless overridden.
 *
 * - `NODETOOL_REALTIME_FULL_MULTI_SINK_EGRESS=1` — no cap (legacy / multi-preview).
 * - `NODETOOL_REALTIME_MAX_VIDEO_SINK_EGRESS=<n>` — send at most **n** sinks (≥ 1).
 */
export function applyVideoSinkEgressCap(
  sinks: VideoSinkEgressTarget[]
): VideoSinkEgressTarget[] {
  if (sinks.length <= 1) {
    return sinks;
  }
  if (truthyEnv(process.env.NODETOOL_REALTIME_FULL_MULTI_SINK_EGRESS)) {
    return sinks;
  }
  const raw = process.env.NODETOOL_REALTIME_MAX_VIDEO_SINK_EGRESS;
  let max =
    raw === undefined || raw === ""
      ? 1
      : Number.parseInt(raw, 10);
  if (!Number.isFinite(max) || max < 1) {
    max = 1;
  }
  max = Math.min(max, sinks.length);
  if (max >= sinks.length) {
    return sinks;
  }
  log.warn(
    "Realtime egress: multiple VideoSink nodes — limiting binary frame sends for throughput",
    {
      sinkCount: sinks.length,
      cappedTo: max,
      hint: "Set NODETOOL_REALTIME_FULL_MULTI_SINK_EGRESS=1 for every sink, or raise NODETOOL_REALTIME_MAX_VIDEO_SINK_EGRESS."
    }
  );
  return sinks.slice(0, max);
}
