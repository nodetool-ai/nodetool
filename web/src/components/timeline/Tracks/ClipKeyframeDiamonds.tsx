/** @jsxImportSource @emotion/react */
/**
 * A clip's hand-set keyframes, drawn as diamonds along its bottom edge.
 * Click one to put the playhead on it; drag one sideways to retime every
 * property keyed at that instant, as Premiere does with a clip's keyframes
 * on the timeline.
 */
import React, { memo, useCallback, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { Z_INDEX } from "../../ui_primitives";

/** Pointer travel (px) before a press on a diamond becomes a drag. */
const DRAG_SLOP_PX = 3;

const diamondStyles = (theme: Theme) =>
  css({
    position: "absolute",
    bottom: 2,
    width: 7,
    height: 7,
    marginLeft: -3.5,
    transform: "rotate(45deg)",
    background: theme.vars.palette.primary.main,
    border: `1px solid ${theme.vars.palette.background.paper}`,
    cursor: "ew-resize",
    padding: 0,
    zIndex: Z_INDEX.base + 3,
    "&:disabled": {
      cursor: "pointer"
    },
    // 7px is too small to hit reliably; widen the target, not the diamond,
    // the same way the fade handles do.
    "&::after": {
      content: '""',
      position: "absolute",
      inset: -6
    }
  });

interface DragState {
  pointerId: number;
  fromMs: number;
  toMs: number;
  startX: number;
  moved: boolean;
}

interface ClipKeyframeDiamondsProps {
  clipId: string;
  durationMs: number;
  msPerPx: number;
  /** Clip-relative times of hand-set keyframes. */
  timesMs: readonly number[];
  /** A locked clip shows its keyframes and seeks to them, but none move. */
  locked: boolean;
  formatTime: (clipRelativeMs: number) => string;
  onSeek: (clipRelativeMs: number) => void;
  onMove: (fromMs: number, toMs: number) => void;
}

export const ClipKeyframeDiamonds: React.FC<ClipKeyframeDiamondsProps> = memo(
  ({ clipId, durationMs, msPerPx, timesMs, locked, formatTime, onSeek, onMove }) => {
    const theme = useTheme();
    const [drag, setDrag] = useState<DragState | null>(null);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>, t: number) => {
        // The clip's own drag must not start under a diamond.
        e.stopPropagation();
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDrag({ pointerId: e.pointerId, fromMs: t, toMs: t, startX: e.clientX, moved: false });
      },
      []
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!drag || e.pointerId !== drag.pointerId || locked) return;
        const dx = e.clientX - drag.startX;
        const moved = drag.moved || Math.abs(dx) > DRAG_SLOP_PX;
        if (!moved) return;
        const toMs = Math.max(0, Math.min(durationMs, drag.fromMs + dx * msPerPx));
        setDrag({ ...drag, moved, toMs });
      },
      [drag, durationMs, locked, msPerPx]
    );

    const handlePointerUp = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        e.stopPropagation();
        setDrag(null);
        if (drag.moved && Math.abs(drag.toMs - drag.fromMs) > 0.5) {
          onMove(drag.fromMs, drag.toMs);
        } else {
          onSeek(drag.fromMs);
        }
      },
      [drag, onMove, onSeek]
    );

    return (
      <>
        {timesMs.map((t) => {
          const shown = drag && drag.fromMs === t ? drag.toMs : t;
          return (
            <button
              key={t}
              type="button"
              css={diamondStyles(theme)}
              style={{ left: shown / msPerPx }}
              aria-label={`Keyframe at ${formatTime(t)}`}
              title={locked ? undefined : "Drag to move this keyframe"}
              data-testid={`clip-keyframe-${clipId}`}
              data-playhead-passthrough
              onPointerDown={(e) => handlePointerDown(e, t)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => setDrag(null)}
              onClick={(e) => {
                e.stopPropagation();
                // Pointer presses resolve on pointerup; this is the keyboard path.
                if (e.detail === 0) onSeek(t);
              }}
            />
          );
        })}
      </>
    );
  }
);
ClipKeyframeDiamonds.displayName = "ClipKeyframeDiamonds";
