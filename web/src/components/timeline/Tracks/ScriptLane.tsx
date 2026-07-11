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

import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { styled } from "@mui/material/styles";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import { useShallow } from "zustand/react/shallow";
import { MOTION, BORDER_RADIUS, FONT_SIZE_SANS, FONT_SIZE_MONO, FONT_WEIGHT, SPACING, getSpacingPx } from "../../ui_primitives";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelinePlaybackStore";
import {
  buildTranscriptDoc,
  isTranscriptClip,
  type TranscriptSegment
} from "../../../stores/timeline/transcriptOps";
import { TRACK_HEADER_WIDTH_PX } from "./TrackHeader";

export const SCRIPT_LANE_HEIGHT_PX = 46;

/** Minimum silence (ms) between phrases that earns a visible pause chip. */
const PAUSE_MIN_MS = 350;

const LaneRoot = styled("div")(({ theme }) => ({
  position: "relative",
  height: SCRIPT_LANE_HEIGHT_PX,
  flexShrink: 0,
  borderBottom: `1px solid ${theme.vars.palette.divider}`,
  background: theme.vars.palette.background.default,
  overflow: "hidden"
}));

const PhraseChipRoot = styled("button")(({ theme }) => ({
  position: "absolute",
  top: 7,
  height: SCRIPT_LANE_HEIGHT_PX - 16,
  margin: 0,
  padding: `0 ${getSpacingPx(SPACING.md)}`,
  display: "inline-flex",
  alignItems: "center",
  border: `1px solid ${theme.vars.palette.divider}`,
  borderRadius: BORDER_RADIUS.md,
  background: theme.vars.palette.action.hover,
  color: theme.vars.palette.text.secondary,
  fontSize: FONT_SIZE_SANS.label,
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
    borderRadius: BORDER_RADIUS.xs,
    padding: `0 ${getSpacingPx(SPACING.micro)}`, // was 0 1px
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
  fontSize: FONT_SIZE_MONO.caption,
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
  gap: getSpacingPx(SPACING.sm),
  padding: `0 ${getSpacingPx(SPACING.lg)}`,
  borderBottom: `1px solid ${theme.vars.palette.divider}`,
  background: theme.vars.palette.background.paper,
  color: theme.vars.palette.text.secondary,
  fontSize: FONT_SIZE_SANS.caption,
  fontWeight: FONT_WEIGHT.semibold,
  letterSpacing: "0.06em",
  "& svg": { fontSize: 15, color: theme.vars.palette.primary.main }
}));

export const ScriptLaneHeader: React.FC = () => (
  <HeaderCell aria-label="Script lane">
    <GraphicEqIcon />
    SCRIPT
  </HeaderCell>
);

/** A time span with a stable identity, sorted ascending and non-overlapping. */
interface TimedKey {
  key: string;
  startMs: number;
  endMs: number;
}

/** Binary-search the entry spanning `timeMs` (`start <= timeMs < end`), or null. */
function findActiveRange<T extends TimedKey>(ranges: T[], timeMs: number): T | null {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (timeMs < r.startMs) hi = mid - 1;
    else if (timeMs >= r.endMs) lo = mid + 1;
    else return r;
  }
  return null;
}

/** Precomputed per-segment render inputs (F5c: avoids recomputing `title` per render). */
interface ScriptChipView {
  segment: TranscriptSegment;
  gapMs: number;
  prevEndMs: number | undefined;
  title: string;
}

interface PhraseChipProps {
  view: ScriptChipView;
  msPerPx: number;
  isSelected: boolean;
  onSelect: (segment: TranscriptSegment) => void;
  registerChipEl: (id: string, el: HTMLButtonElement | null) => void;
  registerWordEl: (key: string, el: HTMLElement | null) => void;
}

/**
 * One phrase chip (plus its leading pause chip, if any). Memoized on the
 * segment's own identity so an edit to one paragraph doesn't re-render every
 * other chip — segments keep their identity across unrelated store publishes
 * (`buildTranscriptDoc` is cached; `ScriptLane` only recomputes it when the
 * transcript-relevant clip subset actually changes).
 */
const PhraseChip: React.FC<PhraseChipProps> = memo(function PhraseChip({
  view,
  msPerPx,
  isSelected,
  onSelect,
  registerChipEl,
  registerWordEl
}) {
  const { segment: seg, gapMs, prevEndMs, title } = view;
  const left = seg.startMs / msPerPx;
  const width = Math.max(10, (seg.endMs - seg.startMs) / msPerPx);

  return (
    <React.Fragment>
      {gapMs >= PAUSE_MIN_MS && prevEndMs !== undefined && (
        <PauseChip
          style={{
            left: prevEndMs / msPerPx,
            width: gapMs / msPerPx
          }}
        >
          {(gapMs / 1000).toFixed(1)}s
        </PauseChip>
      )}
      <PhraseChipRoot
        ref={(el) => registerChipEl(seg.id, el)}
        type="button"
        style={{ left, width }}
        className={[isSelected ? "is-selected" : "", seg.isDraft ? "is-draft" : ""]
          .filter(Boolean)
          .join(" ")}
        title={title}
        data-testid="script-chip"
        data-segment={seg.id}
        onClick={() => onSelect(seg)}
      >
        <span className="phrase-text">
          {seg.isDraft
            ? seg.draftText || "…"
            : seg.tokens.map((t, ti) => (
                <React.Fragment key={t.wordIndex}>
                  {ti > 0 ? " " : ""}
                  <span
                    ref={(el) => registerWordEl(`${seg.id}:${ti}`, el)}
                    data-start={t.startMs}
                    data-end={t.endMs}
                  >
                    {t.text}
                  </span>
                </React.Fragment>
              ))}
        </span>
      </PhraseChipRoot>
    </React.Fragment>
  );
});

export const ScriptLane: React.FC = () => {
  // Only the transcript/caption-bearing subset — untouched clips (B-roll,
  // music) keep their identity across store publishes, so `useShallow`
  // returns the SAME array reference for those publishes and the `segments`
  // memo below skips recomputing entirely for a B-roll drag.
  const clips = useTimelineStore(useShallow((s) => s.clips.filter(isTranscriptClip)));
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const selectedClipIds = useTimelineUIStore((s) => s.selectedClipIds);
  const setSelection = useTimelineUIStore((s) => s.setSelection);
  const playbackApi = useTimelinePlaybackStoreApi();

  // Chip view models plus the two sorted lookup tables the highlight effect
  // binary-searches — all derived from `segments` in one pass so `title` and
  // the ranges never redo the `buildTranscriptDoc` walk.
  const { chipViews, segmentRanges, wordRanges } = useMemo(() => {
    const segments = buildTranscriptDoc(clips).segments;
    const chipViews: ScriptChipView[] = [];
    const segmentRanges: TimedKey[] = [];
    const wordRanges: TimedKey[] = [];

    segments.forEach((seg, i) => {
      const prev = segments[i - 1];
      const gapMs = prev ? seg.startMs - prev.endMs : 0;
      const title = seg.isDraft ? seg.draftText : seg.tokens.map((t) => t.text).join(" ");
      chipViews.push({ segment: seg, gapMs, prevEndMs: prev?.endMs, title });
      segmentRanges.push({ key: seg.id, startMs: seg.startMs, endMs: seg.endMs });
      seg.tokens.forEach((t, ti) => {
        wordRanges.push({ key: `${seg.id}:${ti}`, startMs: t.startMs, endMs: t.endMs });
      });
    });

    return { chipViews, segmentRanges, wordRanges };
  }, [clips]);

  // DOM refs for the imperative highlight — populated by the chips' callback
  // refs, so applying the highlight is a Map lookup, never a DOM query.
  const chipElsRef = useRef(new Map<string, HTMLButtonElement>());
  const wordElsRef = useRef(new Map<string, HTMLElement>());
  const registerChipEl = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) chipElsRef.current.set(id, el);
    else chipElsRef.current.delete(id);
  }, []);
  const registerWordEl = useCallback((key: string, el: HTMLElement | null) => {
    if (el) wordElsRef.current.set(key, el);
    else wordElsRef.current.delete(key);
  }, []);

  const onSelect = useCallback(
    (segment: TranscriptSegment) => {
      playbackApi.getState().seek(segment.startMs);
      if (segment.clipIds.length > 0) setSelection(segment.clipIds);
    },
    [playbackApi, setSelection]
  );

  // The active word/segment highlight, driven off the transient time channel
  // instead of the reactive `currentTimeMs` (which is frozen during playback
  // — it only updates on discrete seek/scrub/stop — so the old reactive
  // version never lit up while actually playing). Subscribes once per
  // `segmentRanges`/`wordRanges` identity change and toggles classes only when
  // the active id changes, via the ref Maps above (no DOM query per tick).
  useEffect(() => {
    let lastSegmentId: string | null = null;
    let lastWordKey: string | null = null;

    const applyHighlight = (timeMs: number): void => {
      const segId = findActiveRange(segmentRanges, timeMs)?.key ?? null;
      if (segId !== lastSegmentId) {
        if (lastSegmentId) chipElsRef.current.get(lastSegmentId)?.classList.remove("is-active");
        if (segId) chipElsRef.current.get(segId)?.classList.add("is-active");
        lastSegmentId = segId;
      }

      const wordKey = findActiveRange(wordRanges, timeMs)?.key ?? null;
      if (wordKey !== lastWordKey) {
        if (lastWordKey) wordElsRef.current.get(lastWordKey)?.classList.remove("w-active");
        if (wordKey) wordElsRef.current.get(wordKey)?.classList.add("w-active");
        lastWordKey = wordKey;
      }
    };

    applyHighlight(playbackApi.getState().getTimeMs());
    return playbackApi.getState().subscribeTime(applyHighlight);
  }, [playbackApi, segmentRanges, wordRanges]);

  return (
    <LaneRoot style={{ width: "100%" }} data-testid="script-lane">
      {chipViews.map((view) => (
        <PhraseChip
          key={view.segment.id}
          view={view}
          msPerPx={msPerPx}
          isSelected={view.segment.clipIds.some((id) => selectedClipIds.has(id))}
          onSelect={onSelect}
          registerChipEl={registerChipEl}
          registerWordEl={registerWordEl}
        />
      ))}
    </LaneRoot>
  );
};
