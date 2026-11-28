/** @jsxImportSource @emotion/react */
/**
 * The value of an automated parameter at the playhead, read-only. It follows
 * the transient playhead channel, so playback does not re-render the header.
 */

import React, { memo, useEffect, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  automationModeOf,
  automationModePlays,
  automationValueAt,
  findAutomationLane,
  type TimelineTrack
} from "@nodetool-ai/timeline";

import { useTimelinePlaybackStoreApi } from "../../../../stores/timeline/TimelineInstance";
import { useAutomationLiveValue } from "../../../../stores/timeline/automationRecorder";
import { BORDER_RADIUS, CONTROL, FONT_SIZE_MONO, SPACING, getSpacingPx } from "../../../ui_primitives";
import type { AutomationTargetSpec } from "./automationTargets";

const readoutStyles = (theme: Theme, color: string) =>
  css({
    flex: "0 0 auto",
    minWidth: 0,
    height: CONTROL.height.xs,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: `0 ${getSpacingPx(SPACING.sm)}`,
    borderRadius: BORDER_RADIUS.sm,
    background: theme.vars.palette.action.hover,
    color,
    fontSize: FONT_SIZE_MONO.caption,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap"
  });

interface Props {
  track: TimelineTrack;
  spec: AutomationTargetSpec;
  /** CSS color of the text: the parameter color. */
  color: string;
}

export const AutomationValueReadout: React.FC<Props> = memo(({ track, spec, color }) => {
  const theme = useTheme();
  const playback = useTimelinePlaybackStoreApi();
  const lane = findAutomationLane(track, spec.target);
  const plays = lane !== undefined && lane.enabled !== false && automationModePlays(automationModeOf(track));
  const points = lane?.points;
  const mixerParam = spec.target.kind === "mixer" ? spec.target.param : null;
  const live = useAutomationLiveValue(track.id, mixerParam);

  // The playhead text is written to the DOM node: a re-render per frame for
  // every readout would cost more than the text.
  const textRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = textRef.current;
    if (!node) return undefined;
    if (live !== undefined) {
      node.textContent = spec.format(live);
      return undefined;
    }
    const update = (timeMs: number) => {
      const next = spec.format(
        plays && points && points.length > 0 ? automationValueAt(points, timeMs, spec.value) : spec.value
      );
      if (node.textContent !== next) node.textContent = next;
    };
    update(playback.getState().getTimeMs());
    return playback.getState().subscribeTime(update);
  }, [playback, spec, plays, points, live]);

  return (
    <span ref={textRef} css={readoutStyles(theme, color)} data-testid={`automation-value-${track.id}`}>
      {spec.format(spec.value)}
    </span>
  );
});

AutomationValueReadout.displayName = "AutomationValueReadout";
