/** @jsxImportSource @emotion/react */
/**
 * WaveformSelector — icon toggle row for an oscillator/LFO waveform enum.
 * One small SVG glyph per waveform; the active one lights in the module's
 * accent color.
 */

import React, { memo, useCallback } from "react";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

const GLYPH_W = 18;
const GLYPH_H = 10;

/** Waveform glyph paths in an 18×10 viewBox (stroke, no fill). */
const WAVE_PATHS: Readonly<Record<string, string>> = {
  sine: "M0,5 C2.5,-1 6.5,-1 9,5 C11.5,11 15.5,11 18,5",
  saw: "M0,9 L8,1 L8,9 L16,1 L16,9",
  square: "M0,9 L0,1 L6,1 L6,9 L12,9 L12,1 L18,1",
  triangle: "M0,9 L4.5,1 L13.5,9 L18,1",
  noise: "M0,5 L2,2 L4,8 L6,3 L8,7 L10,1 L12,9 L14,4 L16,6 L18,5"
};

export const waveformSelectorStyles = (theme: Theme) =>
  css({
    ".waveform-row": {
      display: "flex",
      justifyContent: "center",
      gap: 2
    },
    ".waveform-btn": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 26,
      height: 20,
      padding: 0,
      border: "none",
      borderRadius: "var(--rounded-sm)",
      backgroundColor: "transparent",
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800]
      },
      "&.active": {
        backgroundColor: theme.vars.palette.grey[800]
      }
    }
  });

export interface WaveformSelectorProps {
  options: readonly string[];
  value: string;
  accentColor: string;
  onChange: (value: string) => void;
}

const WaveformSelectorInner: React.FC<WaveformSelectorProps> = ({
  options,
  value,
  accentColor,
  onChange
}) => {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onChange(e.currentTarget.value);
    },
    [onChange]
  );

  return (
    <div className="waveform-row nodrag" role="radiogroup" aria-label="Waveform">
      {options.map((w) => {
        const active = w === value;
        return (
          <button
            key={w}
            type="button"
            value={w}
            className={`waveform-btn${active ? " active" : ""}`}
            role="radio"
            aria-checked={active}
            aria-label={w}
            title={w}
            onClick={handleClick}
          >
            <svg
              width={GLYPH_W}
              height={GLYPH_H}
              viewBox={`0 0 ${GLYPH_W} ${GLYPH_H}`}
              aria-hidden="true"
            >
              <path
                d={WAVE_PATHS[w] ?? WAVE_PATHS.sine}
                fill="none"
                stroke={active ? accentColor : "currentColor"}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
};

export const WaveformSelector = memo(WaveformSelectorInner);
WaveformSelector.displayName = "WaveformSelector";
export default WaveformSelector;
