import React from "react";
import { moveNotes, setVelocity } from "@nodetool-ai/timeline";
import type { MidiNote } from "@nodetool-ai/timeline";
import { Caption, FlexRow, SPACING, TextInput } from "../../ui_primitives";

interface Props {
  notes: readonly MidiNote[];
  selectedIds: ReadonlySet<string>;
  beatTicks: number;
  onChange: (notes: MidiNote[]) => void;
}

export function NoteSelectionInspector({
  notes,
  selectedIds,
  beatTicks,
  onChange
}: Props) {
  const selected = notes.filter((note) => selectedIds.has(note.id));
  const first = selected[0];
  const lowest = selected.reduce((min, note) => Math.min(min, note.pitch), 127);
  const start = selected.reduce(
    (min, note) => Math.min(min, note.startTick),
    Infinity
  );
  const common = (key: "durationTick" | "velocity") =>
    first && selected.every((note) => note[key] === first[key])
      ? first[key]
      : null;
  const length = common("durationTick");
  const fields = [
    {
      label: "Lowest pitch (MIDI)",
      value: first ? lowest : null,
      min: 0,
      max: 127,
      step: 1,
      apply: (value: number) =>
        moveNotes(notes, selectedIds, {
          deltaPitch: Math.round(value) - lowest,
          deltaTick: 0
        })
    },
    {
      label: "Start beat",
      value: first ? 1 + start / beatTicks : null,
      min: 1,
      step: 1 / beatTicks,
      apply: (value: number) =>
        moveNotes(notes, selectedIds, {
          deltaPitch: 0,
          deltaTick: Math.round((value - 1) * beatTicks) - start
        })
    },
    {
      label: "Length (beats)",
      value: length === null ? null : length / beatTicks,
      min: 1 / beatTicks,
      step: 1 / beatTicks,
      apply: (value: number) =>
        notes.map((note) =>
          selectedIds.has(note.id)
            ? {
                ...note,
                durationTick: Math.max(1, Math.round(value * beatTicks))
              }
            : note
        )
    },
    {
      label: "Velocity",
      value: common("velocity"),
      min: 1,
      max: 127,
      step: 1,
      apply: (value: number) => setVelocity(notes, selectedIds, value)
    }
  ];
  return (
    <FlexRow
      gap={SPACING.md}
      sx={{
        px: SPACING.sm,
        pb: SPACING.sm,
        flexWrap: "wrap",
        alignItems: "end"
      }}
    >
      {fields.map((field) => (
        <TextInput
          key={`${field.label}:${field.value}:${selected.map((note) => note.id).join(",")}`}
          label={field.label}
          type="number"
          compact
          fullWidth={false}
          sx={{ width: 128 }}
          disabled={!first}
          defaultValue={field.value ?? ""}
          placeholder={first ? "Mixed" : "—"}
          inputProps={{ min: field.min, max: field.max, step: field.step }}
          onBlur={(event) => {
            const value = Math.round(Number(event.target.value) / field.step) * field.step;
            if (
              event.target.value.trim() &&
              Number.isFinite(value) &&
              value >= field.min &&
              (field.max === undefined || value <= field.max) &&
              value !== field.value
            )
              onChange(field.apply(value));
            event.target.value = field.value === null ? "" : String(field.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              const input = event.target as HTMLInputElement;
              input.value = field.value === null ? "" : String(field.value);
              input.blur();
            } else if (event.key === "Enter")
              (event.target as HTMLInputElement).blur();
          }}
        />
      ))}
      <Caption color="muted">
        Pitch/start move the group. Length/velocity set all selected notes.
      </Caption>
    </FlexRow>
  );
}
