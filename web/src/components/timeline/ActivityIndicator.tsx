/** @jsxImportSource @emotion/react */
/**
 * ActivityIndicator
 *
 * Shows the number of clips currently generating or failed in the timeline
 * editor's TopBar activity slot (PRD §NOD-311).
 *
 * Behaviour:
 *  - Shows two count badges: one for active generations, one for failures.
 *  - Clicking either badge opens a Popover listing the affected clips with
 *    click-to-select behaviour (selects the clip in TimelineUIStore).
 *  - Zero counts are hidden.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  FlexRow,
  FlexColumn,
  Caption,
  StatusIndicator,
  Popover
} from "../ui_primitives";
import {
  useGeneratingClipIds,
  useFailedClipIds
} from "../../stores/timeline/TimelineGenerationStore";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";

// ── Styles ─────────────────────────────────────────────────────────────────

const badgeButtonStyles = (theme: Theme) =>
  css({
    cursor: "pointer",
    borderRadius: theme.rounded.xs,
    padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
    border: "none",
    background: "transparent",
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`
    }
  });

const popoverContentStyles = (theme: Theme) =>
  css({
    minWidth: 200,
    maxWidth: 320,
    padding: theme.spacing(1)
  });

const clipRowStyles = (theme: Theme) =>
  css({
    padding: theme.spacing(0.5, 1),
    borderRadius: theme.rounded.xs,
    cursor: "pointer",
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover
    }
  });

// ── Sub-component: popover clip list ───────────────────────────────────────

interface ClipListPopoverProps {
  clipIds: string[];
  title: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

const ClipListPopover: React.FC<ClipListPopoverProps> = memo(
  ({ clipIds, title, anchorEl, onClose }) => {
    const theme = useTheme();
    const clips = useTimelineStore((s) => s.clips);
    const selectClip = useTimelineUIStore((s) => s.selectClip);

    const handleSelectClip = useCallback(
      (clipId: string) => {
        selectClip(clipId);
        onClose();
      },
      [selectClip, onClose]
    );

    const affectedClips = useMemo(
      () => clips.filter((c) => clipIds.includes(c.id)),
      [clips, clipIds]
    );

    return (
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={onClose}
        placement="bottom-right"
      >
        <FlexColumn css={popoverContentStyles(theme)} gap={0.5}>
          <Caption color="secondary" sx={{ pb: 0.5 }}>
            {title}
          </Caption>

          {affectedClips.length === 0 ? (
            <Caption color="secondary">No clips</Caption>
          ) : (
            affectedClips.map((clip) => (
              <FlexRow
                key={clip.id}
                css={clipRowStyles(theme)}
                align="center"
                gap={1}
                onClick={() => handleSelectClip(clip.id)}
                role="button"
                tabIndex={0}
                aria-label={`Select clip: ${clip.name}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectClip(clip.id);
                  }
                }}
              >
                <Caption>{clip.name || clip.id}</Caption>
              </FlexRow>
            ))
          )}
        </FlexColumn>
      </Popover>
    );
  }
);

ClipListPopover.displayName = "ClipListPopover";

// ── Main component ─────────────────────────────────────────────────────────

export const ActivityIndicator: React.FC = memo(() => {
  const theme = useTheme();

  const generatingIds = useGeneratingClipIds();
  const failedIds = useFailedClipIds();

  const generatingCount = generatingIds.length;
  const failedCount = failedIds.length;

  const generatingAnchorRef = useRef<HTMLButtonElement>(null);
  const failedAnchorRef = useRef<HTMLButtonElement>(null);

  const [generatingPopoverEl, setGeneratingPopoverEl] =
    useState<HTMLElement | null>(null);
  const [failedPopoverEl, setFailedPopoverEl] =
    useState<HTMLElement | null>(null);

  const handleGeneratingClick = useCallback(() => {
    setGeneratingPopoverEl(generatingAnchorRef.current);
  }, []);

  const handleFailedClick = useCallback(() => {
    setFailedPopoverEl(failedAnchorRef.current);
  }, []);

  const handleGeneratingClose = useCallback(() => {
    setGeneratingPopoverEl(null);
  }, []);

  const handleFailedClose = useCallback(() => {
    setFailedPopoverEl(null);
  }, []);

  if (generatingCount === 0 && failedCount === 0) {
    return null;
  }

  return (
    <FlexRow gap={0.5} align="center">
      {generatingCount > 0 && (
        <>
          <button
            type="button"
            ref={generatingAnchorRef}
            css={badgeButtonStyles(theme)}
            onClick={handleGeneratingClick}
            aria-haspopup="true"
            aria-expanded={Boolean(generatingPopoverEl)}
            aria-label={`${generatingCount} clip${generatingCount !== 1 ? "s" : ""} generating`}
          >
            <StatusIndicator
              status="pending"
              pulse
              size="small"
            />
            <Caption>
              {generatingCount} generating
            </Caption>
          </button>

          <ClipListPopover
            clipIds={generatingIds}
            title={`${generatingCount} clip${generatingCount !== 1 ? "s" : ""} generating`}
            anchorEl={generatingPopoverEl}
            onClose={handleGeneratingClose}
          />
        </>
      )}

      {failedCount > 0 && (
        <>
          <button
            type="button"
            ref={failedAnchorRef}
            css={badgeButtonStyles(theme)}
            onClick={handleFailedClick}
            aria-haspopup="true"
            aria-expanded={Boolean(failedPopoverEl)}
            aria-label={`${failedCount} clip${failedCount !== 1 ? "s" : ""} failed`}
          >
            <StatusIndicator
              status="error"
              size="small"
            />
            <Caption color="error">
              {failedCount} failed
            </Caption>
          </button>

          <ClipListPopover
            clipIds={failedIds}
            title={`${failedCount} clip${failedCount !== 1 ? "s" : ""} failed`}
            anchorEl={failedPopoverEl}
            onClose={handleFailedClose}
          />
        </>
      )}
    </FlexRow>
  );
});

ActivityIndicator.displayName = "ActivityIndicator";
