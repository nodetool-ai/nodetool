/** @jsxImportSource @emotion/react */
/** The selected MIDI track's instrument in the right-panel Instruments tab. */
import React, { Suspense, memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { findInstrumentPreset, auditionPitch } from "@nodetool-ai/timeline";
import type { MidiInstrument } from "@nodetool-ai/timeline";
import { DEFAULT_TIMELINE_INSTRUMENT, INSTRUMENT_TYPE_OPTIONS, instrumentForType, instrumentSelection } from "../../../stores/timeline/instrumentPresets";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { playAuditionNote } from "../preview/audition";
import SamplerInstrumentEditor from "./SamplerInstrumentEditor";
import FableSynthInstrumentEditor, { InstrumentKeyboard } from "./FableSynthInstrumentEditors";
import { Button, Caption, FlexColumn, LoadingSpinner, SelectField, SPACING } from "../../ui_primitives";
import PanelErrorBoundary from "../../common/PanelErrorBoundary";
import { instrumentView } from "../daw/devices/deviceViews";
import "../daw/devices/registerDeviceViews";
export const AUDITION_DEBOUNCE_MS = 120;
const containerStyles = (theme: Theme) => css({
  width: "100%", height: "100%", padding: theme.spacing(SPACING.xs),
  backgroundColor: theme.vars.palette.background.default,
  color: theme.vars.palette.text.primary, boxSizing: "border-box",
  overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain"
});

interface TrackInstrumentPanelProps {
  trackId: string;
}

export const TrackInstrumentPanel: React.FC<TrackInstrumentPanelProps> = memo(
  ({ trackId }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const [auditionError, setAuditionError] = useState("");
    const instrument = useTimelineStore(
      (s) =>
        s.tracks.find((t) => t.id === trackId)?.instrument ??
        DEFAULT_TIMELINE_INSTRUMENT
    );
    const showKeyboard = useTimelineUIStore(s => !!s.instrumentKeyboards[trackId]);
    const toggleKeyboard = useTimelineUIStore(s => s.toggleInstrumentKeyboard);
    const selection = instrumentSelection(instrument);
    const setTrackInstrument = useTimelineStore((s) => s.setTrackInstrument);
    // The device's own view, when one is registered for this instrument.
    const DeviceView = instrumentView(instrument.type);

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
        setAuditionError("");
        if (next !== instrument) setTrackInstrument(trackId, next);
        if (auditionTimerRef.current !== null) {
          clearTimeout(auditionTimerRef.current);
        }
        if (next === instrument) {
          void playAuditionNote(next, auditionPitch).catch(error => { setAuditionError(error instanceof Error ? error.message : t("i18n-next59.instrument.auditionError")); });
          return;
        }
        auditionTimerRef.current = setTimeout(() => {
          auditionTimerRef.current = null;
          void playAuditionNote(next, auditionPitch).catch(error => { setAuditionError(error instanceof Error ? error.message : t("i18n-next59.instrument.auditionError")); });
        }, AUDITION_DEBOUNCE_MS);
      },
      [setTrackInstrument, trackId, instrument, t]
    );

    return (
      <div
        css={containerStyles(theme)}
        data-testid={`track-instrument-panel-${trackId}`}
      >
        <FlexColumn gap={SPACING.md}>
          <SelectField
            label={t("i18n-next59.instrument.type")}
            css={css({ width: "100%", alignSelf: "flex-start" })}
            size="small"
            value={selection.type}
            options={INSTRUMENT_TYPE_OPTIONS}
            onChange={(type) => {
              const next = instrumentForType(type);
              if (next) commit(next);
            }}
          />
          {selection.presetOptions.length > 1 && (
            <SelectField
              label={t("i18n-next59.instrument.preset")}
              css={css({ width: "100%", alignSelf: "flex-start" })}
              size="small"
              value={selection.presetId}
              options={selection.presetOptions}
              onChange={(id) => {
                const preset = findInstrumentPreset(id);
                if (preset) commit(preset.instrument);
              }}
            />
          )}
          <Button size="small" variant="text" aria-pressed={showKeyboard}
            sx={{ alignSelf: "flex-start", color: showKeyboard ? "primary.main" : "text.secondary", backgroundColor: showKeyboard ? "action.selected" : "transparent" }}
            onClick={() => toggleKeyboard(trackId)}>{t("i18n-next59.instrument.keyboard")}</Button>
          {showKeyboard && <div className={`fs-editor fs-${instrument.type}`}>
            <InstrumentKeyboard start={instrument.type === "sampler" ? Math.min(103, auditionPitch(instrument)) : instrument.type === "drum" ? instrument.baseNote : instrument.type === "bass" ? 36 : 48}
              onPlay={pitch => commit(instrument, pitch)} />
          </div>}
          {DeviceView ? (
            <PanelErrorBoundary panelName={t("i18n-next59.instrument.device")}>
              <Suspense fallback={<LoadingSpinner size="small" text={t("i18n-next59.instrument.loading")} />}>
                <DeviceView trackId={trackId} />
              </Suspense>
            </PanelErrorBoundary>
          ) : instrument.type === "sampler" ? <SamplerInstrumentEditor key={trackId} instrument={instrument} onChange={commit} /> : instrument.type === "subtractive" ? <Caption color="muted">{t("i18n-next59.instrument.choosePreset")}</Caption> : instrument.type === "vst" ? null : (
            <FableSynthInstrumentEditor key={trackId} instrument={instrument} onChange={commit} />
          )}
          {auditionError && <Caption role="alert">{auditionError}</Caption>}
          <Caption color="muted">
            {t("i18n-next59.instrument.auditionDescription", { target: instrument.type === "drum" ? t("i18n-next59.instrument.selectedPad") : instrument.type === "sampler" ? t("i18n-next59.instrument.mappedSampleKey") : t("i18n-next59.instrument.middleC") })}
          </Caption>
        </FlexColumn>
      </div>
    );
  }
);

TrackInstrumentPanel.displayName = "TrackInstrumentPanel";

export default TrackInstrumentPanel;
