/**
 * ScriptLane — a time-aligned transcript lane in the timeline (Descript-style).
 *
 * Sits between the video and audio tracks: each transcript segment renders as a
 * phrase chip positioned by its word times, with "X.Xs" pause chips spanning the
 * silences between phrases. Shares the tracks' time axis (`msPerPx`) and native
 * horizontal scroll, so it stays aligned with the clips above and the waveform
 * below. Clicking a chip seeks the playhead and selects the chip's clip
 * (bidirectional with the tracks + the side panel); the word under the playhead
 * highlights during playback. Read/navigate only — editing stays in the panel.
 */

import React, { useMemo } from "react";
import { styled } from "@mui/material/styles";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import { MOTION } from "../../ui_primitives";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { buildTranscriptDoc } from "../../../stores/timeline/transcriptOps";
import { TRACK_HEADER_WIDTH_PX } from "./TrackHeader";

export const SCRIPT_LANE_HEIGHT_PX = 46;

/** Minimum silence (ms) between phrases that earns a visible pause chip. */
const PAUSE_MIN_MS = 350;

// ── Styles ──────────────────────────────────────────────────────────────────

const LaneRoot = styled("div")(({ theme }) => ({
  position: "relative",
  height: SCRIPT_LANE_HEIGHT_PX,
  flexShrink: 0,
  borderBottom: `1px solid ${theme.vars.palette.divider}`,
  background: theme.vars.palette.background.default,
  overflow: "hidden"
}));

const PhraseChip = styled("button")(({ theme }) => ({
  position: "absolute",
  top: 7,
  height: SCRIPT_LANE_HEIGHT_PX - 16,
  margin: 0,
  padding: "0 8px",
  display: "inline-flex",
  alignItems: "center",
  border: `1px solid ${theme.vars.palette.divider}`,
  borderRadius: 5,
  background: theme.vars.palette.action.hover,
  color: theme.vars.palette.text.secondary,
  fontSize: 12,
  lineHeight: 1,
  overflow: "hidden",
  cursor: "pointer",
  textAlign: "left",
  transition: `background-color ${MOTION.fast}, border-color ${MOTION.fast}`,
  // The word spans live inside one inline text box so inter-word spaces are
  // preserved (a flex container would otherwise strip whitespace between the
  // per-word flex items, running the text together).
  "& .phrase-text": {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  "&:hover": { borderColor: theme.vars.palette.text.disabled },
  "&.is-selected": {
    borderColor: theme.vars.palette.primary.main,
    background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.22)`,
    color: theme.vars.palette.text.primary
  },
  "&.is-active": { color: theme.vars.palette.text.primary },
  "&.is-draft": { fontStyle: "italic" },
  "& .w-active": {
    borderRadius: 3,
    padding: "0 1px",
    background: theme.vars.palette.primary.main,
    color: theme.vars.palette.primary.contrastText
  }
}));

const PauseChip = styled("div")(({ theme }) => ({
  position: "absolute",
  top: 7,
  height: SCRIPT_LANE_HEIGHT_PX - 16,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10,
  color: theme.vars.palette.text.disabled,
  fontVariantNumeric: "tabular-nums",
  pointerEvents: "none"
}));

const HeaderCell = styled("div")(({ theme }) => ({
  width: TRACK_HEADER_WIDTH_PX,
  height: SCRIPT_LANE_HEIGHT_PX,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 12px",
  borderBottom: `1px solid ${theme.vars.palette.divider}`,
  background: theme.vars.palette.background.paper,
  color: theme.vars.palette.text.secondary,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  "& svg": { fontSize: 15, color: theme.vars.palette.primary.main }
}));

// ── Header cell (for the header column) ───────────────────────────────────────

export const ScriptLaneHeader: React.FC = () => (
  <HeaderCell aria-label="Script lane">
    <GraphicEqIcon />
    SCRIPT
  </HeaderCell>
);

// ── Lane (for the scrollable lanes area) ──────────────────────────────────────

export const ScriptLane: React.FC = () => {
  const clips = useTimelineStore((s) => s.clips);
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const selectedClipIds = useTimelineUIStore((s) => s.selectedClipIds);
  const setSelection = useTimelineUIStore((s) => s.setSelection);
  const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);
  const seek = useTimelinePlaybackStore((s) => s.seek);

  const segments = useMemo(
    () => buildTranscriptDoc(clips).segments,
    [clips]
  );

  return (
    <LaneRoot style={{ width: "100%" }} data-testid="script-lane">
      {segments.map((seg, i) => {
        const prev = segments[i - 1];
        const gapMs = prev ? seg.startMs - prev.endMs : 0;
        const isSelected = seg.clipIds.some((id) => selectedClipIds.has(id));
        const isActive =
          currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs;
        const left = seg.startMs / msPerPx;
        const width = Math.max(10, (seg.endMs - seg.startMs) / msPerPx);

        return (
          <React.Fragment key={seg.id}>
            {gapMs >= PAUSE_MIN_MS && (
              <PauseChip
                style={{
                  left: prev.endMs / msPerPx,
                  width: gapMs / msPerPx
                }}
              >
                {(gapMs / 1000).toFixed(1)}s
              </PauseChip>
            )}
            <PhraseChip
              type="button"
              style={{ left, width }}
              className={[
                isSelected ? "is-selected" : "",
                isActive ? "is-active" : "",
                seg.isDraft ? "is-draft" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              title={
                seg.isDraft
                  ? seg.draftText
                  : seg.tokens.map((t) => t.text).join(" ")
              }
              data-testid="script-chip"
              data-segment={seg.id}
              onClick={() => {
                seek(seg.startMs);
                if (seg.clipIds.length > 0) setSelection(seg.clipIds);
              }}
            >
              <span className="phrase-text">
                {seg.isDraft
                  ? seg.draftText || "…"
                  : seg.tokens.map((t, ti) => (
                      <React.Fragment key={t.wordIndex}>
                        {ti > 0 ? " " : ""}
                        <span
                          className={
                            currentTimeMs >= t.startMs && currentTimeMs < t.endMs
                              ? "w-active"
                              : undefined
                          }
                        >
                          {t.text}
                        </span>
                      </React.Fragment>
                    ))}
              </span>
            </PhraseChip>
          </React.Fragment>
        );
      })}
    </LaneRoot>
  );
};
