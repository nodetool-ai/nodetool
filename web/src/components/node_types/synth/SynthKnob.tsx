/** @jsxImportSource @emotion/react */
/**
 * SynthKnob — rotary knob for the synth module bodies. 270° sweep, SVG arc
 * with a pointer line; drag vertically to adjust (Shift = fine), double-click
 * to reset to default, arrow keys when focused. Log-scaled specs sweep
 * perceptually (frequencies, envelope times); bipolar specs fill the arc
 * outward from their neutral point.
 */

import React, { memo, useCallback, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { BORDER_RADIUS, FONT_WEIGHT } from "../../ui_primitives";

import {
  clamp,
  formatKnobValue,
  knobDenorm,
  knobNorm,
  type KnobSpec
} from "./synthModules";

const KNOB_SIZE = 44;
const ARC_RADIUS = 18;
const ARC_STROKE = 3;
/** Sweep: -135° (min) to +135° (max), 0° pointing up. */
const SWEEP_DEG = 270;
const START_DEG = -135;
/** Vertical drag distance for a full min→max sweep. */
const DRAG_RANGE_PX = 160;

const polar = (deg: number, r: number): { x: number; y: number } => {
  const rad = ((deg - 90) * Math.PI) / 180;
  const c = KNOB_SIZE / 2;
  return { x: c + r * Math.cos(rad), y: c + r * Math.sin(rad) };
};

const arcPath = (fromDeg: number, toDeg: number): string => {
  const a = Math.min(fromDeg, toDeg);
  const b = Math.max(fromDeg, toDeg);
  const start = polar(a, ARC_RADIUS);
  const end = polar(b, ARC_RADIUS);
  const largeArc = b - a > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${ARC_RADIUS} ${ARC_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
};

export const synthKnobStyles = (theme: Theme) =>
  css({
    ".knob": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2,
      width: KNOB_SIZE + 12,
      outline: "none",
      "&:focus-visible .knob-face": {
        boxShadow: `0 0 0 2px color-mix(in srgb, ${theme.vars.palette.primary.main} 60%, transparent)`
      }
    },
    ".knob-face": {
      width: KNOB_SIZE,
      height: KNOB_SIZE,
      borderRadius: BORDER_RADIUS.circle,
      cursor: "ns-resize",
      touchAction: "none",
      backgroundColor: theme.vars.palette.grey[800],
      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5), 0 1px 1px rgba(0,0,0,0.3)"
    },
    ".knob-label": {
      fontSize: theme.fontSizeSmaller,
      fontWeight: FONT_WEIGHT.medium,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      lineHeight: 1,
      whiteSpace: "nowrap"
    },
    ".knob-value": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      fontVariantNumeric: "tabular-nums",
      color: theme.vars.palette.text.primary,
      lineHeight: 1,
      whiteSpace: "nowrap"
    }
  });

export interface SynthKnobProps {
  spec: KnobSpec;
  value: number;
  /** Arc/pointer color — the module's resolved accent. */
  accentColor: string;
  onChange: (name: string, v: number) => void;
  onCommit: () => void;
}

const roundForSpec = (spec: KnobSpec, v: number): number => {
  // Log specs span decades — keep 4 significant digits; linear specs keep
  // two decimals (enough for every current 0–10-ish range).
  if (spec.scale === "log") {
    return Number(v.toPrecision(4));
  }
  return Math.round(v * 100) / 100;
};

const SynthKnobInner: React.FC<SynthKnobProps> = ({
  spec,
  value,
  accentColor,
  onChange,
  onCommit
}) => {
  const theme = useTheme();
  const dragStart = useRef<{ y: number; t: number } | null>(null);

  const t = knobNorm(spec, value);
  const angle = START_DEG + t * SWEEP_DEG;
  // Bipolar knobs fill from their neutral point (where 0 sits); unipolar
  // knobs fill from the minimum.
  const neutralT = spec.bipolar ? knobNorm(spec, 0) : 0;
  const neutralAngle = START_DEG + neutralT * SWEEP_DEG;
  const pointerTip = polar(angle, ARC_RADIUS - 5);
  const pointerBase = polar(angle, 6);

  const applyNorm = useCallback(
    (nextT: number) => {
      onChange(spec.name, roundForSpec(spec, knobDenorm(spec, nextT)));
    },
    [onChange, spec]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStart.current = { y: e.clientY, t: knobNorm(spec, value) };
    },
    [spec, value]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart.current) {
        return;
      }
      const fine = e.shiftKey ? 0.1 : 1;
      const dt =
        ((dragStart.current.y - e.clientY) / DRAG_RANGE_PX) * fine;
      applyNorm(clamp(dragStart.current.t + dt, 0, 1));
    },
    [applyNorm]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart.current) {
        return;
      }
      dragStart.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
      onCommit();
    },
    [onCommit]
  );

  const handleDoubleClick = useCallback(() => {
    onChange(spec.name, spec.default);
    onCommit();
  }, [onChange, onCommit, spec]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 0.005 : 0.02;
      let nextT: number | null = null;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        nextT = clamp(knobNorm(spec, value) + step, 0, 1);
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        nextT = clamp(knobNorm(spec, value) - step, 0, 1);
      } else if (e.key === "Home") {
        nextT = 0;
      } else if (e.key === "End") {
        nextT = 1;
      }
      if (nextT !== null) {
        e.preventDefault();
        applyNorm(nextT);
        onCommit();
      }
    },
    [applyNorm, onCommit, spec, value]
  );

  return (
    <div
      className="knob nodrag"
      role="slider"
      tabIndex={0}
      aria-label={spec.label}
      aria-valuemin={spec.min}
      aria-valuemax={spec.max}
      aria-valuenow={value}
      aria-valuetext={formatKnobValue(spec, value)}
      onKeyDown={handleKeyDown}
    >
      <div
        className="knob-face"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <svg
          width={KNOB_SIZE}
          height={KNOB_SIZE}
          viewBox={`0 0 ${KNOB_SIZE} ${KNOB_SIZE}`}
          aria-hidden="true"
        >
          <path
            d={arcPath(START_DEG, START_DEG + SWEEP_DEG)}
            fill="none"
            stroke={theme.vars.palette.grey[600]}
            strokeWidth={ARC_STROKE}
            strokeLinecap="round"
          />
          {Math.abs(angle - neutralAngle) > 0.5 && (
            <path
              d={arcPath(neutralAngle, angle)}
              fill="none"
              stroke={accentColor}
              strokeWidth={ARC_STROKE}
              strokeLinecap="round"
            />
          )}
          <line
            x1={pointerBase.x}
            y1={pointerBase.y}
            x2={pointerTip.x}
            y2={pointerTip.y}
            stroke={theme.vars.palette.text.primary}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className="knob-label">{spec.label}</span>
      <span className="knob-value">{formatKnobValue(spec, value)}</span>
    </div>
  );
};

export const SynthKnob = memo(SynthKnobInner);
SynthKnob.displayName = "SynthKnob";
export default SynthKnob;
