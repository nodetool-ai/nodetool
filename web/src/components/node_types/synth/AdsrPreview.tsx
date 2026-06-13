/** @jsxImportSource @emotion/react */
/**
 * AdsrPreview — small SVG sketch of the envelope shape. Segment widths are
 * log-proportional to the attack/decay/release times (with a floor so tiny
 * times stay visible) plus a fixed sustain plateau; height is the level.
 * Purely illustrative — the DSP runs server-side.
 */

import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";

const W = 120;
const H = 36;
const PAD = 3;

/** Log-compress a time in [0.0005, 10] s to a relative width. */
const seg = (seconds: number): number => {
  const t = Math.max(0.0005, Math.min(10, seconds));
  // 0.0005 → 0, 10 → 1 on a log axis, floored so the segment never vanishes.
  return Math.max(0.08, Math.log(t / 0.0005) / Math.log(10 / 0.0005));
};

export interface AdsrPreviewProps {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  accentColor: string;
}

const AdsrPreviewInner: React.FC<AdsrPreviewProps> = ({
  attack,
  decay,
  sustain,
  release,
  accentColor
}) => {
  const theme = useTheme();
  const a = seg(attack);
  const d = seg(decay);
  const r = seg(release);
  const hold = 0.55; // fixed sustain plateau width, relative
  const total = a + d + hold + r;
  const usable = W - PAD * 2;

  const x0 = PAD;
  const x1 = x0 + (a / total) * usable;
  const x2 = x1 + (d / total) * usable;
  const x3 = x2 + (hold / total) * usable;
  const x4 = W - PAD;

  const yBase = H - PAD;
  const yPeak = PAD;
  const s = Math.max(0, Math.min(1, sustain));
  const ySus = yBase - s * (yBase - yPeak);

  const line = `M ${x0},${yBase} L ${x1},${yPeak} L ${x2},${ySus} L ${x3},${ySus} L ${x4},${yBase}`;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ display: "block", height: H }}
      aria-label="Envelope shape"
      role="img"
    >
      <path
        d={`${line} Z`}
        fill={accentColor}
        opacity={0.15}
        stroke="none"
      />
      <path
        d={line}
        fill="none"
        stroke={accentColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line
        x1={PAD}
        y1={yBase}
        x2={W - PAD}
        y2={yBase}
        stroke={theme.vars.palette.grey[700]}
        strokeWidth={1}
      />
    </svg>
  );
};

export const AdsrPreview = memo(AdsrPreviewInner);
AdsrPreview.displayName = "AdsrPreview";
export default AdsrPreview;
