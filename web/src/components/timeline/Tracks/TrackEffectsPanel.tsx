/** @jsxImportSource @emotion/react */
/**
 * TrackEffectsPanel
 *
 * Editor for an audio track's DSP chain. Displays the ordered list of
 * effects with enable toggles, parameter controls (sliders, selects), and
 * reorder / remove actions. The chain runs:
 *
 *   trackGain → effect1 → effect2 → ... → masterGain
 *
 * Only enabled effects are wired into the live audio graph.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import Menu from "@mui/material/Menu";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";

import type {
  TrackEffect,
  TrackGainEffect,
  TrackEq3Effect,
  TrackFilterEffect,
  TrackCompressorEffect,
  TrackColorCorrectionEffect,
  TrackVideoBlurEffect,
  TrackSharpenEffect,
  TrackVignetteEffect,
  TrackChromaKeyEffect
} from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  FlexColumn,
  FlexRow,
  NodeSlider,
  Text,
  Tooltip,
  LabeledSwitch,
  SelectField,
  NodeMenuItem,
  MOTION
} from "../../ui_primitives";
import { FX_PANEL_HEIGHT_PX } from "./trackHeight";

// ── Styles ──────────────────────────────────────────────────────────────────

const containerStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: FX_PANEL_HEIGHT_PX,
    padding: theme.spacing(1, 1.5, 1.5),
    backgroundColor: theme.vars.palette.background.default,
    borderTop: `1px solid ${theme.vars.palette.divider}`,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    color: theme.vars.palette.text.primary,
    overflow: "hidden",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column"
  });

const deviceRackStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "row",
    gap: theme.spacing(1),
    alignItems: "stretch",
    flex: 1,
    minHeight: 0,
    overflowX: "auto",
    overflowY: "hidden"
  });

// Per-effect-type card width (Ableton-style fixed-width "devices").
const DEVICE_WIDTHS: Record<TrackEffect["type"], number> = {
  gain: 200,
  eq3: 420,
  filter: 240,
  compressor: 380,
  colorCorrection: 320,
  videoBlur: 220,
  sharpen: 240,
  vignette: 260,
  chromaKey: 280
};

const effectCardStyles = (
  theme: Theme,
  width: number,
  dragOver: "left" | "right" | null,
  dragging: boolean
) =>
  css({
    position: "relative",
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: 4,
    padding: theme.spacing(1, 1),
    width,
    minWidth: width,
    maxWidth: width,
    height: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    background: theme.vars.palette.background.paper,
    overflowY: "auto",
    overflowX: "hidden",
    opacity: dragging ? 0.4 : 1,
    transition: `opacity ${MOTION.fast}`,
    "&::before": dragOver
      ? {
          content: '""',
          position: "absolute",
          top: 0,
          bottom: 0,
          [dragOver === "left" ? "left" : "right"]: -5,
          width: 3,
          borderRadius: 2,
          background: theme.vars.palette.primary.main,
          boxShadow: `0 0 8px ${theme.vars.palette.primary.main}`,
          pointerEvents: "none"
        }
      : undefined
  });

const dragHandleStyles = (theme: Theme) =>
  css({
    cursor: "grab",
    color: theme.vars.palette.text.disabled,
    display: "flex",
    alignItems: "center",
    "&:active": { cursor: "grabbing" },
    "&:hover": { color: theme.vars.palette.text.secondary },
    "& svg": { fontSize: 16 }
  });

const effectHeaderStyles = css({
  alignItems: "center",
  justifyContent: "space-between"
});

const iconButtonStyles = (theme: Theme, disabled = false) =>
  css({
    background: "none",
    border: "none",
    padding: 2,
    cursor: disabled ? "default" : "pointer",
    color: disabled
      ? theme.vars.palette.text.disabled
      : theme.vars.palette.text.secondary,
    borderRadius: 3,
    "&:hover": {
      backgroundColor: disabled
        ? "transparent"
        : theme.vars.palette.action.hover,
      color: disabled
        ? theme.vars.palette.text.disabled
        : theme.vars.palette.text.primary
    },
    "& svg": { fontSize: 14 }
  });

const addButtonStyles = (theme: Theme) =>
  css({
    background: theme.vars.palette.primary.main,
    color: theme.vars.palette.primary.contrastText,
    border: "none",
    padding: theme.spacing(0.5, 1),
    borderRadius: 3,
    fontSize: theme.typography.caption.fontSize,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    "&:hover": {
      filter: "brightness(1.1)"
    },
    "& svg": { fontSize: 14 }
  });

const paramRowStyles = css({
  alignItems: "center",
  gap: 8
});

const paramLabelStyles = (theme: Theme) =>
  css({
    width: 70,
    flexShrink: 0,
    fontSize: theme.typography.caption.fontSize,
    color: theme.vars.palette.text.secondary
  });

const paramValueStyles = (theme: Theme) =>
  css({
    width: 56,
    flexShrink: 0,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontSize: theme.typography.caption.fontSize,
    color: theme.vars.palette.text.primary
  });

// ── Effect labels ───────────────────────────────────────────────────────────

const EFFECT_LABELS: Record<TrackEffect["type"], string> = {
  gain: "Gain",
  eq3: "3-Band EQ",
  filter: "Filter",
  compressor: "Compressor",
  colorCorrection: "Color",
  videoBlur: "Blur",
  sharpen: "Sharpen",
  vignette: "Vignette",
  chromaKey: "Chroma Key"
};

const AUDIO_EFFECT_TYPES: TrackEffect["type"][] = [
  "gain",
  "eq3",
  "filter",
  "compressor"
];

const VIDEO_EFFECT_TYPES: TrackEffect["type"][] = [
  "colorCorrection",
  "videoBlur",
  "sharpen",
  "vignette",
  "chromaKey"
];

// ── Parameter row ───────────────────────────────────────────────────────────

interface ParamRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}

const ParamRow: React.FC<ParamRowProps> = ({
  label,
  value,
  min,
  max,
  step,
  unit,
  format,
  onChange,
  disabled
}) => {
  const theme = useTheme();
  const display = format ? format(value) : value.toFixed(step < 1 ? 2 : 0);
  return (
    <FlexRow css={paramRowStyles}>
      <span css={paramLabelStyles(theme)}>{label}</span>
      <NodeSlider
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(_, v) => onChange(Array.isArray(v) ? v[0] : v)}
        sx={{ flex: 1 }}
      />
      <span css={paramValueStyles(theme)}>
        {display}
        {unit ? ` ${unit}` : ""}
      </span>
    </FlexRow>
  );
};

// ── Per-effect editors ──────────────────────────────────────────────────────

interface EffectEditorProps<E extends TrackEffect> {
  effect: E;
  onPatch: (patch: Partial<E>) => void;
  disabled: boolean;
}

const GainEditor: React.FC<EffectEditorProps<TrackGainEffect>> = ({
  effect,
  onPatch,
  disabled
}) => (
  <ParamRow
    label="Gain"
    value={effect.gainDb}
    min={-24}
    max={24}
    step={0.1}
    unit="dB"
    format={(v) => v.toFixed(1)}
    onChange={(v) => onPatch({ gainDb: v })}
    disabled={disabled}
  />
);

// ── 3-Band EQ visualizer (Logic-style) ──────────────────────────────────────

const EQ_FS = 48000;
const EQ_F_MIN = 20;
const EQ_F_MAX = 20000;
const EQ_DB_RANGE = 18;
const EQ_GRAPH_HEIGHT = 160;

type Band = "low" | "mid" | "high";

const BAND_COLORS: Record<Band, string> = {
  low: "#4ea3ff",
  mid: "#7be08a",
  high: "#ffb24a"
};

const BAND_RANGES: Record<Band, { fMin: number; fMax: number }> = {
  low: { fMin: 40, fMax: 400 },
  mid: { fMin: 100, fMax: 8000 },
  high: { fMin: 2000, fMax: 16000 }
};

const clamp = (v: number, a: number, b: number) =>
  v < a ? a : v > b ? b : v;

const freqToX = (f: number, width: number) => {
  const logMin = Math.log10(EQ_F_MIN);
  const logMax = Math.log10(EQ_F_MAX);
  return ((Math.log10(f) - logMin) / (logMax - logMin)) * width;
};

const xToFreq = (x: number, width: number) => {
  const logMin = Math.log10(EQ_F_MIN);
  const logMax = Math.log10(EQ_F_MAX);
  return Math.pow(10, logMin + (x / width) * (logMax - logMin));
};

const dbToY = (db: number, height: number) =>
  height / 2 - (db / EQ_DB_RANGE) * (height / 2);

const yToDb = (y: number, height: number) =>
  ((height / 2 - y) / (height / 2)) * EQ_DB_RANGE;

// Biquad magnitude in dB at frequency f (Hz), using RBJ cookbook coefficients.
const biquadMagDb = (
  type: "lowshelf" | "highshelf" | "peaking",
  f: number,
  f0: number,
  gainDb: number,
  q: number
): number => {
  if (gainDb === 0 && type !== "peaking") return 0;
  if (gainDb === 0 && type === "peaking") return 0;
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / EQ_FS;
  const cw = Math.cos(w0);
  const sw = Math.sin(w0);

  let b0 = 1,
    b1 = 0,
    b2 = 0,
    a0 = 1,
    a1 = 0,
    a2 = 0;

  if (type === "peaking") {
    const alpha = sw / (2 * q);
    b0 = 1 + alpha * A;
    b1 = -2 * cw;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cw;
    a2 = 1 - alpha / A;
  } else if (type === "lowshelf") {
    const S = 1;
    const alpha =
      (sw / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const sqA = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * cw + sqA);
    b1 = 2 * A * (A - 1 - (A + 1) * cw);
    b2 = A * (A + 1 - (A - 1) * cw - sqA);
    a0 = A + 1 + (A - 1) * cw + sqA;
    a1 = -2 * (A - 1 + (A + 1) * cw);
    a2 = A + 1 + (A - 1) * cw - sqA;
  } else {
    const S = 1;
    const alpha =
      (sw / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const sqA = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cw + sqA);
    b1 = -2 * A * (A - 1 + (A + 1) * cw);
    b2 = A * (A + 1 + (A - 1) * cw - sqA);
    a0 = A + 1 - (A - 1) * cw + sqA;
    a1 = 2 * (A - 1 - (A + 1) * cw);
    a2 = A + 1 - (A - 1) * cw - sqA;
  }

  const w = (2 * Math.PI * f) / EQ_FS;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);

  const numRe = b0 + b1 * c1 + b2 * c2;
  const numIm = -(b1 * s1 + b2 * s2);
  const denRe = a0 + a1 * c1 + a2 * c2;
  const denIm = -(a1 * s1 + a2 * s2);

  const numMag2 = numRe * numRe + numIm * numIm;
  const denMag2 = denRe * denRe + denIm * denIm;
  if (denMag2 === 0) return 0;
  return 10 * Math.log10(numMag2 / denMag2);
};

const eqCurveStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: EQ_GRAPH_HEIGHT,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: 4,
    background: `linear-gradient(to bottom, ${theme.vars.palette.background.paper} 0%, rgba(0,0,0,0.25) 100%)`,
    display: "block",
    touchAction: "none",
    userSelect: "none"
  });

const bandReadoutStyles = (theme: Theme, color: string) =>
  css({
    flex: 1,
    minWidth: 0,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderTop: `2px solid ${color}`,
    borderRadius: 3,
    padding: theme.spacing(0.5, 1),
    background: theme.vars.palette.background.paper,
    fontSize: theme.typography.caption.fontSize,
    display: "flex",
    flexDirection: "column",
    gap: 2
  });

const readoutRowStyles = (theme: Theme) =>
  css({
    display: "flex",
    justifyContent: "space-between",
    gap: 4,
    color: theme.vars.palette.text.secondary,
    "& > b": {
      color: theme.vars.palette.text.primary,
      fontWeight: 500,
      fontVariantNumeric: "tabular-nums"
    }
  });

interface Eq3CurveProps {
  effect: TrackEq3Effect;
  onPatch: (patch: Partial<TrackEq3Effect>) => void;
  disabled: boolean;
}

const Eq3Curve: React.FC<Eq3CurveProps> = ({ effect, onPatch, disabled }) => {
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(600);
  const [dragBand, setDragBand] = useState<Band | null>(null);

  // Track SVG width to compute layout in user space.
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = EQ_GRAPH_HEIGHT;

  // Sample the combined frequency response.
  const curvePath = useMemo(() => {
    const samples = 256;
    const logMin = Math.log10(EQ_F_MIN);
    const logMax = Math.log10(EQ_F_MAX);
    let d = "";
    for (let i = 0; i <= samples; i++) {
      const f = Math.pow(10, logMin + ((logMax - logMin) * i) / samples);
      const db =
        biquadMagDb("lowshelf", f, effect.lowFreq, effect.lowGainDb, 0.7) +
        biquadMagDb("peaking", f, effect.midFreq, effect.midGainDb, effect.midQ) +
        biquadMagDb("highshelf", f, effect.highFreq, effect.highGainDb, 0.7);
      const x = freqToX(f, width);
      const y = dbToY(clamp(db, -EQ_DB_RANGE, EQ_DB_RANGE), height);
      d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
    }
    return d;
  }, [
    effect.lowFreq,
    effect.lowGainDb,
    effect.midFreq,
    effect.midGainDb,
    effect.midQ,
    effect.highFreq,
    effect.highGainDb,
    width,
    height
  ]);

  // Fill area between curve and 0 dB centerline.
  const fillPath = useMemo(() => {
    return (
      curvePath +
      " L " +
      width.toFixed(1) +
      " " +
      (height / 2).toFixed(1) +
      " L 0 " +
      (height / 2).toFixed(1) +
      " Z"
    );
  }, [curvePath, width, height]);

  const handlePointerDown = useCallback(
    (band: Band) => (e: React.PointerEvent<SVGElement>) => {
      if (disabled) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      setDragBand(band);
      e.stopPropagation();
    },
    [disabled]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      if (!dragBand || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const y = clamp(e.clientY - rect.top, 0, rect.height);
      const freq = xToFreq(x, rect.width);
      const db = yToDb(y, rect.height);
      const { fMin, fMax } = BAND_RANGES[dragBand];
      const clampedFreq = clamp(freq, fMin, fMax);
      const clampedDb = clamp(db, -EQ_DB_RANGE, EQ_DB_RANGE);
      if (dragBand === "low") {
        onPatch({ lowFreq: clampedFreq, lowGainDb: clampedDb });
      } else if (dragBand === "mid") {
        onPatch({ midFreq: clampedFreq, midGainDb: clampedDb });
      } else {
        onPatch({ highFreq: clampedFreq, highGainDb: clampedDb });
      }
    },
    [dragBand, onPatch]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      if (dragBand) {
        try {
          (e.target as Element).releasePointerCapture(e.pointerId);
        } catch {
          // ignore — capture may have already ended
        }
      }
      setDragBand(null);
    },
    [dragBand]
  );

  // Scroll-wheel on mid handle adjusts Q. Attached as a native non-passive
  // listener: React's onWheel is passive, so preventDefault() there can't
  // stop the page from scrolling.
  const midHandleRef = useRef<SVGCircleElement | null>(null);
  useEffect(() => {
    const el = midHandleRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (disabled) return;
      e.preventDefault();
      const next = clamp(
        effect.midQ * (e.deltaY > 0 ? 0.9 : 1.1),
        0.1,
        10
      );
      onPatch({ midQ: parseFloat(next.toFixed(2)) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [effect.midQ, onPatch, disabled]);

  // Static grid: log decade lines + dB lines.
  const gridFreqs = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
  const gridDbs = [-12, -6, 0, 6, 12];

  const gridColor = theme.vars.palette.divider;
  const labelColor = theme.vars.palette.text.disabled;

  const handles: { band: Band; freq: number; gainDb: number }[] = [
    { band: "low", freq: effect.lowFreq, gainDb: effect.lowGainDb },
    { band: "mid", freq: effect.midFreq, gainDb: effect.midGainDb },
    { band: "high", freq: effect.highFreq, gainDb: effect.highGainDb }
  ];

  return (
    <svg
      ref={svgRef}
      css={eqCurveStyles(theme)}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* dB grid */}
      {gridDbs.map((db) => {
        const y = dbToY(db, height);
        return (
          <g key={`db-${db}`}>
            <line
              x1={0}
              x2={width}
              y1={y}
              y2={y}
              stroke={gridColor}
              strokeWidth={db === 0 ? 1 : 0.5}
              strokeDasharray={db === 0 ? undefined : "2 3"}
              opacity={db === 0 ? 0.8 : 0.5}
            />
            <text
              x={4}
              y={y - 2}
              fill={labelColor}
              fontSize={9}
              fontFamily="ui-monospace, monospace"
            >
              {db > 0 ? `+${db}` : db}
            </text>
          </g>
        );
      })}

      {/* Frequency grid */}
      {gridFreqs.map((f) => {
        const x = freqToX(f, width);
        return (
          <g key={`f-${f}`}>
            <line
              x1={x}
              x2={x}
              y1={0}
              y2={height}
              stroke={gridColor}
              strokeWidth={0.5}
              strokeDasharray="2 3"
              opacity={0.5}
            />
            <text
              x={x + 2}
              y={height - 4}
              fill={labelColor}
              fontSize={9}
              fontFamily="ui-monospace, monospace"
            >
              {f >= 1000 ? `${f / 1000}k` : f}
            </text>
          </g>
        );
      })}

      {/* Response fill + curve */}
      <path
        d={fillPath}
        fill={theme.vars.palette.primary.main}
        opacity={disabled ? 0.08 : 0.18}
      />
      <path
        d={curvePath}
        fill="none"
        stroke={
          disabled
            ? theme.vars.palette.text.disabled
            : theme.vars.palette.primary.light
        }
        strokeWidth={1.75}
        strokeLinejoin="round"
      />

      {/* Band handles */}
      {handles.map(({ band, freq, gainDb }) => {
        const x = freqToX(freq, width);
        const y = dbToY(gainDb, height);
        const color = BAND_COLORS[band];
        const isMid = band === "mid";
        return (
          <g key={band}>
            <circle
              cx={x}
              cy={y}
              r={11}
              fill={color}
              opacity={0.18}
              pointerEvents="none"
            />
            <circle
              cx={x}
              cy={y}
              r={6.5}
              fill={theme.vars.palette.background.paper}
              stroke={color}
              strokeWidth={2}
              style={{ cursor: disabled ? "default" : "grab" }}
              onPointerDown={handlePointerDown(band)}
              ref={isMid ? midHandleRef : undefined}
            />
            <text
              x={x}
              y={y + 3}
              textAnchor="middle"
              fontSize={9}
              fontWeight={700}
              fill={color}
              pointerEvents="none"
            >
              {band === "low" ? "L" : band === "mid" ? "M" : "H"}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const formatHz = (hz: number) =>
  hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)} kHz` : `${Math.round(hz)} Hz`;

const Eq3Editor: React.FC<EffectEditorProps<TrackEq3Effect>> = ({
  effect,
  onPatch,
  disabled
}) => {
  const theme = useTheme();
  return (
    <FlexColumn gap={1}>
      <Eq3Curve effect={effect} onPatch={onPatch} disabled={disabled} />
      <FlexRow gap={0.5}>
        <div css={bandReadoutStyles(theme, BAND_COLORS.low)}>
          <div css={readoutRowStyles(theme)}>
            <span>Low shelf</span>
            <b>{effect.lowGainDb >= 0 ? "+" : ""}{effect.lowGainDb.toFixed(1)} dB</b>
          </div>
          <div css={readoutRowStyles(theme)}>
            <span>Freq</span>
            <b>{formatHz(effect.lowFreq)}</b>
          </div>
        </div>
        <div css={bandReadoutStyles(theme, BAND_COLORS.mid)}>
          <div css={readoutRowStyles(theme)}>
            <span>Mid peak</span>
            <b>{effect.midGainDb >= 0 ? "+" : ""}{effect.midGainDb.toFixed(1)} dB</b>
          </div>
          <div css={readoutRowStyles(theme)}>
            <span>Freq</span>
            <b>{formatHz(effect.midFreq)}</b>
          </div>
          <div css={readoutRowStyles(theme)}>
            <span>Q</span>
            <b>{effect.midQ.toFixed(2)}</b>
          </div>
        </div>
        <div css={bandReadoutStyles(theme, BAND_COLORS.high)}>
          <div css={readoutRowStyles(theme)}>
            <span>High shelf</span>
            <b>{effect.highGainDb >= 0 ? "+" : ""}{effect.highGainDb.toFixed(1)} dB</b>
          </div>
          <div css={readoutRowStyles(theme)}>
            <span>Freq</span>
            <b>{formatHz(effect.highFreq)}</b>
          </div>
        </div>
      </FlexRow>
      <Tooltip title="Drag handles to set frequency & gain. Scroll on the mid handle to change Q.">
        <Text size="tiny" color="secondary">
          Drag bands · scroll mid for Q
        </Text>
      </Tooltip>
    </FlexColumn>
  );
};

const FilterEditor: React.FC<EffectEditorProps<TrackFilterEffect>> = ({
  effect,
  onPatch,
  disabled
}) => (
  <FlexColumn gap={0.5}>
    <SelectField
      label="Mode"
      value={effect.mode}
      onChange={(v) =>
        onPatch({ mode: v as TrackFilterEffect["mode"] })
      }
      options={[
        { value: "lowpass", label: "Low-pass" },
        { value: "highpass", label: "High-pass" },
        { value: "bandpass", label: "Band-pass" }
      ]}
      size="small"
      disabled={disabled}
    />
    <ParamRow
      label="Frequency"
      value={effect.frequency}
      min={20}
      max={20000}
      step={10}
      unit="Hz"
      onChange={(v) => onPatch({ frequency: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Q"
      value={effect.q}
      min={0.1}
      max={20}
      step={0.1}
      format={(v) => v.toFixed(1)}
      onChange={(v) => onPatch({ q: v })}
      disabled={disabled}
    />
  </FlexColumn>
);

// ── Compressor visualizer (Logic-style transfer curve) ──────────────────────

const COMP_DB_MIN = -60;
const COMP_DB_MAX = 0;
const COMP_GRAPH_SIZE = 180;

const compTransferDb = (
  inputDb: number,
  threshold: number,
  ratio: number,
  knee: number
): number => {
  const half = knee / 2;
  const delta = inputDb - threshold;
  if (knee > 0 && delta > -half && delta < half) {
    const x = delta + half;
    return inputDb + (1 / ratio - 1) * (x * x) / (2 * knee);
  }
  if (delta <= 0) return inputDb;
  return threshold + delta / ratio;
};

const compXY = (db: number, size: number) => {
  const t = (db - COMP_DB_MIN) / (COMP_DB_MAX - COMP_DB_MIN);
  return t * size;
};

const compFromX = (x: number, size: number) =>
  COMP_DB_MIN + (x / size) * (COMP_DB_MAX - COMP_DB_MIN);

const compFromY = (y: number, size: number) =>
  COMP_DB_MIN + ((size - y) / size) * (COMP_DB_MAX - COMP_DB_MIN);

const compGraphStyles = (theme: Theme) =>
  css({
    width: COMP_GRAPH_SIZE,
    height: COMP_GRAPH_SIZE,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: 4,
    background: `linear-gradient(135deg, ${theme.vars.palette.background.paper} 0%, rgba(0,0,0,0.3) 100%)`,
    display: "block",
    flexShrink: 0,
    touchAction: "none",
    userSelect: "none"
  });

const compReadoutGridStyles = (theme: Theme) =>
  css({
    flex: 1,
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: theme.spacing(0.5)
  });

const compTileStyles = (theme: Theme, accent?: string) =>
  css({
    border: `1px solid ${theme.vars.palette.divider}`,
    borderTop: accent ? `2px solid ${accent}` : undefined,
    borderRadius: 3,
    padding: theme.spacing(0.5, 1),
    background: theme.vars.palette.background.paper,
    display: "flex",
    flexDirection: "column",
    gap: 4
  });

const compTileLabelStyles = (theme: Theme) =>
  css({
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: theme.vars.palette.text.secondary
  });

const compTileValueStyles = (theme: Theme) =>
  css({
    fontSize: 13,
    fontVariantNumeric: "tabular-nums",
    color: theme.vars.palette.text.primary,
    fontWeight: 500
  });

const COMP_ACCENT = "#ff7a59";
const COMP_THRESH_COLOR = "#ffd24a";

type CompDrag = "threshold" | "ratio" | null;

interface CompressorCurveProps {
  effect: TrackCompressorEffect;
  onPatch: (patch: Partial<TrackCompressorEffect>) => void;
  disabled: boolean;
}

const CompressorCurve: React.FC<CompressorCurveProps> = ({
  effect,
  onPatch,
  disabled
}) => {
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<CompDrag>(null);
  const size = COMP_GRAPH_SIZE;

  const curvePath = useMemo(() => {
    const samples = 80;
    let d = "";
    for (let i = 0; i <= samples; i++) {
      const dbIn = COMP_DB_MIN + (i / samples) * (COMP_DB_MAX - COMP_DB_MIN);
      const dbOut = compTransferDb(
        dbIn,
        effect.thresholdDb,
        effect.ratio,
        effect.kneeDb
      );
      const x = compXY(dbIn, size);
      const y = size - compXY(dbOut, size);
      d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
    }
    return d;
  }, [effect.thresholdDb, effect.ratio, effect.kneeDb, size]);

  const fillPath = useMemo(
    () =>
      curvePath +
      " L " +
      size +
      " " +
      size +
      " L 0 " +
      size +
      " Z",
    [curvePath, size]
  );

  // Threshold handle sits on the curve at input = threshold.
  const thrX = compXY(effect.thresholdDb, size);
  const thrYDb = compTransferDb(
    effect.thresholdDb,
    effect.thresholdDb,
    effect.ratio,
    effect.kneeDb
  );
  const thrY = size - compXY(thrYDb, size);

  // Ratio handle: sits at input = -3 dB on the curve. Vertical drag changes ratio.
  const ratioRefInput = -3;
  const ratioOutDb = compTransferDb(
    ratioRefInput,
    effect.thresholdDb,
    effect.ratio,
    effect.kneeDb
  );
  const ratioX = compXY(ratioRefInput, size);
  const ratioY = size - compXY(ratioOutDb, size);

  const onDown = useCallback(
    (which: CompDrag) => (e: React.PointerEvent<SVGElement>) => {
      if (disabled) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      setDrag(which);
      e.stopPropagation();
    },
    [disabled]
  );

  const onMove = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      if (!drag || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const px = clamp(e.clientX - rect.left, 0, rect.width);
      const py = clamp(e.clientY - rect.top, 0, rect.height);
      if (drag === "threshold") {
        // Drag along the X axis primarily; clamp threshold.
        const t = clamp(compFromX(px * (size / rect.width), size), -60, 0);
        onPatch({ thresholdDb: parseFloat(t.toFixed(1)) });
      } else if (drag === "ratio") {
        // Vertical drag controls ratio. Output at ratioRefInput is the Y position.
        const outDb = compFromY(py * (size / rect.height), size);
        const delta = ratioRefInput - effect.thresholdDb;
        // Solve for ratio: outDb = thresh + delta/ratio (above knee) or near-1:1 below.
        if (delta <= 0) {
          // Reference point below threshold — fall back to slider behavior using py.
          const r = clamp(
            1 + (rect.height - py) / rect.height * 19,
            1,
            20
          );
          onPatch({ ratio: parseFloat(r.toFixed(2)) });
        } else {
          const compressedDelta = outDb - effect.thresholdDb;
          if (compressedDelta <= 0.01) {
            onPatch({ ratio: 20 });
          } else {
            const r = clamp(delta / compressedDelta, 1, 20);
            onPatch({ ratio: parseFloat(r.toFixed(2)) });
          }
        }
      }
    },
    [drag, onPatch, size, effect.thresholdDb]
  );

  const onUp = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      if (drag) {
        try {
          (e.target as Element).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
      setDrag(null);
    },
    [drag]
  );

  // Threshold-line wheel changes knee width. Native non-passive listener so
  // preventDefault() actually blocks scrolling (React's onWheel is passive).
  const threshHandleRef = useRef<SVGCircleElement | null>(null);
  useEffect(() => {
    const el = threshHandleRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (disabled) return;
      e.preventDefault();
      const next = clamp(
        effect.kneeDb + (e.deltaY > 0 ? -1 : 1),
        0,
        40
      );
      onPatch({ kneeDb: parseFloat(next.toFixed(1)) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [effect.kneeDb, onPatch, disabled]);

  const gridDbs = [-48, -36, -24, -12];
  const gridColor = theme.vars.palette.divider;
  const labelColor = theme.vars.palette.text.disabled;

  return (
    <svg
      ref={svgRef}
      css={compGraphStyles(theme)}
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="none"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {/* Grid */}
      {gridDbs.map((db) => {
        const p = compXY(db, size);
        return (
          <g key={`g-${db}`}>
            <line
              x1={p}
              y1={0}
              x2={p}
              y2={size}
              stroke={gridColor}
              strokeWidth={0.5}
              strokeDasharray="2 3"
              opacity={0.5}
            />
            <line
              x1={0}
              y1={size - p}
              x2={size}
              y2={size - p}
              stroke={gridColor}
              strokeWidth={0.5}
              strokeDasharray="2 3"
              opacity={0.5}
            />
            <text
              x={p + 2}
              y={size - 4}
              fill={labelColor}
              fontSize={9}
              fontFamily="ui-monospace, monospace"
            >
              {db}
            </text>
          </g>
        );
      })}

      {/* Identity 1:1 line */}
      <line
        x1={0}
        y1={size}
        x2={size}
        y2={0}
        stroke={theme.vars.palette.text.disabled}
        strokeWidth={0.75}
        strokeDasharray="3 3"
        opacity={0.6}
      />

      {/* Compressed area fill */}
      <path
        d={fillPath}
        fill={COMP_ACCENT}
        opacity={disabled ? 0.06 : 0.14}
      />

      {/* Transfer curve */}
      <path
        d={curvePath}
        fill="none"
        stroke={disabled ? theme.vars.palette.text.disabled : COMP_ACCENT}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />

      {/* Threshold guide line */}
      <line
        x1={thrX}
        y1={0}
        x2={thrX}
        y2={size}
        stroke={COMP_THRESH_COLOR}
        strokeWidth={0.75}
        strokeDasharray="2 4"
        opacity={0.6}
        pointerEvents="none"
      />

      {/* Threshold handle */}
      <circle
        cx={thrX}
        cy={thrY}
        r={11}
        fill={COMP_THRESH_COLOR}
        opacity={0.18}
        pointerEvents="none"
      />
      <circle
        cx={thrX}
        cy={thrY}
        r={6.5}
        fill={theme.vars.palette.background.paper}
        stroke={COMP_THRESH_COLOR}
        strokeWidth={2}
        style={{ cursor: disabled ? "default" : "ew-resize" }}
        onPointerDown={onDown("threshold")}
        ref={threshHandleRef}
      />
      <text
        x={thrX}
        y={thrY + 3}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
        fill={COMP_THRESH_COLOR}
        pointerEvents="none"
      >
        T
      </text>

      {/* Ratio handle */}
      <circle
        cx={ratioX}
        cy={ratioY}
        r={11}
        fill={COMP_ACCENT}
        opacity={0.18}
        pointerEvents="none"
      />
      <circle
        cx={ratioX}
        cy={ratioY}
        r={6.5}
        fill={theme.vars.palette.background.paper}
        stroke={COMP_ACCENT}
        strokeWidth={2}
        style={{ cursor: disabled ? "default" : "ns-resize" }}
        onPointerDown={onDown("ratio")}
      />
      <text
        x={ratioX}
        y={ratioY + 3}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
        fill={COMP_ACCENT}
        pointerEvents="none"
      >
        R
      </text>
    </svg>
  );
};

const formatMs = (ms: number) =>
  ms < 100 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;

const CompressorEditor: React.FC<EffectEditorProps<TrackCompressorEffect>> = ({
  effect,
  onPatch,
  disabled
}) => {
  const theme = useTheme();
  return (
    <FlexColumn gap={1}>
      <FlexRow gap={1} align="stretch">
        <CompressorCurve
          effect={effect}
          onPatch={onPatch}
          disabled={disabled}
        />
        <div css={compReadoutGridStyles(theme)}>
          <div css={compTileStyles(theme, COMP_THRESH_COLOR)}>
            <span css={compTileLabelStyles(theme)}>Threshold</span>
            <span css={compTileValueStyles(theme)}>
              {effect.thresholdDb.toFixed(1)} dB
            </span>
          </div>
          <div css={compTileStyles(theme, COMP_ACCENT)}>
            <span css={compTileLabelStyles(theme)}>Ratio</span>
            <span css={compTileValueStyles(theme)}>
              {effect.ratio.toFixed(1)}:1
            </span>
          </div>
          <div css={compTileStyles(theme)}>
            <span css={compTileLabelStyles(theme)}>Knee</span>
            <span css={compTileValueStyles(theme)}>
              {effect.kneeDb.toFixed(1)} dB
            </span>
          </div>
          <div css={compTileStyles(theme)}>
            <span css={compTileLabelStyles(theme)}>Attack</span>
            <span css={compTileValueStyles(theme)}>
              {formatMs(effect.attackMs)}
            </span>
          </div>
        </div>
      </FlexRow>
      <FlexColumn gap={0.5}>
        <ParamRow
          label="Attack"
          value={effect.attackMs}
          min={0}
          max={500}
          step={1}
          unit="ms"
          onChange={(v) => onPatch({ attackMs: v })}
          disabled={disabled}
        />
        <ParamRow
          label="Release"
          value={effect.releaseMs}
          min={0}
          max={2000}
          step={1}
          unit="ms"
          onChange={(v) => onPatch({ releaseMs: v })}
          disabled={disabled}
        />
        <ParamRow
          label="Knee"
          value={effect.kneeDb}
          min={0}
          max={40}
          step={0.5}
          unit="dB"
          format={(v) => v.toFixed(1)}
          onChange={(v) => onPatch({ kneeDb: v })}
          disabled={disabled}
        />
      </FlexColumn>
      <Tooltip title="Drag T to set threshold, R to set ratio. Scroll on T to change knee width.">
        <Text size="tiny" color="secondary">
          Drag T = threshold · R = ratio · scroll T = knee
        </Text>
      </Tooltip>
    </FlexColumn>
  );
};

// ── Video effect editors ────────────────────────────────────────────────────

const ColorCorrectionEditor: React.FC<
  EffectEditorProps<TrackColorCorrectionEffect>
> = ({ effect, onPatch, disabled }) => (
  <FlexColumn gap={0.5}>
    <ParamRow
      label="Brightness"
      value={effect.brightness}
      min={-1}
      max={1}
      step={0.01}
      format={(v) => v.toFixed(2)}
      onChange={(v) => onPatch({ brightness: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Contrast"
      value={effect.contrast}
      min={0}
      max={4}
      step={0.01}
      format={(v) => v.toFixed(2)}
      onChange={(v) => onPatch({ contrast: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Saturation"
      value={effect.saturation}
      min={0}
      max={4}
      step={0.01}
      format={(v) => v.toFixed(2)}
      onChange={(v) => onPatch({ saturation: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Hue"
      value={effect.hue}
      min={-180}
      max={180}
      step={1}
      unit="°"
      onChange={(v) => onPatch({ hue: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Temp"
      value={effect.temperature}
      min={-1}
      max={1}
      step={0.01}
      format={(v) => v.toFixed(2)}
      onChange={(v) => onPatch({ temperature: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Tint"
      value={effect.tint}
      min={-1}
      max={1}
      step={0.01}
      format={(v) => v.toFixed(2)}
      onChange={(v) => onPatch({ tint: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Shadows"
      value={effect.shadows}
      min={-1}
      max={1}
      step={0.01}
      format={(v) => v.toFixed(2)}
      onChange={(v) => onPatch({ shadows: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Highlights"
      value={effect.highlights}
      min={-1}
      max={1}
      step={0.01}
      format={(v) => v.toFixed(2)}
      onChange={(v) => onPatch({ highlights: v })}
      disabled={disabled}
    />
  </FlexColumn>
);

const previewBoxStyles = (theme: Theme) =>
  css({
    width: "100%",
    aspectRatio: "16 / 9",
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
    background:
      "linear-gradient(135deg, #243b53 0%, #486581 35%, #9fb3c8 100%)"
  });

const VideoBlurEditor: React.FC<
  EffectEditorProps<TrackVideoBlurEffect>
> = ({ effect, onPatch, disabled }) => {
  const theme = useTheme();
  return (
    <FlexColumn gap={0.5}>
      <div css={previewBoxStyles(theme)}>
        <div
          css={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 30% 40%, rgba(255,255,255,0.35), transparent 40%), radial-gradient(circle at 75% 65%, rgba(255,80,80,0.4), transparent 35%)",
            filter: `blur(${effect.radius}px)`,
            opacity: disabled ? 0.4 : 1
          }}
        />
      </div>
      <ParamRow
        label="Radius"
        value={effect.radius}
        min={0}
        max={40}
        step={0.5}
        unit="px"
        format={(v) => v.toFixed(1)}
        onChange={(v) => onPatch({ radius: v })}
        disabled={disabled}
      />
    </FlexColumn>
  );
};

const SharpenEditor: React.FC<
  EffectEditorProps<TrackSharpenEffect>
> = ({ effect, onPatch, disabled }) => (
  <FlexColumn gap={0.5}>
    <ParamRow
      label="Amount"
      value={effect.amount}
      min={0}
      max={2}
      step={0.01}
      format={(v) => v.toFixed(2)}
      onChange={(v) => onPatch({ amount: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Threshold"
      value={effect.threshold}
      min={0}
      max={1}
      step={0.01}
      format={(v) => v.toFixed(2)}
      onChange={(v) => onPatch({ threshold: v })}
      disabled={disabled}
    />
  </FlexColumn>
);

const VignetteEditor: React.FC<
  EffectEditorProps<TrackVignetteEffect>
> = ({ effect, onPatch, disabled }) => {
  const theme = useTheme();
  // Visualize as a radial fade in a 16:9 box.
  const innerStop = Math.max(0, effect.radius - effect.softness);
  return (
    <FlexColumn gap={0.5}>
      <div
        css={previewBoxStyles(theme)}
        style={{
          opacity: disabled ? 0.4 : 1
        }}
      >
        <div
          css={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at center, transparent ${(
              innerStop * 100
            ).toFixed(0)}%, rgba(0,0,0,${effect.intensity.toFixed(
              2
            )}) ${(effect.radius * 100).toFixed(0)}%)`
          }}
        />
      </div>
      <ParamRow
        label="Intensity"
        value={effect.intensity}
        min={0}
        max={1}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onPatch({ intensity: v })}
        disabled={disabled}
      />
      <ParamRow
        label="Radius"
        value={effect.radius}
        min={0.1}
        max={1.5}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onPatch({ radius: v })}
        disabled={disabled}
      />
      <ParamRow
        label="Softness"
        value={effect.softness}
        min={0}
        max={1}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onPatch({ softness: v })}
        disabled={disabled}
      />
    </FlexColumn>
  );
};

const swatchStyles = (theme: Theme) =>
  css({
    width: 28,
    height: 28,
    borderRadius: 4,
    border: `1px solid ${theme.vars.palette.divider}`,
    cursor: "pointer",
    padding: 0,
    background: "none",
    flexShrink: 0,
    "&::-webkit-color-swatch": { border: "none", borderRadius: 3 },
    "&::-moz-color-swatch": { border: "none", borderRadius: 3 }
  });

const ChromaKeyEditor: React.FC<
  EffectEditorProps<TrackChromaKeyEffect>
> = ({ effect, onPatch, disabled }) => {
  const theme = useTheme();
  return (
    <FlexColumn gap={0.5}>
      <FlexRow gap={1} align="center">
        <span
          css={{
            fontSize: theme.typography.caption.fontSize,
            color: theme.vars.palette.text.secondary,
            width: 70
          }}
        >
          Key color
        </span>
        <input
          type="color"
          css={swatchStyles(theme)}
          value={effect.keyColor}
          disabled={disabled}
          onChange={(e) => onPatch({ keyColor: e.target.value })}
          aria-label="Chroma key color"
        />
        <span
          css={{
            fontSize: theme.typography.caption.fontSize,
            color: theme.vars.palette.text.primary,
            fontVariantNumeric: "tabular-nums"
          }}
        >
          {effect.keyColor.toUpperCase()}
        </span>
      </FlexRow>
      <ParamRow
        label="Tolerance"
        value={effect.tolerance}
        min={0}
        max={1}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onPatch({ tolerance: v })}
        disabled={disabled}
      />
      <ParamRow
        label="Softness"
        value={effect.softness}
        min={0}
        max={1}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onPatch({ softness: v })}
        disabled={disabled}
      />
      <ParamRow
        label="Spill"
        value={effect.spill}
        min={0}
        max={1}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onPatch({ spill: v })}
        disabled={disabled}
      />
    </FlexColumn>
  );
};

// ── Effect card ─────────────────────────────────────────────────────────────

interface EffectCardProps {
  trackId: string;
  effect: TrackEffect;
  index: number;
}

const DRAG_MIME = "application/x-nodetool-effect-index";

const EffectCard: React.FC<EffectCardProps> = memo(
  ({ trackId, effect, index }) => {
    const theme = useTheme();
    const updateTrackEffect = useTimelineStore((s) => s.updateTrackEffect);
    const removeTrackEffect = useTimelineStore((s) => s.removeTrackEffect);
    const moveTrackEffect = useTimelineStore((s) => s.moveTrackEffect);

    const [dragOver, setDragOver] = useState<"left" | "right" | null>(null);
    const [dragging, setDragging] = useState(false);

    const handleEnabledChange = useCallback(
      (enabled: boolean) => {
        updateTrackEffect(trackId, effect.id, { enabled });
      },
      [trackId, effect.id, updateTrackEffect]
    );

    const handleRemove = useCallback(() => {
      removeTrackEffect(trackId, effect.id);
    }, [trackId, effect.id, removeTrackEffect]);

    // The store's `updateTrackEffect` patch type is `Partial<TrackEffect>` —
    // we narrow per-type below so the editor receives the right `Partial<E>`.
    const patch = useCallback(
      (p: Partial<TrackEffect>) => updateTrackEffect(trackId, effect.id, p),
      [trackId, effect.id, updateTrackEffect]
    );

    const handleDragStart = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData(DRAG_MIME, String(index));
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      },
      [index]
    );

    const handleDragEnd = useCallback(() => {
      setDragging(false);
      setDragOver(null);
    }, []);

    const handleDragOver = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        const isLeft = e.clientX - rect.left < rect.width / 2;
        setDragOver(isLeft ? "left" : "right");
      },
      []
    );

    const handleDragLeave = useCallback(() => {
      setDragOver(null);
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        const raw = e.dataTransfer.getData(DRAG_MIME);
        setDragOver(null);
        if (!raw) return;
        const from = parseInt(raw, 10);
        if (Number.isNaN(from) || from === index) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const dropLeft = e.clientX - rect.left < rect.width / 2;
        let to = dropLeft ? index : index + 1;
        // Adjust target when the dragged item came from before this one.
        if (from < to) to -= 1;
        if (to === from) return;
        moveTrackEffect(trackId, from, to);
      },
      [index, moveTrackEffect, trackId]
    );

    const disabled = !effect.enabled;

    return (
      <div
        css={effectCardStyles(
          theme,
          DEVICE_WIDTHS[effect.type],
          dragOver,
          dragging
        )}
        data-testid={`effect-${effect.id}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <FlexRow css={effectHeaderStyles} sx={{ mb: 0.5 }}>
          <FlexRow gap={0.5} align="center">
            <Tooltip title="Drag to reorder">
              <div
                css={dragHandleStyles(theme)}
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                aria-label="Drag to reorder effect"
                role="button"
                tabIndex={0}
              >
                <DragIndicatorIcon />
              </div>
            </Tooltip>
            <LabeledSwitch
              label={EFFECT_LABELS[effect.type]}
              checked={effect.enabled}
              onChange={handleEnabledChange}
              size="small"
            />
          </FlexRow>
          <FlexRow gap={0.5}>
            <Tooltip title="Remove effect">
              <button
                type="button"
                css={iconButtonStyles(theme)}
                onClick={handleRemove}
                aria-label="Remove effect"
              >
                <DeleteOutlineIcon />
              </button>
            </Tooltip>
          </FlexRow>
        </FlexRow>

        {effect.type === "gain" && (
          <GainEditor
            effect={effect}
            onPatch={patch}
            disabled={disabled}
          />
        )}
        {effect.type === "eq3" && (
          <Eq3Editor effect={effect} onPatch={patch} disabled={disabled} />
        )}
        {effect.type === "filter" && (
          <FilterEditor
            effect={effect}
            onPatch={patch}
            disabled={disabled}
          />
        )}
        {effect.type === "compressor" && (
          <CompressorEditor
            effect={effect}
            onPatch={patch}
            disabled={disabled}
          />
        )}
        {effect.type === "colorCorrection" && (
          <ColorCorrectionEditor
            effect={effect}
            onPatch={patch}
            disabled={disabled}
          />
        )}
        {effect.type === "videoBlur" && (
          <VideoBlurEditor
            effect={effect}
            onPatch={patch}
            disabled={disabled}
          />
        )}
        {effect.type === "sharpen" && (
          <SharpenEditor
            effect={effect}
            onPatch={patch}
            disabled={disabled}
          />
        )}
        {effect.type === "vignette" && (
          <VignetteEditor
            effect={effect}
            onPatch={patch}
            disabled={disabled}
          />
        )}
        {effect.type === "chromaKey" && (
          <ChromaKeyEditor
            effect={effect}
            onPatch={patch}
            disabled={disabled}
          />
        )}
      </div>
    );
  }
);
EffectCard.displayName = "EffectCard";

// ── Panel ───────────────────────────────────────────────────────────────────

export interface TrackEffectsPanelProps {
  trackId: string;
}

export const TrackEffectsPanel: React.FC<TrackEffectsPanelProps> = memo(
  ({ trackId }) => {
    const theme = useTheme();
    const track = useTimelineStore((s) =>
      s.tracks.find((t) => t.id === trackId)
    );
    const addTrackEffect = useTimelineStore((s) => s.addTrackEffect);

    const [addAnchor, setAddAnchor] = React.useState<HTMLElement | null>(null);

    const handleOpenAdd = useCallback((e: React.MouseEvent<HTMLElement>) => {
      setAddAnchor(e.currentTarget);
    }, []);

    const handleCloseAdd = useCallback(() => {
      setAddAnchor(null);
    }, []);

    const handleAdd = useCallback(
      (type: TrackEffect["type"]) => {
        addTrackEffect(trackId, type);
        setAddAnchor(null);
      },
      [trackId, addTrackEffect]
    );

    const effects = useMemo(() => track?.effects ?? [], [track?.effects]);

    if (!track) {
      return null;
    }

    const isVideo = track.type === "video";
    const availableTypes = isVideo
      ? VIDEO_EFFECT_TYPES
      : AUDIO_EFFECT_TYPES;
    const chainLabel = isVideo ? "FX Chain" : "DSP Chain";

    return (
      <div css={containerStyles(theme)} data-testid="track-effects-panel">
        <FlexRow
          css={effectHeaderStyles}
          sx={{ mb: 1, alignItems: "center" }}
        >
          <Text size="small" weight={600}>
            {chainLabel} - {track.name}
          </Text>
          <button type="button" css={addButtonStyles(theme)} onClick={handleOpenAdd}>
            <AddIcon />
            Add
          </button>
          <Menu
            anchorEl={addAnchor}
            open={!!addAnchor}
            onClose={handleCloseAdd}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            {availableTypes.map((t) => (
              <NodeMenuItem key={t} onClick={() => handleAdd(t)}>
                {EFFECT_LABELS[t]}
              </NodeMenuItem>
            ))}
          </Menu>
        </FlexRow>

        {effects.length === 0 ? (
          <Text size="small" color="secondary">
            No effects. Click <strong>Add</strong> to insert one.
          </Text>
        ) : (
          <div css={deviceRackStyles(theme)}>
            {effects.map((effect, index) => (
              <EffectCard
                key={effect.id}
                trackId={trackId}
                effect={effect}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

TrackEffectsPanel.displayName = "TrackEffectsPanel";
