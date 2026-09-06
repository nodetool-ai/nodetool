/**
 * PlayheadReadout — where the playhead is, in the units the ruler counts.
 *
 * In bars mode it reads bar.beat.tick against the document tempo; otherwise
 * it is the sequence timecode. The position advances ~60×/s during playback,
 * so the text is written through the playback store's transient channel
 * straight into the DOM — this component re-renders only when the mode, the
 * tempo or the frame rate changes.
 */

import React, { memo, useCallback, useEffect, useRef } from "react";

import { formatBarsBeats, resolveTempo } from "@nodetool-ai/timeline";
import type { TimelineTempo } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStoreApi } from "../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import type { RulerMode } from "../../stores/timeline/TimelineUIStore";
import { Caption, FlexRow } from "../ui_primitives";
import { formatTimecode } from "./Inspector/InspectorPrimitives.helpers";

const readoutSx = {
  fontFamily: "var(--fontFamily2)",
  fontVariantNumeric: "tabular-nums"
} as const;

const format = (
  timeMs: number,
  mode: RulerMode,
  tempo: TimelineTempo,
  fps: number
): string =>
  mode === "bars" ? formatBarsBeats(timeMs, tempo) : formatTimecode(timeMs, fps);

export const PlayheadReadout: React.FC = memo(() => {
  const rulerMode = useTimelineUIStore((s) => s.rulerMode);
  const tempo = useTimelineStore((s) => resolveTempo(s));
  const fps = useTimelineStore((s) => s.fps);
  const playbackStoreApi = useTimelinePlaybackStoreApi();

  const valueRef = useRef<HTMLElement>(null);
  const lastTextRef = useRef<string | null>(null);

  const apply = useCallback(
    (timeMs: number) => {
      const text = format(timeMs, rulerMode, tempo, fps);
      if (text === lastTextRef.current) return;
      lastTextRef.current = text;
      const node = valueRef.current;
      if (node) node.textContent = text;
    },
    [rulerMode, tempo, fps]
  );

  useEffect(() => {
    const api = playbackStoreApi;
    // The formatter changed under us, so the cached text is about to be wrong.
    lastTextRef.current = null;
    apply(api.getState().getTimeMs());
    return api.getState().subscribeTime(apply);
  }, [playbackStoreApi, apply]);

  return (
    <FlexRow gap={0.5} align="center" data-testid="timeline-playhead-readout">
      <Caption sx={readoutSx}>{rulerMode === "bars" ? "Bar" : "TC"}</Caption>
      <Caption
        component="span"
        ref={valueRef}
        sx={readoutSx}
        aria-live="off"
        aria-label="Playhead position"
      />
    </FlexRow>
  );
});

PlayheadReadout.displayName = "PlayheadReadout";

export default PlayheadReadout;
