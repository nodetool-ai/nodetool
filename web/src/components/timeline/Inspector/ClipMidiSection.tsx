/**
 * MIDI section: what a note edit does to the selected clip.
 *
 * Every control here rewrites the clip's whole note list through one store
 * action, so each is one undo entry. Transpose applies on the button; quantize
 * and velocity gather their settings first and apply on demand — a live slider
 * would rewrite the part on every frame and bury the original under a hundred
 * undo steps.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";

import {
  QUANTIZE_DIVISIONS,
  formatBarsBeats,
  noteWindowMs,
  resolveTempo
} from "@nodetool-ai/timeline";
import type {
  QuantizeDivision,
  QuantizeTarget,
  TimelineClip
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import {
  Button,
  Caption,
  CollapsibleSection,
  FlexColumn,
  FlexRow,
  SPACING
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow,
  InspectorStaticValue
} from "./InspectorPrimitives";

const DIVISION_OPTIONS = QUANTIZE_DIVISIONS.map((division) => ({
  value: division,
  label: division
}));

const MIN_VELOCITY_FACTOR = 0.1;
const MAX_VELOCITY_FACTOR = 4;

/** The transpose steps the buttons offer, in the order they are drawn. */
const TRANSPOSE_STEPS = [-12, -1, 1, 12] as const;

const stepLabel = (semitones: number): string =>
  semitones > 0 ? `+${semitones}` : String(semitones);

interface ClipMidiSectionProps {
  clip: TimelineClip;
}

export const ClipMidiSection: React.FC<ClipMidiSectionProps> = memo(
  ({ clip }) => {
    const { t } = useTranslation();
    const [open, setOpen] = usePersistedFold("midi");
    const tempo = useTimelineStore((s) => resolveTempo(s));
    const transposeClip = useTimelineStore((s) => s.transposeClip);
    const quantizeClip = useTimelineStore((s) => s.quantizeClip);
    const scaleClipVelocity = useTimelineStore((s) => s.scaleClipVelocity);
    const gridDivision = useTimelineUIStore((s) => s.gridDivision);
    const openPianoRoll = useTimelineUIStore((s) => s.openPianoRoll);

    const [division, setDivision] = useState<QuantizeDivision>(() =>
      (QUANTIZE_DIVISIONS as readonly string[]).includes(gridDivision)
        ? (gridDivision as QuantizeDivision)
        : "1/16"
    );
    const [strength, setStrength] = useState(1);
    const [target, setTarget] = useState<QuantizeTarget>("start");
    const [velocityFactor, setVelocityFactor] = useState(1);

    const notes = clip.notes ?? [];
    // A note the clip's window does not reach is stored but never heard —
    // trimming hides notes rather than deleting them, so the two counts differ.
    const audibleCount = useMemo(() => {
      const fromMs = clip.inPointMs ?? 0;
      const toMs = fromMs + clip.durationMs;
      return notes.filter((note) => {
        const { startMs, endMs } = noteWindowMs(note, tempo.bpm);
        return endMs > fromMs && startMs < toMs;
      }).length;
    }, [notes, clip.inPointMs, clip.durationMs, tempo.bpm]);

    const handleEditNotes = useCallback(
      () => openPianoRoll(clip.id),
      [clip.id, openPianoRoll]
    );
    const handleTranspose = useCallback(
      (semitones: number) => transposeClip(clip.id, semitones),
      [clip.id, transposeClip]
    );
    const handleDivisionChange = useCallback(
      (value: string) => setDivision(value as QuantizeDivision),
      []
    );
    const handleTargetChange = useCallback(
      (value: string) => setTarget(value as QuantizeTarget),
      []
    );
    const handleQuantize = useCallback(
      () => quantizeClip(clip.id, { division, strength, target }),
      [clip.id, quantizeClip, division, strength, target]
    );
    const handleScaleVelocity = useCallback(
      () => scaleClipVelocity(clip.id, velocityFactor),
      [clip.id, scaleClipVelocity, velocityFactor]
    );
    const targetOptions = [
      { value: "start", label: t("pass3_25.timeline.inspector.midi.onsets") },
      {
        value: "start_and_length",
        label: t("pass3_25.timeline.inspector.midi.onsetsAndLengths")
      }
    ] as const;

    return (
      <>
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title={t("pass3_25.timeline.inspector.midi.title")}
              icon={<MusicNoteOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            <InspectorRow label={t("pass3_25.timeline.inspector.midi.notes")}>
              <InspectorStaticValue
                value={t("pass3_25.timeline.inspector.midi.noteCount", {
                  total: notes.length,
                  audible: audibleCount
                })}
              />
            </InspectorRow>
            <InspectorRow
              label={t("pass3_25.timeline.inspector.midi.startsAt")}
            >
              <InspectorStaticValue
                value={`${formatBarsBeats(clip.startMs, tempo)} · ${tempo.bpm} BPM`}
              />
            </InspectorRow>

            <FlexRow justify="flex-end">
              <Button size="small" variant="outlined" onClick={handleEditNotes}>
                {t("pass3_25.timeline.inspector.midi.editNotes")}
              </Button>
            </FlexRow>

            <InspectorRow
              label={t("pass3_25.timeline.inspector.midi.transpose")}
            >
              <FlexRow gap={SPACING.xs}>
                {TRANSPOSE_STEPS.map((semitones) => (
                  <Button
                    key={semitones}
                    size="small"
                    variant="outlined"
                    aria-label={t(
                      "pass3_25.timeline.inspector.midi.transposeSemitones",
                      { amount: stepLabel(semitones) }
                    )}
                    onClick={() => handleTranspose(semitones)}
                  >
                    {stepLabel(semitones)}
                  </Button>
                ))}
              </FlexRow>
            </InspectorRow>

            <InspectorRow
              label={t("pass3_25.timeline.inspector.midi.quantize")}
            >
              <InspectorSelect
                label={t("pass3_25.timeline.inspector.midi.quantizeDivision")}
                value={division}
                options={DIVISION_OPTIONS}
                onChange={handleDivisionChange}
              />
              <InspectorSelect
                label={t("pass3_25.timeline.inspector.midi.quantizeTarget")}
                value={target}
                options={targetOptions}
                onChange={handleTargetChange}
              />
            </InspectorRow>
            <InspectorSliderRow
              label={t("pass3_25.timeline.inspector.midi.strength")}
              min={0}
              max={1}
              step={0.05}
              value={strength}
              display={strength.toFixed(2)}
              onChange={setStrength}
            />
            <FlexRow justify="flex-end">
              <Button size="small" variant="outlined" onClick={handleQuantize}>
                {t("pass3_25.timeline.inspector.midi.applyQuantize")}
              </Button>
            </FlexRow>

            <InspectorSliderRow
              label={t("pass3_25.timeline.inspector.midi.velocity")}
              min={MIN_VELOCITY_FACTOR}
              max={MAX_VELOCITY_FACTOR}
              step={0.05}
              value={velocityFactor}
              display={velocityFactor.toFixed(2)}
              origin={1}
              onChange={setVelocityFactor}
            />
            <FlexRow justify="flex-end">
              <Button
                size="small"
                variant="outlined"
                onClick={handleScaleVelocity}
              >
                {t("pass3_25.timeline.inspector.midi.applyVelocity")}
              </Button>
            </FlexRow>

            <Caption color="muted">
              {t("pass3_25.timeline.inspector.midi.velocityHelp")}
            </Caption>
          </FlexColumn>
        </CollapsibleSection>
        <InspectorDivider />
      </>
    );
  }
);

ClipMidiSection.displayName = "ClipMidiSection";
