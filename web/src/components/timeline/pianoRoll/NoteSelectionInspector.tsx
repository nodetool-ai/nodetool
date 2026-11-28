import { fitExpressionToDuration, moveNotes, setVelocity } from "@nodetool-ai/timeline";
import type { MidiNote } from "@nodetool-ai/timeline";
import { useTranslation } from "react-i18next";
import { Caption, FlexColumn, FlexRow, SPACING, TextInput } from "../../ui_primitives";

/** Wide enough for "127" or "12.25" beside the number spinner. */
/** The label column: every field starts at the same x. */
const LABEL_COLUMN = "6ch";

interface Props {
  notes: readonly MidiNote[];
  selectedIds: ReadonlySet<string>;
  beatTicks: number;
  onChange: (notes: MidiNote[]) => void;
}

/**
 * Number fields for the selected notes, shown in the local inspector's Note
 * section. Each field shows a short visible label; its accessible name is the
 * full one.
 */
export function NoteSelectionInspector({
  notes,
  selectedIds,
  beatTicks,
  onChange
}: Props) {
  const { t } = useTranslation();
  const selected = notes.filter((note) => selectedIds.has(note.id));
  const first = selected[0];
  const lowest = selected.reduce((min, note) => Math.min(min, note.pitch), 127);
  const start = selected.reduce(
    (min, note) => Math.min(min, note.startTick),
    Infinity
  );
  const common = (read: (note: MidiNote) => number) =>
    first && selected.every((note) => read(note) === read(first))
      ? read(first)
      : null;
  const length = common((note) => note.durationTick);
  const fields = [
    {
      id: "pitch",
      label: t("pass3_20.pianoRoll.inspector.lowestPitch"),
      short: t("pass3_20.pianoRoll.inspector.pitch"),
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
      id: "start",
      label: t("pass3_20.pianoRoll.inspector.startBeat"),
      short: t("pass3_20.pianoRoll.inspector.start"),
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
      id: "length",
      label: t("pass3_20.pianoRoll.inspector.lengthBeats"),
      short: t("pass3_20.pianoRoll.inspector.length"),
      value: length === null ? null : length / beatTicks,
      min: 1 / beatTicks,
      step: 1 / beatTicks,
      apply: (value: number) =>
        notes.map((note) =>
          selectedIds.has(note.id)
            ? fitExpressionToDuration({
                ...note,
                durationTick: Math.max(1, Math.round(value * beatTicks))
              })
            : note
        )
    },
    {
      id: "velocity",
      label: t("pass3_20.pianoRoll.inspector.velocity"),
      short: t("pass3_20.pianoRoll.inspector.velocityShort"),
      value: common((note) => note.velocity),
      min: 1,
      max: 127,
      step: 1,
      apply: (value: number) => setVelocity(notes, selectedIds, value)
    },
    {
      id: "releaseVelocity",
      label: t("pass3_20.pianoRoll.inspector.releaseVelocity"),
      short: t("pass3_20.pianoRoll.inspector.releaseVelocityShort"),
      // An absent release velocity plays as 0, so it reads as 0.
      value: common((note) => note.releaseVelocity ?? 0),
      min: 0,
      max: 127,
      step: 1,
      apply: (value: number) =>
        notes.map((note) =>
          selectedIds.has(note.id) ? { ...note, releaseVelocity: value } : note
        )
    },
    {
      id: "channel",
      label: t("pass3_20.pianoRoll.inspector.channel"),
      short: t("pass3_20.pianoRoll.inspector.channelShort"),
      // Shown 1..16, stored 0..15.
      value: common((note) => (note.channel ?? 0) + 1),
      min: 1,
      max: 16,
      step: 1,
      apply: (value: number) =>
        notes.map((note) =>
          selectedIds.has(note.id) ? { ...note, channel: value - 1 } : note
        )
    }
  ];
  return (
    <FlexColumn gap={SPACING.xs}>
      {fields.map((field) => (
        <FlexRow key={field.id} align="center" gap={SPACING.sm}>
          <Caption color="muted" aria-hidden sx={{ whiteSpace: "nowrap", width: LABEL_COLUMN, flexShrink: 0 }}>
            {field.short}
          </Caption>
          <TextInput
            key={`${field.value}:${selected.map((note) => note.id).join(",")}`}
            label={field.label}
            hideLabel
            type="number"
            compact
            fullWidth
            disabled={!first}
            defaultValue={field.value ?? ""}
            placeholder={first ? "*" : "—"}
            inputProps={{
              min: field.min,
              max: field.max,
              step: field.step,
              title: first && field.value === null ? t("pass3_20.pianoRoll.inspector.mixed") : undefined
            }}
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
        </FlexRow>
      ))}
    </FlexColumn>
  );
}
