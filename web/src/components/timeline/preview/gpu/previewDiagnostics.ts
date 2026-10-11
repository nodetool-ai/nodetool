/**
 * Optional diagnostics consumed by the timeline performance fixture. Keeping
 * the sink on window avoids routing measurements through React state.
 */
export interface TimelinePreviewDiagnostic {
  kind:
    | "source-upload"
    | "compositor-submit"
    | "frame-presented"
    | "frame-late"
    | "decoder-open"
    | "decoder-restart"
    | "frames-open";
  at: number;
  sourceId?: string;
  width?: number;
  height?: number;
  mediaTime?: number;
  layerCount?: number;
  drawnLayers?: number;
  /** Source time the clock asked a decoded source for. */
  targetSec?: number;
  /** Timestamp of the decoded frame drawn for `targetSec`. */
  frameSec?: number;
  /** Newest decoded frame when a tick drew an older one. */
  newestSec?: number;
  /** `webcodecs` or `element`, for `decoder-open`. */
  implementation?: string;
  /** Why a clip fell back to the element path. */
  reason?: string;
  fromSec?: number;
  toSec?: number;
  /** Open `VideoFrame`s across all decoded sources. */
  count?: number;
}

/** Send one event to the perf sink, when a probe installed one. */
export function emitTimelinePreviewDiagnostic(
  event: Omit<TimelinePreviewDiagnostic, "at">
): void {
  const sink =
    typeof window === "undefined" ? undefined : window.__nodetoolTimelinePerf;
  if (sink) sink({ ...event, at: performance.now() });
}

declare global {
  interface Window {
    __nodetoolTimelinePerf?: (event: TimelinePreviewDiagnostic) => void;
  }
}
