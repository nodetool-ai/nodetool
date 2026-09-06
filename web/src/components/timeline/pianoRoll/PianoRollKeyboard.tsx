/** @jsxImportSource @emotion/react */
/**
 * The keyboard column down the left of the piano roll.
 *
 * Drawn on a canvas rather than built from 128 elements: it scrolls in lock
 * step with the note grid, so a DOM row per semitone would be 128 nodes
 * repositioned on every wheel tick. Clicking a key auditions it through the
 * track's own voice, which is how you find a pitch before you write it.
 */

import React, { memo, useCallback, useEffect, useRef } from "react";
import { css } from "@emotion/react";
import { useColorScheme, useTheme } from "@mui/material/styles";

import type { MidiInstrument } from "@nodetool-ai/timeline";

import { playAuditionNote } from "../preview/audition";
import { pickPianoRollColors } from "./pianoRollColors";
import {
  isBlackKey,
  pitchName,
  pitchToY,
  yToPitch,
  type PianoRollGeometry
} from "./pianoRollGeometry";

/** Width of the keyboard column. */
export const KEYBOARD_WIDTH_PX = 56;
/** A black key is drawn short, the way it sits on a real keyboard. */
const BLACK_KEY_WIDTH_RATIO = 0.62;
/** A row narrower than this has no room for a name. */
const MIN_LABEL_ROW_HEIGHT_PX = 9;

const canvasStyles = css({
  display: "block",
  width: "100%",
  cursor: "pointer",
  touchAction: "none"
});

interface PianoRollKeyboardProps {
  geometry: PianoRollGeometry;
  heightPx: number;
  instrument: MidiInstrument | undefined;
}

export const PianoRollKeyboard: React.FC<PianoRollKeyboardProps> = memo(
  ({ geometry, heightPx, instrument }) => {
    const theme = useTheme();
    const { mode, systemMode } = useColorScheme();
    const activeMode = (mode === "system" ? systemMode : mode) ?? "dark";
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || heightPx <= 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const colors = pickPianoRollColors(
        theme,
        activeMode === "light" ? "light" : "dark"
      );
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      canvas.width = KEYBOARD_WIDTH_PX * dpr;
      canvas.height = heightPx * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = colors.whiteRow;
      ctx.fillRect(0, 0, KEYBOARD_WIDTH_PX, heightPx);

      const rows = Math.ceil(heightPx / geometry.rowHeightPx) + 1;
      ctx.textBaseline = "middle";
      ctx.font = "9px var(--fontFamily2), monospace";
      for (let row = 0; row < rows; row++) {
        const pitch = geometry.topPitch - row;
        if (pitch < 0 || pitch > 127) continue;
        const y = pitchToY(pitch, geometry);
        if (isBlackKey(pitch)) {
          ctx.fillStyle = colors.noteSelected;
          ctx.fillRect(
            0,
            y,
            KEYBOARD_WIDTH_PX * BLACK_KEY_WIDTH_RATIO,
            geometry.rowHeightPx
          );
        }
        ctx.strokeStyle = colors.gridLine;
        ctx.beginPath();
        ctx.moveTo(0, y + geometry.rowHeightPx + 0.5);
        ctx.lineTo(KEYBOARD_WIDTH_PX, y + geometry.rowHeightPx + 0.5);
        ctx.stroke();
        // Only C is labelled: every row named turns the column into a wall of
        // text, and C is what you count octaves from.
        if (pitch % 12 === 0 && geometry.rowHeightPx >= MIN_LABEL_ROW_HEIGHT_PX) {
          ctx.fillStyle = colors.text;
          ctx.fillText(
            pitchName(pitch),
            KEYBOARD_WIDTH_PX * BLACK_KEY_WIDTH_RATIO + 3,
            y + geometry.rowHeightPx / 2
          );
        }
      }
    }, [theme, activeMode, geometry, heightPx]);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!instrument) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const pitch = yToPitch(e.clientY - rect.top, geometry);
        if (pitch < 0 || pitch > 127) return;
        void playAuditionNote(instrument, pitch);
      },
      [geometry, instrument]
    );

    return (
      <canvas
        ref={canvasRef}
        css={canvasStyles}
        style={{ height: heightPx }}
        onPointerDown={handlePointerDown}
        aria-label="Piano keyboard"
        role="img"
      />
    );
  }
);

PianoRollKeyboard.displayName = "PianoRollKeyboard";
