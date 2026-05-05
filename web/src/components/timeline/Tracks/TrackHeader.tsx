/** @jsxImportSource @emotion/react */
/**
 * TrackHeader
 *
 * Left-hand strip showing track metadata and controls:
 *   - Track name (inline-editable on double-click)
 *   - Visibility toggle (eye icon)
 *   - Lock toggle
 *   - Mute / Solo toggles (audio tracks only)
 *   - Height resize handle at the bottom edge
 */

import React, { memo, useCallback, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";

import type { TimelineTrack } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { Tooltip } from "../../ui_primitives";

// ── Constants ──────────────────────────────────────────────────────────────

export const TRACK_HEADER_WIDTH_PX = 160;
const MIN_TRACK_HEIGHT_PX = 40;
const MAX_TRACK_HEIGHT_PX = 300;
const DEFAULT_TRACK_HEIGHT_PX = 64;
const RESIZE_HANDLE_HEIGHT_PX = 6;

// ── Styles ─────────────────────────────────────────────────────────────────

const headerStyles = (theme: Theme, heightPx: number) =>
  css({
    position: "relative",
    width: TRACK_HEADER_WIDTH_PX,
    height: heightPx,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: theme.spacing(0.5, 1),
    backgroundColor: theme.vars.palette.background.paper,
    borderRight: `1px solid ${theme.vars.palette.divider}`,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    overflow: "hidden",
    userSelect: "none"
  });

const nameInputStyles = (theme: Theme) =>
  css({
    border: "none",
    background: "transparent",
    color: theme.vars.palette.text.primary,
    fontSize: theme.typography.body2.fontSize,
    fontFamily: theme.typography.fontFamily,
    width: "100%",
    padding: 0,
    outline: "none",
    cursor: "default",
    "&:focus": {
      cursor: "text",
      borderBottom: `1px solid ${theme.vars.palette.primary.main}`
    }
  });

const controlsRowStyles = css({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: 4
});

const iconButtonStyles = (theme: Theme, active = true) =>
  css({
    background: "none",
    border: "none",
    padding: "2px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    color: active
      ? theme.vars.palette.text.primary
      : theme.vars.palette.text.disabled,
    borderRadius: 3,
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover
    },
    "& svg": {
      fontSize: 14
    }
  });

const resizeHandleStyles = (theme: Theme) =>
  css({
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: RESIZE_HANDLE_HEIGHT_PX,
    cursor: "ns-resize",
    backgroundColor: "transparent",
    "&:hover": {
      backgroundColor: theme.vars.palette.primary.main,
      opacity: 0.4
    }
  });

// ── Component ──────────────────────────────────────────────────────────────

export interface TrackHeaderProps {
  track: TimelineTrack;
}

export const TrackHeader: React.FC<TrackHeaderProps> = memo(({ track }) => {
  const theme = useTheme();

  const setTrackVisible = useTimelineStore((s) => s.setTrackVisible);
  const setTrackLocked = useTimelineStore((s) => s.setTrackLocked);
  const setTrackMuted = useTimelineStore((s) => s.setTrackMuted);
  const setTrackSolo = useTimelineStore((s) => s.setTrackSolo);
  const setTrackHeight = useTimelineStore((s) => s.setTrackHeight);
  const setTrackName = useTimelineStore((s) => s.setTrackName);

  const heightPx = track.heightPx ?? DEFAULT_TRACK_HEIGHT_PX;

  // ── Inline name edit ────────────────────────────────────────────────────

  const [editingName, setEditingName] = useState(false);
  const [localName, setLocalName] = useState(track.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleNameDoubleClick = useCallback(() => {
    setEditingName(true);
    setLocalName(track.name);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [track.name]);

  const commitName = useCallback(() => {
    setEditingName(false);
    if (localName.trim()) {
      setTrackName(track.id, localName.trim());
    }
  }, [localName, setTrackName, track.id]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitName();
      }
      if (e.key === "Escape") {
        setEditingName(false);
        setLocalName(track.name);
      }
    },
    [commitName, track.name]
  );

  // ── Height resize handle ────────────────────────────────────────────────

  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(heightPx);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartYRef.current = e.clientY;
      dragStartHeightRef.current = heightPx;
    },
    [heightPx]
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.buttons !== 1) {
        return;
      }
      const deltaY = e.clientY - dragStartYRef.current;
      const newHeight = Math.min(
        MAX_TRACK_HEIGHT_PX,
        Math.max(MIN_TRACK_HEIGHT_PX, dragStartHeightRef.current + deltaY)
      );
      setTrackHeight(track.id, newHeight);
    },
    [setTrackHeight, track.id]
  );

  const isAudioTrack = track.type === "audio";

  return (
    <div
      css={headerStyles(theme, heightPx)}
      data-testid={`track-header-${track.id}`}
    >
      {/* Track name */}
      <input
        ref={inputRef}
        css={nameInputStyles(theme)}
        value={editingName ? localName : track.name}
        readOnly={!editingName}
        onChange={(e) => setLocalName(e.target.value)}
        onDoubleClick={handleNameDoubleClick}
        onBlur={commitName}
        onKeyDown={handleNameKeyDown}
        aria-label={`Track name: ${track.name}`}
      />

      {/* Controls row */}
      <div css={controlsRowStyles}>
        <Tooltip title={track.visible ? "Hide track" : "Show track"}>
          <button
            css={iconButtonStyles(theme, track.visible)}
            onClick={() => setTrackVisible(track.id, !track.visible)}
            aria-label={track.visible ? "Hide track" : "Show track"}
            aria-pressed={!track.visible}
          >
            {track.visible ? (
              <VisibilityIcon />
            ) : (
              <VisibilityOffIcon />
            )}
          </button>
        </Tooltip>

        <Tooltip title={track.locked ? "Unlock track" : "Lock track"}>
          <button
            css={iconButtonStyles(theme, !track.locked)}
            onClick={() => setTrackLocked(track.id, !track.locked)}
            aria-label={track.locked ? "Unlock track" : "Lock track"}
            aria-pressed={track.locked}
          >
            {track.locked ? <LockIcon /> : <LockOpenIcon />}
          </button>
        </Tooltip>

        {isAudioTrack && (
          <>
            <Tooltip title={track.muted ? "Unmute" : "Mute"}>
              <button
                css={iconButtonStyles(theme, !track.muted)}
                onClick={() => setTrackMuted(track.id, !track.muted)}
                aria-label={track.muted ? "Unmute" : "Mute"}
                aria-pressed={!!track.muted}
              >
                {track.muted ? <VolumeOffIcon /> : <VolumeUpIcon />}
              </button>
            </Tooltip>

            <Tooltip title={track.solo ? "Unsolo" : "Solo"}>
              <button
                css={iconButtonStyles(theme, !!track.solo)}
                onClick={() => setTrackSolo(track.id, !track.solo)}
                aria-label={track.solo ? "Unsolo" : "Solo"}
                aria-pressed={!!track.solo}
              >
                <span style={{ fontSize: 11, fontWeight: 700 }}>S</span>
              </button>
            </Tooltip>
          </>
        )}
      </div>

      {/* Height resize handle */}
      <div
        css={resizeHandleStyles(theme)}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        aria-label="Resize track height"
        role="separator"
        aria-orientation="horizontal"
      />
    </div>
  );
});

TrackHeader.displayName = "TrackHeader";
