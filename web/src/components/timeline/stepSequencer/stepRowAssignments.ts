/**
 * The row assignments the Add Row menu and the row header's Row Assignment
 * picker offer (SQ4, SQ19, SQ29, SQ41, SQ42), and the ops that apply one.
 * Both menus read the same groups, so a row type offered by one is offered
 * by the other.
 */

import type { TFunction } from "i18next";
import { GM_DRUM_LANES, INSTRUMENT_DEVICE_ID, formatStepRowSort, parseStepRowSort, stepNoteName } from "@nodetool-ai/timeline";
import type { StepPattern, StepRowAssignment, TimelineTrack } from "@nodetool-ai/timeline";
import type { TimelineOp } from "@nodetool-ai/timeline/ops";

import { automationTargetSpecs } from "../Tracks/automation/automationTargets";

export type RowSortBy = "type" | "typeAndNote" | "typeAndName" | "typeAndKitPad";
export interface RowSort {
  by: RowSortBy;
  descending: boolean;
}

export interface AssignmentChoice {
  id: string;
  label: string;
  assignment: StepRowAssignment;
  /** The row name to write with the assignment, when the label is not derived. */
  name?: string;
}

export interface AssignmentGroup {
  id: string;
  label: string;
  choices: AssignmentChoice[];
}

/** Controllers with an SE3 name; every other CC reads `CC <n>`. */
const NAMED_CCS: Readonly<Record<number, string>> = { 1: "1", 7: "7", 10: "10", 11: "11", 64: "64", 74: "74" };
const DEGREES = ["root", "2nd", "3rd", "4th", "5th", "6th", "7th"] as const;

/** Every row assignment the track can take, grouped as the Add Row menu shows them. */
export function assignmentGroups(track: TimelineTrack | undefined, t: TFunction): AssignmentGroup[] {
  const instrument = track?.instrument;
  const groups: AssignmentGroup[] = [];

  const kit: AssignmentChoice[] =
    instrument?.type === "drum"
      ? instrument.pads.map((p, i) => ({
          id: `pad.${i}`,
          label: p.name || t("stepSequencer.addRow.pad", { n: i + 1 }),
          assignment: { type: "kit", pad: i }
        }))
      : instrument?.type === "sampler"
        ? instrument.zones.slice(0, 16).map((z, i) => ({
            id: `pad.${i}`,
            label: z.name || t("stepSequencer.addRow.pad", { n: i + 1 }),
            assignment: { type: "kit", pad: i }
          }))
        : [];
  if (kit.length) groups.push({ id: "kit", label: t("stepSequencer.addRow.kit"), choices: kit });

  groups.push({
    id: "drums",
    label: t("stepSequencer.addRow.drums"),
    choices: GM_DRUM_LANES.map((lane) => ({
      id: `drum.${lane.pitch}`,
      label: lane.name,
      name: lane.name,
      assignment: { type: "note", pitch: lane.pitch }
    }))
  });
  // The full MIDI range, highest first as on a keyboard read top down.
  groups.push({
    id: "notes",
    label: t("stepSequencer.addRow.notes"),
    choices: Array.from({ length: 128 }, (_, i) => 127 - i).map((pitch) => ({
      id: `note.${pitch}`,
      label: stepNoteName(pitch),
      assignment: { type: "note", pitch }
    }))
  });
  groups.push({
    id: "melodic",
    label: t("stepSequencer.addRow.melodic"),
    choices: [{ id: "melodic", label: t("stepSequencer.addRow.melodic"), assignment: { type: "melodic", pitch: 60 } }]
  });
  groups.push({
    id: "degrees",
    label: t("stepSequencer.addRow.degrees"),
    choices: DEGREES.map((degree) => ({
      id: `degree.${degree}`,
      label: t(`stepSequencer.addRow.degree.${degree}`),
      assignment: { type: "degree", degree, octave: 3 }
    }))
  });
  groups.push({
    id: "controllers",
    label: t("stepSequencer.addRow.controllers"),
    choices: [
      { id: "pb", label: t("stepSequencer.addRow.pitchBend"), assignment: { type: "automation", target: { kind: "pitchBend" } } },
      {
        id: "cp",
        label: t("stepSequencer.addRow.channelPressure"),
        assignment: { type: "automation", target: { kind: "channelPressure" } }
      },
      ...Array.from({ length: 128 }, (_, cc) => ({
        id: `cc.${cc}`,
        label: NAMED_CCS[cc]
          ? t("stepSequencer.addRow.automationCc", { name: t(`stepSequencer.addRow.cc.${NAMED_CCS[cc]}`), cc })
          : t("stepSequencer.addRow.ccNumber", { cc }),
        assignment: { type: "automation" as const, target: { kind: "cc" as const, cc } }
      }))
    ]
  });

  // Instrument parameters, then insert parameters (SQ41). The mixer is a
  // track lane, not a row target.
  const specs = track ? automationTargetSpecs(track, t).filter((s) => s.target.kind === "device") : [];
  const deviceChoice = (s: (typeof specs)[number]): AssignmentChoice => {
    const target = s.target as { kind: "device"; deviceId: string; param: string };
    return {
      id: `device.${target.deviceId}.${target.param}`,
      label: `${s.group} · ${s.label}`,
      name: s.label,
      assignment: { type: "automation", target: { kind: "device", deviceId: target.deviceId, param: target.param } }
    };
  };
  const own = specs.filter((s) => (s.target as { deviceId: string }).deviceId === INSTRUMENT_DEVICE_ID);
  const inserts = specs.filter((s) => (s.target as { deviceId: string }).deviceId !== INSTRUMENT_DEVICE_ID);
  if (own.length) groups.push({ id: "instrument", label: t("stepSequencer.addRow.instrument"), choices: own.map(deviceChoice) });
  if (inserts.length) groups.push({ id: "inserts", label: t("stepSequencer.addRow.inserts"), choices: inserts.map(deviceChoice) });
  return groups;
}

/** Degree rows need the chord pitch source (SQ19); choosing one switches it on in the same undo entry. */
function pitchSourceOps(clipId: string, pattern: StepPattern, assignment: StepRowAssignment): TimelineOp[] {
  return assignment.type === "degree" && pattern.pitchSource !== "chords"
    ? [{ op: "set_pattern", clipId, pitchSource: "chords" }]
    : [];
}

/** Add one row; a kept sort places it in sorted order (SQ36). */
export function addRowOps(clipId: string, pattern: StepPattern, choice: AssignmentChoice, sort: RowSort | null): TimelineOp[] {
  return [
    ...pitchSourceOps(clipId, pattern, choice.assignment),
    { op: "add_pattern_rows", clipId, rows: [{ assignment: choice.assignment, ...(choice.name ? { name: choice.name } : {}) }] },
    ...sortOps(clipId, sort)
  ] as TimelineOp[];
}

/** Reassign rows. A row keeps a custom name only when the choice has none. */
export function assignRowOps(clipId: string, pattern: StepPattern, rowIds: readonly string[], choice: AssignmentChoice, sort: RowSort | null): TimelineOp[] {
  return [
    ...pitchSourceOps(clipId, pattern, choice.assignment),
    ...rowIds.map((row) => ({ op: "set_pattern_row" as const, clipId, row, assignment: choice.assignment, name: choice.name ?? "" })),
    ...sortOps(clipId, sort)
  ] as TimelineOp[];
}

/** Re-apply the pattern's kept sort after an edit that does not place rows itself (SQ36). */
export function sortOps(clipId: string, sort: RowSort | null): TimelineOp[] {
  return sort ? [{ op: "set_pattern_row_sort", clipId, rowSort: formatStepRowSort(sort.by, sort.descending) }] : [];
}

/** The pattern's kept sort, read from its `rowSort` field. */
export function patternRowSort(pattern: StepPattern | undefined): RowSort | null {
  return parseStepRowSort(pattern?.rowSort);
}

/** The choice id an existing row's assignment matches, for the picker's selected item. */
export function assignmentChoiceId(a: StepRowAssignment): string {
  switch (a.type) {
    case "kit":
      return `pad.${a.pad}`;
    case "note":
      return `note.${a.pitch}`;
    case "melodic":
      return "melodic";
    case "degree":
      return `degree.${a.degree}`;
    case "automation":
      if (a.target.kind === "cc") return `cc.${a.target.cc}`;
      if (a.target.kind === "pitchBend") return "pb";
      if (a.target.kind === "channelPressure") return "cp";
      return `device.${a.target.deviceId}.${a.target.param}`;
  }
}
