/** @jsxImportSource @emotion/react */
/** The selected MIDI track's instrument in the right-panel Instruments tab. */
import React, { memo, useCallback, useEffect, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { findInstrumentPreset, presetIdForInstrument } from "@nodetool-ai/timeline";
import type { MidiInstrument } from "@nodetool-ai/timeline";
import { DEFAULT_TIMELINE_INSTRUMENT, TIMELINE_INSTRUMENT_PRESETS } from "../../../stores/timeline/instrumentPresets";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { playAuditionNote } from "../preview/audition";
import FableSynthInstrumentEditor, { InstrumentKeyboard } from "./FableSynthInstrumentEditors";
import { Button, Caption, FlexColumn, SelectField, SPACING } from "../../ui_primitives";
export const AUDITION_DEBOUNCE_MS = 120;
const containerStyles = (theme: Theme) => css({
  width: "100%", height: "100%", padding: theme.spacing(1),
  backgroundColor: theme.vars.palette.background.default,
  color: theme.vars.palette.text.primary, boxSizing: "border-box",
  overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain"
});

interface TrackInstrumentPanelProps {
  trackId: string;
}

export const TrackInstrumentPanel: React.FC<TrackInstrumentPanelProps> = memo(
  ({ trackId }) => {
    const theme = useTheme();
    const instrument = useTimelineStore(
      (s) =>
        s.tracks.find((t) => t.id === trackId)?.instrument ??
        DEFAULT_TIMELINE_INSTRUMENT
    );
    const showKeyboard = useTimelineUIStore(s => !!s.instrumentKeyboards[trackId]);
    const toggleKeyboard = useTimelineUIStore(s => s.toggleInstrumentKeyboard);
    const presetId = instrument.type === "subtractive" ? "custom" : presetIdForInstrument(instrument) ?? "custom";
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

    const commit = useCallback(
      (next: MidiInstrument, auditionPitch?: number) => {
        if (next !== instrument) setTrackInstrument(trackId, next);
        if (auditionTimerRef.current !== null) {
          clearTimeout(auditionTimerRef.current);
        }
        if (next === instrument) {
          void playAuditionNote(next, auditionPitch).catch(() => {
            // A host without Web Audio still supports editing.
          });
          return;
        }
        auditionTimerRef.current = setTimeout(() => {
          auditionTimerRef.current = null;
          void playAuditionNote(next, auditionPitch).catch(() => {
            // A host with no Web Audio cannot preview; the edit still stands.
          });
        }, AUDITION_DEBOUNCE_MS);
      },
      [setTrackInstrument, trackId, instrument]
    );

    return (
      <div
        css={containerStyles(theme)}
        data-testid={`track-instrument-panel-${trackId}`}
      >
        <FlexColumn gap={SPACING.md}>
          <SelectField
            label="Instrument preset"
            css={css({ width: 240, maxWidth: "100%", alignSelf: "flex-start" })}
            size="small"
            value={presetId}
            options={[
              ...TIMELINE_INSTRUMENT_PRESETS.map((preset) => ({
                value: preset.id,
                label: preset.name
              })),
              { value: "custom", label: "Custom" }
            ]}
            onChange={(id) => {
              const preset = findInstrumentPreset(id);
              if (preset) commit(preset.instrument);
            }}
          />
          <Button size="small" variant="text" aria-pressed={showKeyboard}
            sx={{ alignSelf: "flex-start", color: showKeyboard ? "primary.main" : "text.secondary", backgroundColor: showKeyboard ? "action.selected" : "transparent" }}
            onClick={() => toggleKeyboard(trackId)}>Keyboard</Button>
          {showKeyboard && <div className={`fs-editor fs-${instrument.type}`}>
            <InstrumentKeyboard start={instrument.type === "drum" ? instrument.baseNote : instrument.type === "bass" ? 36 : 48}
              onPlay={pitch => commit(instrument, pitch)} />
          </div>}
          {instrument.type === "subtractive" ? <Caption color="muted">Choose a WT-1, BL-1, or DR-1 preset to edit this track’s instrument.</Caption> : (
            <FableSynthInstrumentEditor key={trackId} instrument={instrument} onChange={commit} />
          )}
          <Caption color="muted">
            Every clip on this track plays this voice. Changes are auditioned on{" "}
            {instrument.type === "drum" ? "the selected pad" : "middle C"}.
          </Caption>
        </FlexColumn>
      </div>
    );
  }
);

TrackInstrumentPanel.displayName = "TrackInstrumentPanel";

export default TrackInstrumentPanel;
