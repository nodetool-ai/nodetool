/** @jsxImportSource @emotion/react */
/**
 * ClipLoopHandle
 *
 * The region-loop grip at the top-right corner of a midi or audio clip (CE3).
 * A drag here extends the clip and repeats its window until the pointer; the
 * plain edge below it still trims. The whole drag is one undo entry.
 *
 * `ClipLoopMarks` draws what a loop looks like on the clip body: the repeats
 * dimmed, with a notch at each repeat boundary.
 */
import React, { memo, useCallback, useRef } from "react";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { activeLoopMs, loopRepeatOffsets } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { MOTION, Z_INDEX } from "../../ui_primitives";
import {
  clearGestureFeedback,
  collectSnapCandidates,
  publishGestureFeedback,
  readoutFor,
  snapEdge,
  snapGridSpecFrom
} from "./clipSnap";

/** Side of the square corner grip. */
export const LOOP_HANDLE_SIZE_PX = 14;
/** Narrower clips have no room for the grip beside the trim edge. */
export const MIN_LOOP_HANDLE_CLIP_WIDTH_PX = 40;

/** Whether a clip type loops. */
export const canLoopClip = (clip: Pick<TimelineClip, "mediaType">): boolean =>
  clip.mediaType === "midi" || clip.mediaType === "audio";

const handleStyles = (theme: Theme, locked: boolean) =>
  css({
    position: "absolute",
    top: 0,
    right: 0,
    width: LOOP_HANDLE_SIZE_PX,
    height: LOOP_HANDLE_SIZE_PX,
    cursor: locked ? "not-allowed" : "col-resize",
    zIndex: Z_INDEX.base + 4,
    // A corner notch: the grip is the triangle in the clip's top-right.
    backgroundColor: theme.vars.palette.text.secondary,
    clipPath: "polygon(0 0, 100% 0, 100% 100%)",
    opacity: 0,
    transition: `opacity ${MOTION.fast}`,
    "&:hover": { backgroundColor: theme.vars.palette.primary.main }
  });

const marksStyles = css({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  overflow: "hidden",
  zIndex: Z_INDEX.base + 1
});

const dimStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.35)`
  });

const notchStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: `rgba(${theme.vars.palette.text.primaryChannel} / 0.35)`,
    "&::before": {
      content: '""',
      position: "absolute",
      top: 0,
      left: -4,
      borderLeft: "4.5px solid transparent",
      borderRight: "4.5px solid transparent",
      borderTop: `6px solid rgba(${theme.vars.palette.text.primaryChannel} / 0.7)`
    }
  });

interface ClipLoopMarksProps {
  clip: TimelineClip;
  msPerPx: number;
}

/** Dimmed repeats and a notch at each repeat boundary. Nothing for a plain clip. */
export const ClipLoopMarks: React.FC<ClipLoopMarksProps> = memo(
  ({ clip, msPerPx }) => {
    const theme = useTheme();
    const loopMs = activeLoopMs(clip);
    if (loopMs === undefined || msPerPx <= 0) return null;
    const offsets = loopRepeatOffsets(clip, loopMs).slice(1);
    const firstPx = loopMs / msPerPx;
    return (
      <div css={marksStyles} data-testid={`clip-loop-marks-${clip.id}`} aria-hidden>
        <div
          css={dimStyles(theme)}
          style={{ left: firstPx }}
          data-testid={`clip-loop-dim-${clip.id}`}
        />
        {offsets.map((offset, i) => (
          <div
            key={i}
            css={notchStyles(theme)}
            style={{ left: offset / msPerPx }}
            data-loop-notch
          />
        ))}
      </div>
    );
  }
);
ClipLoopMarks.displayName = "ClipLoopMarks";

interface ClipLoopHandleProps {
  clip: TimelineClip;
  msPerPx: number;
  interactionLocked: boolean;
}

interface LoopGesture {
  startX: number;
  endMsAtStart: number;
  windowMs: number;
  candidates: number[];
}

export const ClipLoopHandle: React.FC<ClipLoopHandleProps> = memo(
  ({ clip, msPerPx, interactionLocked }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const loopClipToEnd = useTimelineStore((s) => s.loopClipToEnd);
    const history = useTimelineHistoryBatch();
    const gestureRef = useRef<LoopGesture | null>(null);
    const clipId = clip.id;

    const onPointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (interactionLocked) return;
        // The grip owns the gesture: neither the trim edge nor the clip drag runs.
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const state = useTimelineStore.getState();
        const fresh = findClipById(state.clips, clipId);
        if (!fresh) return;
        const windowMs = activeLoopMs(fresh) ?? fresh.durationMs;
        // Repeat boundaries snap too, so a drag lands on whole repeats.
        const boundaries: number[] = [];
        for (let k = 1; k <= 256; k += 1) {
          boundaries.push(fresh.startMs + k * windowMs);
        }
        gestureRef.current = {
          startX: e.clientX,
          endMsAtStart: fresh.startMs + fresh.durationMs,
          windowMs,
          candidates: [
            ...collectSnapCandidates(
              state.clips,
              state.durationMs,
              useTimelinePlaybackStore.getState().getTimeMs(),
              new Set([clipId]),
              snapGridSpecFrom(state, useTimelineUIStore.getState())
            ),
            ...boundaries
          ]
        };
        history.begin();
      },
      [clipId, history, interactionLocked]
    );

    const onPointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const gesture = gestureRef.current;
        if (!gesture || interactionLocked || e.buttons !== 1) return;
        e.stopPropagation();
        const rawMs =
          gesture.endMsAtStart + (e.clientX - gesture.startX) * msPerPx;
        const snapped =
          e.altKey || !useTimelineUIStore.getState().snapEnabled
            ? { valueMs: rawMs, guideMs: null }
            : snapEdge(rawMs, gesture.candidates, msPerPx);
        loopClipToEnd(clipId, snapped.valueMs, gesture.windowMs);
        history.mark();
        const next = findClipById(useTimelineStore.getState().clips, clipId);
        if (next) {
          publishGestureFeedback(
            useTimelineUIStore.getState(),
            next.startMs + next.durationMs === snapped.valueMs
              ? snapped.guideMs
              : null,
            readoutFor(next, "trim-end")
          );
        }
      },
      [clipId, history, interactionLocked, loopClipToEnd, msPerPx]
    );

    const onPointerEnd = useCallback(() => {
      if (!gestureRef.current) return;
      gestureRef.current = null;
      clearGestureFeedback(useTimelineUIStore.getState());
      history.end();
    }, [history]);

    return (
      <div
        css={handleStyles(theme, interactionLocked)}
        data-clip-loop-handle
        data-clip-trim-handle
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        aria-label={t("i18n-next73.clip.loopHandle")}
        title={t("i18n-next73.clip.loopHandle")}
        data-testid={`clip-loop-handle-${clipId}`}
      />
    );
  }
);
ClipLoopHandle.displayName = "ClipLoopHandle";
