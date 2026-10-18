/** @jsxImportSource @emotion/react */
/**
 * ChordLane — the row of a `chord` track in the tracks region. A chord track
 * holds chord regions instead of clips; the regions and their editing live in
 * `daw/harmony/ChordLaneBody`.
 */

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { TimelineTrack } from "@nodetool-ai/timeline";

import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelineLayoutStore } from "../../../stores/timeline/TimelineLayoutStore";
import { ChordLaneBody } from "../daw/harmony/ChordLaneBody";
import { trackRowHeightPx } from "./trackHeight";

const laneStyles = (theme: Theme, heightPx: number, visible: boolean) =>
  css({
    position: "relative",
    width: "100%",
    height: heightPx,
    flexShrink: 0,
    opacity: visible ? 1 : 0.55,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    overflow: "hidden"
  });

interface ChordLaneProps {
  track: TimelineTrack;
}

export const ChordLane: React.FC<ChordLaneProps> = memo(({ track }) => {
  const theme = useTheme();
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const verticalZoom = useTimelineUIStore((s) => s.verticalZoom);
  const dawMode = useTimelineLayoutStore((s) => s.dawMode);
  const heightPx = trackRowHeightPx(track, dawMode) * verticalZoom;
  const laneCss = useMemo(() => laneStyles(theme, heightPx, track.visible), [theme, heightPx, track.visible]);
  return (
    <div css={laneCss} data-testid={`chord-lane-${track.id}`} data-track-lane-id={track.id}>
      <ChordLaneBody track={track} msPerPx={msPerPx} />
    </div>
  );
});

ChordLane.displayName = "ChordLane";
