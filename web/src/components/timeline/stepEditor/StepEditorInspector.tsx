/**
 * The lane inspector: a column left of the lane names with the clip header,
 * the Lane Set select and the parameters of the selected lane. Grid, Pen
 * Width, Style and Length are editable. Status, MIDI Channel and Number are
 * shown as the lane was created.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { QUANTIZE_DIVISIONS } from "@nodetool-ai/timeline";
import type { QuantizeDivision } from "@nodetool-ai/timeline";

import {
  Caption,
  Divider,
  FlexColumn,
  FlexRow,
  SPACING,
  SelectField,
  Text,
  TextInput,
  TruncatedText
} from "../../ui_primitives";
import type {
  StepLaneParams,
  StepLaneSet
} from "../../../stores/timeline/TimelineUIStore";
import type { StepLaneView } from "./stepEditorModel";

/** Width of the inspector column. */
export const STEP_INSPECTOR_WIDTH_PX = 216;
export const PEN_WIDTH_MIN = 1;
export const PEN_WIDTH_MAX = 16;

const QUANTIZE_VALUE_KEYS: Record<QuantizeDivision, string> = {
  "1/4": "quarter",
  "1/8": "eighth",
  "1/16": "sixteenth",
  "1/32": "thirtySecond",
  "1/8T": "eighthTriplet",
  "1/16T": "sixteenthTriplet"
};

const STATUS_KEYS: Record<StepLaneView["status"], string> = {
  note: "note",
  control: "control",
  pitchBend: "pitchBend",
  channelPressure: "channelPressure",
  polyPressure: "polyPressure"
};

interface StepEditorInspectorProps {
  clipName: string;
  laneSet: StepLaneSet;
  onLaneSet: (set: StepLaneSet) => void;
  lane: StepLaneView | null;
  laneName: string;
  params: StepLaneParams;
  /** The length a note gets when `params.length` is null: one grid step. */
  gridTicks: number;
  onParams: (patch: Partial<StepLaneParams>) => void;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <FlexRow justify="space-between" align="center" gap={SPACING.sm}>
    <Caption color="muted">{label}</Caption>
    {children}
  </FlexRow>
);

export const StepEditorInspector: React.FC<StepEditorInspectorProps> = memo((props) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const S = (key: string, opts?: Record<string, unknown>) =>
    t(`pass3_20.stepEditor.inspector.${key}`, opts);
  const gridOptions = QUANTIZE_DIVISIONS.map((value) => ({
    value,
    label: t(`pass3_20.pianoRoll.logic.quantizeValues.${QUANTIZE_VALUE_KEYS[value]}`)
  }));
  const { lane, params } = props;
  const length = params.length ?? Math.max(1, Math.round(props.gridTicks));
  return (
    <FlexColumn
      data-testid="step-editor-inspector"
      gap={SPACING.md}
      sx={{
        width: STEP_INSPECTOR_WIDTH_PX,
        flexShrink: 0,
        overflowY: "auto",
        p: SPACING.md,
        borderRight: `1px solid ${theme.vars.palette.divider}`
      }}
    >
      <FlexRow gap={SPACING.xs} align="center" sx={{ minWidth: 0 }}>
        <Caption color="muted">{S("clip")}</Caption>
        <Text size="small" weight={500} truncate>{props.clipName}</Text>
      </FlexRow>
      <SelectField
        label={S("laneSet")}
        size="small"
        value={props.laneSet}
        options={[
          { value: "automatic", label: S("laneSetAutomatic") },
          { value: "gmDrums", label: S("laneSetGmDrums") }
        ]}
        onChange={(value) => props.onLaneSet(value as StepLaneSet)}
      />
      <Divider spacing="none" />
      {lane ? (
        <FlexColumn gap={SPACING.sm}>
          <FlexRow gap={SPACING.xs} align="center" sx={{ minWidth: 0 }}>
            <Caption color="muted">{S("lane")}</Caption>
            <Text size="small" weight={500} truncate>{props.laneName}</Text>
          </FlexRow>
          <Row label={S("grid")}>
            <SelectField
              label={S("grid")}
              hideLabel
              size="small"
              value={params.grid}
              options={gridOptions}
              onChange={(value) => props.onParams({ grid: value as QuantizeDivision })}
            />
          </Row>
          <Row label={S("penWidth")}>
            <TextInput
              label={S("penWidth")}
              hideLabel
              type="number"
              compact
              fullWidth={false}
              sx={{ width: 76 }}
              value={params.penWidth}
              inputProps={{ min: PEN_WIDTH_MIN, max: PEN_WIDTH_MAX, step: 1 }}
              onChange={(event) => {
                const next = Math.round(Number(event.target.value));
                if (Number.isFinite(next)) {
                  props.onParams({
                    penWidth: Math.min(PEN_WIDTH_MAX, Math.max(PEN_WIDTH_MIN, next))
                  });
                }
              }}
            />
          </Row>
          <Row label={S("style")}>
            <SelectField
              label={S("style")}
              hideLabel
              size="small"
              value={params.style}
              options={[
                { value: "noFrames", label: S("styleNoFrames") },
                { value: "frames", label: S("styleFrames") }
              ]}
              onChange={(value) => props.onParams({ style: value as StepLaneParams["style"] })}
            />
          </Row>
          {lane.type === "note" && (
            <Row label={S("length")}>
              <TextInput
                label={S("length")}
                hideLabel
                type="number"
                compact
                fullWidth={false}
                sx={{ width: 76 }}
                value={length}
                inputProps={{ min: 1, step: 1 }}
                onChange={(event) => {
                  const next = Math.round(Number(event.target.value));
                  if (Number.isFinite(next) && next >= 1) props.onParams({ length: next });
                }}
              />
            </Row>
          )}
          <Row label={S("status")}>
            <Caption>{S(`statusValues.${STATUS_KEYS[lane.status]}`)}</Caption>
          </Row>
          <Row label={S("midiChannel")}>
            <Caption>{String(lane.channel)}</Caption>
          </Row>
          <Row label={S("number")}>
            <Caption>{lane.number === null ? "" : String(lane.number)}</Caption>
          </Row>
        </FlexColumn>
      ) : (
        <Caption color="muted">
          <TruncatedText>{S("noLane")}</TruncatedText>
        </Caption>
      )}
    </FlexColumn>
  );
});

StepEditorInspector.displayName = "StepEditorInspector";
