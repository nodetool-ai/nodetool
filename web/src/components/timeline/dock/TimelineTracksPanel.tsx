import React, { memo, useEffect, useRef, useState } from "react";

import { FlexColumn } from "../../ui_primitives";
import { TracksRegion } from "../Tracks/TracksRegion";
import { PianoRollPanel } from "../pianoRoll/PianoRollPanel";

/** Height the tracks get before the first layout measurement. */
const FALLBACK_TRACKS_HEIGHT_PX = 240;

/**
 * The dock's Timeline panel: the tracks fill the panel and the piano roll
 * stacks under them when a MIDI clip is open. `TracksRegion` takes a height in
 * px, so the slot it sits in is measured.
 */
export const TimelineTracksPanel: React.FC<{ onGenerate?: () => void }> = memo(({ onGenerate }) => {
  const slot = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(FALLBACK_TRACKS_HEIGHT_PX);
  useEffect(() => {
    const node = slot.current;
    if (!node) { return; }
    const update = (): void => { if (node.clientHeight > 0) { setHeight(node.clientHeight); } };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <FlexColumn fullWidth sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <FlexColumn ref={slot} fullWidth sx={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}>
        <TracksRegion heightPx={height} onGenerate={onGenerate} />
      </FlexColumn>
      <PianoRollPanel />
    </FlexColumn>
  );
});
TimelineTracksPanel.displayName = "TimelineTracksPanel";
