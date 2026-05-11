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

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import Menu from "@mui/material/Menu";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

import type {
  TrackEffect,
  TrackGainEffect,
  TrackEq3Effect,
  TrackFilterEffect,
  TrackCompressorEffect
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
  NodeMenuItem
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
    overflowY: "auto",
    overflowX: "hidden",
    boxSizing: "border-box"
  });

const effectCardStyles = (theme: Theme) =>
  css({
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: 4,
    padding: theme.spacing(0.75, 1)
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
    padding: theme.spacing(0.25, 1),
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
  compressor: "Compressor"
};

const EFFECT_TYPES: TrackEffect["type"][] = [
  "gain",
  "eq3",
  "filter",
  "compressor"
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

const Eq3Editor: React.FC<EffectEditorProps<TrackEq3Effect>> = ({
  effect,
  onPatch,
  disabled
}) => (
  <FlexColumn gap={0.25}>
    <ParamRow
      label="Low"
      value={effect.lowGainDb}
      min={-18}
      max={18}
      step={0.1}
      unit="dB"
      format={(v) => v.toFixed(1)}
      onChange={(v) => onPatch({ lowGainDb: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Low Freq"
      value={effect.lowFreq}
      min={40}
      max={400}
      step={1}
      unit="Hz"
      onChange={(v) => onPatch({ lowFreq: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Mid"
      value={effect.midGainDb}
      min={-18}
      max={18}
      step={0.1}
      unit="dB"
      format={(v) => v.toFixed(1)}
      onChange={(v) => onPatch({ midGainDb: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Mid Freq"
      value={effect.midFreq}
      min={100}
      max={8000}
      step={10}
      unit="Hz"
      onChange={(v) => onPatch({ midFreq: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Mid Q"
      value={effect.midQ}
      min={0.1}
      max={10}
      step={0.1}
      format={(v) => v.toFixed(1)}
      onChange={(v) => onPatch({ midQ: v })}
      disabled={disabled}
    />
    <ParamRow
      label="High"
      value={effect.highGainDb}
      min={-18}
      max={18}
      step={0.1}
      unit="dB"
      format={(v) => v.toFixed(1)}
      onChange={(v) => onPatch({ highGainDb: v })}
      disabled={disabled}
    />
    <ParamRow
      label="High Freq"
      value={effect.highFreq}
      min={2000}
      max={16000}
      step={50}
      unit="Hz"
      onChange={(v) => onPatch({ highFreq: v })}
      disabled={disabled}
    />
  </FlexColumn>
);

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

const CompressorEditor: React.FC<EffectEditorProps<TrackCompressorEffect>> = ({
  effect,
  onPatch,
  disabled
}) => (
  <FlexColumn gap={0.25}>
    <ParamRow
      label="Threshold"
      value={effect.thresholdDb}
      min={-60}
      max={0}
      step={0.5}
      unit="dB"
      format={(v) => v.toFixed(1)}
      onChange={(v) => onPatch({ thresholdDb: v })}
      disabled={disabled}
    />
    <ParamRow
      label="Ratio"
      value={effect.ratio}
      min={1}
      max={20}
      step={0.1}
      format={(v) => `${v.toFixed(1)}:1`}
      onChange={(v) => onPatch({ ratio: v })}
      disabled={disabled}
    />
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
);

// ── Effect card ─────────────────────────────────────────────────────────────

interface EffectCardProps {
  trackId: string;
  effect: TrackEffect;
  index: number;
  total: number;
}

const EffectCard: React.FC<EffectCardProps> = memo(
  ({ trackId, effect, index, total }) => {
    const theme = useTheme();
    const updateTrackEffect = useTimelineStore((s) => s.updateTrackEffect);
    const removeTrackEffect = useTimelineStore((s) => s.removeTrackEffect);
    const moveTrackEffect = useTimelineStore((s) => s.moveTrackEffect);

    const handleEnabledChange = useCallback(
      (enabled: boolean) => {
        updateTrackEffect(trackId, effect.id, { enabled });
      },
      [trackId, effect.id, updateTrackEffect]
    );

    const handleRemove = useCallback(() => {
      removeTrackEffect(trackId, effect.id);
    }, [trackId, effect.id, removeTrackEffect]);

    const handleMoveUp = useCallback(() => {
      moveTrackEffect(trackId, index, index - 1);
    }, [trackId, index, moveTrackEffect]);

    const handleMoveDown = useCallback(() => {
      moveTrackEffect(trackId, index, index + 1);
    }, [trackId, index, moveTrackEffect]);

    // The store's `updateTrackEffect` patch type is `Partial<TrackEffect>` —
    // we narrow per-type below so the editor receives the right `Partial<E>`.
    const patch = useCallback(
      (p: Partial<TrackEffect>) => updateTrackEffect(trackId, effect.id, p),
      [trackId, effect.id, updateTrackEffect]
    );

    const disabled = !effect.enabled;

    return (
      <div css={effectCardStyles(theme)} data-testid={`effect-${effect.id}`}>
        <FlexRow css={effectHeaderStyles} sx={{ mb: 0.5 }}>
          <FlexRow gap={0.5} align="center">
            <LabeledSwitch
              label={EFFECT_LABELS[effect.type]}
              checked={effect.enabled}
              onChange={handleEnabledChange}
              size="small"
            />
          </FlexRow>
          <FlexRow gap={0.25}>
            <Tooltip title="Move up">
              <button
                css={iconButtonStyles(theme, index === 0)}
                onClick={handleMoveUp}
                disabled={index === 0}
                aria-label="Move effect up"
              >
                <ArrowUpwardIcon />
              </button>
            </Tooltip>
            <Tooltip title="Move down">
              <button
                css={iconButtonStyles(theme, index === total - 1)}
                onClick={handleMoveDown}
                disabled={index === total - 1}
                aria-label="Move effect down"
              >
                <ArrowDownwardIcon />
              </button>
            </Tooltip>
            <Tooltip title="Remove effect">
              <button
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

    return (
      <div css={containerStyles(theme)} data-testid="track-effects-panel">
        <FlexRow
          css={effectHeaderStyles}
          sx={{ mb: 1, alignItems: "center" }}
        >
          <Text size="small" weight={600}>
            DSP Chain — {track.name}
          </Text>
          <button css={addButtonStyles(theme)} onClick={handleOpenAdd}>
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
            {EFFECT_TYPES.map((t) => (
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
          <FlexColumn gap={0.75}>
            {effects.map((effect, index) => (
              <EffectCard
                key={effect.id}
                trackId={trackId}
                effect={effect}
                index={index}
                total={effects.length}
              />
            ))}
          </FlexColumn>
        )}
      </div>
    );
  }
);

TrackEffectsPanel.displayName = "TrackEffectsPanel";
