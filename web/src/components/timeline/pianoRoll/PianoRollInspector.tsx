/**
 * The local inspector: a column left of the keyboard with the clip header,
 * Time Quantize, Scale Quantize, Velocity and the selected notes' fields.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import { QUANTIZE_DIVISIONS } from "@nodetool-ai/timeline";
import type { MidiNote, QuantizeDivision } from "@nodetool-ai/timeline";

import {
  Caption,
  Checkbox,
  Divider,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  SelectField,
  Slider,
  Text,
  TruncatedText
} from "../../ui_primitives";
import type { QuantizeSettings } from "../../../stores/timeline/TimelineUIStore";
import { NoteSelectionInspector } from "./NoteSelectionInspector";
import { SCALE_ROOT_OPTIONS, scaleOptions } from "./pianoRollTools";

/** Width of the inspector column. */
export const INSPECTOR_WIDTH_PX = 176;

const QUANTIZE_VALUE_KEYS: Record<QuantizeDivision, string> = {
  "1/4": "quarter",
  "1/8": "eighth",
  "1/16": "sixteenth",
  "1/32": "thirtySecond",
  "1/8T": "eighthTriplet",
  "1/16T": "sixteenthTriplet"
};

interface PianoRollInspectorProps {
  clipName: string;
  trackName: string;
  clipColor?: string;
  notes: readonly MidiNote[];
  selectedIds: ReadonlySet<string>;
  beatTicks: number;
  onNotesChange: (notes: MidiNote[]) => void;
  quantize: QuantizeSettings;
  onQuantizeSettings: (patch: Partial<QuantizeSettings>) => void;
  /** A new value quantizes the selection right away. */
  onQuantizeValue: (value: QuantizeDivision) => void;
  onQuantize: () => void;
  scaleRoot: number;
  scaleId: string;
  onScale: (patch: { scaleRoot?: number; scaleId?: string }) => void;
  onScaleQuantize: () => void;
  snapToScale: boolean;
  onSnapToScale: (on: boolean) => void;
  /** The velocity of the earliest selected note, or null with no selection. */
  velocity: number | null;
  onVelocityStart: () => void;
  onVelocityChange: (value: number) => void;
  onVelocityEnd: () => void;
}

const ValueRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <FlexRow justify="space-between" align="center">
    <Caption color="muted">{label}</Caption>
    <Caption>{value}</Caption>
  </FlexRow>
);

export const PianoRollInspector: React.FC<PianoRollInspectorProps> = memo((props) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const L = (key: string, opts?: Record<string, unknown>) =>
    t(`pass3_20.pianoRoll.logic.inspector.${key}`, opts);
  const timeOptions = QUANTIZE_DIVISIONS.map((value) => ({
    value,
    label: t(`pass3_20.pianoRoll.logic.quantizeValues.${QUANTIZE_VALUE_KEYS[value]}`)
  }));
  const scales = scaleOptions(L("chromatic"));
  const chromatic = props.scaleId === "chromatic";
  return (
    <FlexColumn
      data-testid="piano-roll-inspector"
      gap={SPACING.sm}
      sx={{
        width: INSPECTOR_WIDTH_PX,
        flexShrink: 0,
        overflowY: "auto",
        p: SPACING.sm,
        borderRight: `1px solid ${theme.vars.palette.divider}`
      }}
    >
      <FlexRow align="center" gap={SPACING.md}>
        <MusicNoteIcon sx={{ color: props.clipColor ?? theme.vars.palette.primary.main }} />
        <FlexColumn sx={{ minWidth: 0 }}>
          <Text size="small" weight={500} truncate>{props.clipName}</Text>
          <Caption color="muted">
            <TruncatedText>{L("onTrack", { track: props.trackName })}</TruncatedText>
          </Caption>
        </FlexColumn>
      </FlexRow>
      <Divider spacing="none" />
      <FlexColumn gap={SPACING.sm}>
        <Text size="small" weight={500}>{L("timeQuantize")}</Text>
        <FlexRow gap={SPACING.sm} align="center">
          <SelectField
            label={L("quantizeValue")}
            hideLabel
            size="small"
            value={props.quantize.value}
            options={timeOptions}
            onChange={(value) => props.onQuantizeValue(value as QuantizeDivision)}
          />
          <EditorButton variant="outlined" onClick={props.onQuantize} aria-label={L("quantizeApply")}>
            Q
          </EditorButton>
        </FlexRow>
        <ValueRow label={L("strength")} value={String(props.quantize.strengthPct)} />
        <Slider
          aria-label={L("strength")}
          density="compact"
          min={0}
          max={100}
          step={1}
          value={props.quantize.strengthPct}
          onChange={(_, value) => props.onQuantizeSettings({ strengthPct: value as number })}
        />
        <ValueRow label={L("swing")} value={String(props.quantize.swingPct)} />
        <Slider
          aria-label={L("swing")}
          density="compact"
          min={0}
          max={100}
          step={1}
          value={props.quantize.swingPct}
          onChange={(_, value) => props.onQuantizeSettings({ swingPct: value as number })}
        />
      </FlexColumn>
      <Divider spacing="none" />
      <FlexColumn gap={SPACING.sm}>
        <Text size="small" weight={500}>{L("scaleQuantize")}</Text>
        <FlexRow gap={SPACING.sm} align="center">
          <SelectField
            label={L("scaleRoot")}
            hideLabel
            size="small"
            value={props.scaleRoot}
            options={SCALE_ROOT_OPTIONS}
            onChange={(value) => props.onScale({ scaleRoot: Number(value) })}
          />
          <SelectField
            label={L("scaleName")}
            hideLabel
            size="small"
            value={props.scaleId}
            options={scales}
            onChange={(value) => props.onScale({ scaleId: value })}
          />
          <EditorButton
            variant="outlined"
            disabled={chromatic}
            onClick={props.onScaleQuantize}
            aria-label={L("scaleQuantizeApply")}
          >
            Q
          </EditorButton>
        </FlexRow>
        <Checkbox
          size="small"
          compact
          label={L("snapToScale")}
          checked={props.snapToScale}
          onChange={(event) => props.onSnapToScale(event.target.checked)}
        />
      </FlexColumn>
      <Divider spacing="none" />
      <FlexColumn gap={SPACING.sm}>
        <ValueRow label={L("velocity")} value={props.velocity === null ? "" : String(props.velocity)} />
        <Slider
          aria-label={t("pass3_20.pianoRoll.accessibility.selectedNoteVelocity")}
          density="compact"
          min={1}
          max={127}
          step={1}
          disabled={props.velocity === null}
          value={props.velocity ?? 100}
          onPointerDown={props.onVelocityStart}
          onChange={(_, value) => props.onVelocityChange(value as number)}
          onChangeCommitted={props.onVelocityEnd}
          onPointerCancel={props.onVelocityEnd}
        />
      </FlexColumn>
      <Divider spacing="none" />
      <FlexColumn gap={SPACING.sm}>
        <Text size="small" weight={500}>{L("note")}</Text>
        <NoteSelectionInspector
          notes={props.notes}
          selectedIds={props.selectedIds}
          beatTicks={props.beatTicks}
          onChange={props.onNotesChange}
        />
      </FlexColumn>
    </FlexColumn>
  );
});

PianoRollInspector.displayName = "PianoRollInspector";
