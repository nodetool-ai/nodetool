/** @jsxImportSource @emotion/react */
/**
 * TrackInstrumentPanel — the voice a midi track plays.
 *
 * Expands inline under the track row, like the DSP chain editor, and edits the
 * one instrument every clip on the track is rendered with. Each change writes
 * the track and plays a middle C through the new voice, so the sound is
 * audible while the timeline is paused; the audition is debounced, since a
 * slider drag would otherwise fire one note per animation frame.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { DEFAULT_MIDI_INSTRUMENT } from "@nodetool-ai/timeline";
import type { MidiInstrument } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useBatchedGesture } from "../../../hooks/timeline/useBatchedGesture";
import { playAuditionNote } from "../preview/audition";
import {
  Caption,
  FlexColumn,
  FlexRow,
  NodeSlider,
  SelectField,
  Text,
  BORDER_RADIUS,
  FONT_SIZE_SANS,
  SPACING
} from "../../ui_primitives";
import type { SelectOption } from "../../ui_primitives";
import { FX_PANEL_HEIGHT_PX } from "./trackHeight";

/** How long a slider must rest before the note it produced is played. */
export const AUDITION_DEBOUNCE_MS = 120;

const WAVEFORM_OPTIONS: readonly SelectOption[] = [
  { value: "saw", label: "Saw" },
  { value: "square", label: "Square" },
  { value: "triangle", label: "Triangle" },
  { value: "sine", label: "Sine" }
];

const MIN_CUTOFF_HZ = 20;
const MAX_CUTOFF_HZ = 20000;

/** The filter sweeps by ear, not by hertz: the slider is 0..1 over log Hz. */
const cutoffToSlider = (hz: number): number => {
  const clamped = Math.min(MAX_CUTOFF_HZ, Math.max(MIN_CUTOFF_HZ, hz));
  return (
    Math.log(clamped / MIN_CUTOFF_HZ) / Math.log(MAX_CUTOFF_HZ / MIN_CUTOFF_HZ)
  );
};

const sliderToCutoff = (value: number): number =>
  Math.round(
    MIN_CUTOFF_HZ * Math.pow(MAX_CUTOFF_HZ / MIN_CUTOFF_HZ, Math.min(1, Math.max(0, value)))
  );

const containerStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: FX_PANEL_HEIGHT_PX,
    padding: theme.spacing(1, 1.5, 1.5),
    backgroundColor: theme.vars.palette.background.default,
    borderTop: `1px solid ${theme.vars.palette.divider}`,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    color: theme.vars.palette.text.primary,
    boxSizing: "border-box",
    overflowY: "auto"
  });

const cardStyles = (theme: Theme) =>
  css({
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.sm,
    padding: theme.spacing(1),
    background: theme.vars.palette.background.paper
  });

const paramLabelStyles = (theme: Theme) =>
  css({
    width: 70,
    flexShrink: 0,
    fontSize: FONT_SIZE_SANS.caption,
    color: theme.vars.palette.text.secondary
  });

const paramValueStyles = (theme: Theme) =>
  css({
    width: 64,
    flexShrink: 0,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontSize: FONT_SIZE_SANS.caption,
    color: theme.vars.palette.text.primary
  });

interface ParamRowProps {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

const ParamRow: React.FC<ParamRowProps> = memo(
  ({ label, value, display, min, max, step, onChange }) => {
    const theme = useTheme();
    const gesture = useBatchedGesture(onChange);
    const labelCss = useMemo(() => paramLabelStyles(theme), [theme]);
    const valueCss = useMemo(() => paramValueStyles(theme), [theme]);

    const handleChange = useCallback(
      (_e: Event, next: number | number[]) => {
        gesture.schedule(Array.isArray(next) ? next[0] : next);
      },
      [gesture]
    );
    const handleCommitted = useCallback(
      (_e: React.SyntheticEvent | Event, next: number | number[]) => {
        gesture.commit(Array.isArray(next) ? next[0] : next);
      },
      [gesture]
    );

    return (
      <FlexRow align="center" gap={SPACING.md}>
        <span css={labelCss}>{label}</span>
        <NodeSlider
          value={value}
          min={min}
          max={max}
          step={step}
          aria-label={label}
          onChange={handleChange}
          onChangeCommitted={handleCommitted}
          sx={{ flex: 1 }}
        />
        <span css={valueCss}>{display}</span>
      </FlexRow>
    );
  }
);
ParamRow.displayName = "ParamRow";

interface TrackInstrumentPanelProps {
  trackId: string;
}

export const TrackInstrumentPanel: React.FC<TrackInstrumentPanelProps> = memo(
  ({ trackId }) => {
    const theme = useTheme();
    const instrument = useTimelineStore(
      (s) =>
        s.tracks.find((t) => t.id === trackId)?.instrument ??
        DEFAULT_MIDI_INSTRUMENT
    );
    const setTrackInstrument = useTimelineStore((s) => s.setTrackInstrument);

    // One pending audition at a time: a slider drag writes the track on every
    // frame, and each write would otherwise start a note.
    const auditionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
      () => () => {
        if (auditionTimerRef.current !== null) {
          clearTimeout(auditionTimerRef.current);
        }
      },
      []
    );

    const apply = useCallback(
      (patch: Partial<MidiInstrument>) => {
        const next: MidiInstrument = { ...instrument, ...patch };
        setTrackInstrument(trackId, next);
        if (auditionTimerRef.current !== null) {
          clearTimeout(auditionTimerRef.current);
        }
        auditionTimerRef.current = setTimeout(() => {
          auditionTimerRef.current = null;
          void playAuditionNote(next).catch(() => {
            // A host with no Web Audio cannot preview; the edit still stands.
          });
        }, AUDITION_DEBOUNCE_MS);
      },
      [instrument, setTrackInstrument, trackId]
    );

    const handleWaveform = useCallback(
      (value: string) =>
        apply({ waveform: value as MidiInstrument["waveform"] }),
      [apply]
    );
    const handleAttack = useCallback(
      (attackMs: number) => apply({ attackMs }),
      [apply]
    );
    const handleDecay = useCallback(
      (decayMs: number) => apply({ decayMs }),
      [apply]
    );
    const handleSustain = useCallback(
      (sustain: number) => apply({ sustain }),
      [apply]
    );
    const handleRelease = useCallback(
      (releaseMs: number) => apply({ releaseMs }),
      [apply]
    );
    const handleCutoff = useCallback(
      (value: number) => apply({ cutoffHz: sliderToCutoff(value) }),
      [apply]
    );
    const handleResonance = useCallback(
      (resonance: number) => apply({ resonance }),
      [apply]
    );
    const handleGain = useCallback(
      (gainDb: number) => apply({ gainDb }),
      [apply]
    );

    return (
      <div
        css={containerStyles(theme)}
        data-testid={`track-instrument-panel-${trackId}`}
      >
        <FlexColumn gap={SPACING.md}>
          <Text size="small" weight={500}>
            Instrument
          </Text>
          <div css={cardStyles(theme)}>
            <FlexColumn gap={SPACING.xs}>
              <SelectField
                label="Waveform"
                size="small"
                variant="outlined"
                value={instrument.waveform}
                options={WAVEFORM_OPTIONS}
                onChange={handleWaveform}
              />
              <ParamRow
                label="Attack"
                value={instrument.attackMs}
                display={`${Math.round(instrument.attackMs)} ms`}
                min={0}
                max={2000}
                step={1}
                onChange={handleAttack}
              />
              <ParamRow
                label="Decay"
                value={instrument.decayMs}
                display={`${Math.round(instrument.decayMs)} ms`}
                min={0}
                max={4000}
                step={1}
                onChange={handleDecay}
              />
              <ParamRow
                label="Sustain"
                value={instrument.sustain}
                display={instrument.sustain.toFixed(2)}
                min={0}
                max={1}
                step={0.01}
                onChange={handleSustain}
              />
              <ParamRow
                label="Release"
                value={instrument.releaseMs}
                display={`${Math.round(instrument.releaseMs)} ms`}
                min={0}
                max={4000}
                step={1}
                onChange={handleRelease}
              />
              <ParamRow
                label="Cutoff"
                value={cutoffToSlider(instrument.cutoffHz)}
                display={`${Math.round(instrument.cutoffHz)} Hz`}
                min={0}
                max={1}
                step={0.001}
                onChange={handleCutoff}
              />
              <ParamRow
                label="Resonance"
                value={instrument.resonance}
                display={instrument.resonance.toFixed(2)}
                min={0}
                max={20}
                step={0.1}
                onChange={handleResonance}
              />
              <ParamRow
                label="Gain"
                value={instrument.gainDb}
                display={`${instrument.gainDb.toFixed(1)} dB`}
                min={-40}
                max={12}
                step={0.5}
                onChange={handleGain}
              />
            </FlexColumn>
          </div>
          <Caption color="muted">
            Every clip on this track plays this voice. Changes are auditioned on
            middle C.
          </Caption>
        </FlexColumn>
      </div>
    );
  }
);

TrackInstrumentPanel.displayName = "TrackInstrumentPanel";

export default TrackInstrumentPanel;
