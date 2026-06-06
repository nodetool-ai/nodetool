/** @jsxImportSource @emotion/react */
/**
 * TimelinePlayer — standalone, self-loading timeline viewer.
 *
 * Wraps {@link PreviewArea} (the viewport compositor + transport controls) in
 * its own {@link TimelineProvider} instance and loads the requested sequence
 * into that instance's stores. Unlike {@link TimelineEditor} it renders no
 * tracks, inspector, or top bar — just the player, full-bleed.
 *
 * Self-contained: pass a `sequenceId` and it fetches + plays. Use it as the
 * View-mode surface of a timeline tab, or embed it anywhere a read-only preview
 * of a sequence is needed.
 */

import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

import { EmptyState, FlexColumn, LoadingSpinner } from "../ui_primitives";

import { TimelineProvider } from "../../stores/timeline/TimelineInstance";
import { useTimeline } from "../../hooks/useTimelineSequence";
import { useLoadTimelineIntoStore } from "../../hooks/timeline/useLoadTimelineIntoStore";
import { PreviewArea } from "./preview/PreviewArea";

const containerStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default,
    alignItems: "center",
    justifyContent: "center"
  });

export interface TimelinePlayerProps {
  /** Sequence id to load and play. */
  sequenceId?: string;
  /**
   * Whether this surface is the focused/visible one. Drives which instance
   * receives imperative playback actions. Defaults to `true`.
   */
  active?: boolean;
}

const TimelinePlayerBody: React.FC<Omit<TimelinePlayerProps, "active">> = memo(
  ({ sequenceId }) => {
    const theme = useTheme();
    const { data: sequence, isLoading, isError } = useTimeline(sequenceId);

    // Mirror the fetched sequence into this instance's TimelineStore so the
    // store-bound PreviewArea renders its content.
    useLoadTimelineIntoStore(sequence);

    const unavailable = !isLoading && (isError || !sequence);

    return (
      <FlexColumn fullWidth fullHeight css={containerStyles(theme)}>
        {isLoading ? (
          <LoadingSpinner text="Loading sequence…" />
        ) : unavailable ? (
          <EmptyState
            variant="error"
            title="Sequence not found"
            description="The timeline sequence you requested does not exist or you do not have access to it."
          />
        ) : (
          <PreviewArea
            fps={sequence?.fps ?? 30}
            sequenceWidth={sequence?.width ?? 1920}
            sequenceHeight={sequence?.height ?? 1080}
          />
        )}
      </FlexColumn>
    );
  }
);

TimelinePlayerBody.displayName = "TimelinePlayerBody";

/**
 * Wraps the player body in a {@link TimelineProvider} so each instance gets its
 * own isolated stores (document, playback, UI) — letting a viewer coexist with
 * an editor of the same or a different sequence.
 */
export const TimelinePlayer: React.FC<TimelinePlayerProps> = ({
  active = true,
  ...bodyProps
}) => (
  <TimelineProvider active={active}>
    <TimelinePlayerBody {...bodyProps} />
  </TimelineProvider>
);

TimelinePlayer.displayName = "TimelinePlayer";

export default TimelinePlayer;
