/**
 * The Step Sequencer inspector (SQ31, figure p0757): Pattern, Row and Step
 * tabs. The Row tab edits every row in the selection scope and the Step tab
 * every selected step, across rows. A field whose value differs across the
 * scope shows `*`, and an edit to it applies a relative change (p. 754). Each
 * commit is one op list, so one undo entry.
 */

import React, { memo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  PITCH_NAMES,
  SCALES,
  SCALE_IDS,
  STEP_PLAYBACK_MODES,
  STEP_RATES,
  normalizeStep,
  rowLabel
} from "@nodetool-ai/timeline";
import type { MidiInstrument, StepPattern, StepRow, StepScaleId } from "@nodetool-ai/timeline";
import type { TimelineOp } from "@nodetool-ai/timeline/ops";

import {
  Box,
  Caption,
  Checkbox,
  CONTROL,
  EditorButton,
  FlexColumn,
  FlexRow,
  InspectorFieldRow,
  InspectorSection,
  InspectorSelect,
  InspectorToggleRow,
  InspectorValueInput,
  ScrollArea,
  SPACING,
  TabGroup
} from "../../ui_primitives";
import { RowAssignmentMenu } from "./RowAssignmentMenu";
import { assignmentChoiceId, type AssignmentChoice, type AssignmentGroup } from "./stepRowAssignments";
import { isDeviceValue, modeRange, stepModeValue } from "./stepSequencerModel";

export type InspectorTab = "pattern" | "row" | "step";

/** The selected steps of one row (0-based). */
export interface InspectorStepTarget {
  row: StepRow;
  steps: readonly number[];
}

interface Props {
  clipId: string;
  pattern: StepPattern;
  /** The rows the Row tab edits: the selected rows, or the rows of the selected steps. */
  rows: readonly StepRow[];
  stepTargets: readonly InspectorStepTarget[];
  instrument?: MidiInstrument;
  assignmentGroups?: readonly AssignmentGroup[];
  onAssignRows?: (rowIds: string[], choice: AssignmentChoice) => void;
  runOps: (ops: TimelineOp[]) => void;
}

const MIXED = "*";
/** Wide enough for "Mixed" and a note or controller name. */
const ASSIGNMENT_BUTTON_MIN_WIDTH = CONTROL.height.xl * 2 + CONTROL.paddingX.compact;

/** `fraction` keeps decimals, as device parameters (0..1) need (F61). */
type Range = { min: number; max: number; fraction?: boolean };
type Normalized = ReturnType<typeof normalizeStep>;
type Condition = Normalized["condition"];

const clamp = (v: number, r: Range): number => Math.max(r.min, Math.min(r.max, r.fraction ? v : Math.round(v)));

/** A typed number, or null. `+10` and `-5` read as signed numbers. */
function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(/^\*/, "").replace(/^\+/, "");
  if (text === "") return null;
  const v = Number(text);
  return Number.isFinite(v) ? v : null;
}

/** The one shared value, or `*` when the values differ. */
function shared<T>(values: readonly T[]): T | typeof MIXED | undefined {
  if (values.length === 0) return undefined;
  const first = JSON.stringify(values[0]);
  return values.every((v) => JSON.stringify(v) === first) ? values[0] : MIXED;
}

const display = (v: number | string | typeof MIXED | undefined): string => (v === undefined ? "" : String(v));

const isAutomation = (row: StepRow): boolean => row.assignment.type === "automation";

export const StepSequencerInspector: React.FC<Props> = memo(
  ({ clipId, pattern, rows, stepTargets, instrument, assignmentGroups, onAssignRows, runOps }) => {
    const { t } = useTranslation();
    const [tab, setTab] = useState<InspectorTab>(stepTargets.some((x) => x.steps.length > 0) ? "step" : "pattern");
    const [assignAnchor, setAssignAnchor] = useState<HTMLElement | null>(null);

    const rateOptions = STEP_RATES.map((r) => ({ value: r, label: r }));
    const playbackOptions = STEP_PLAYBACK_MODES.map((m) => ({ value: m, label: t(`stepSequencer.playback.${m}`) }));
    const automationOptions = [
      { value: "latch", label: t("stepSequencer.inspector.latch") },
      { value: "slide", label: t("stepSequencer.inspector.slide") }
    ];

    /** A select that shows `*` while the scope differs. */
    const selectField = (
      label: string,
      value: string | typeof MIXED | undefined,
      options: ReadonlyArray<{ value: string; label: string }>,
      onChange: (v: string) => void,
      testId?: string
    ) => (
      <InspectorFieldRow label={label} key={label}>
        <Box data-testid={testId} sx={{ ml: "auto" }}>
          <InspectorSelect
            label={label}
            value={value ?? MIXED}
            options={value === MIXED || value === undefined ? [{ value: MIXED, label: MIXED }, ...options] : options}
            onChange={(v) => {
              if (v !== MIXED) onChange(v);
            }}
          />
        </Box>
      </InspectorFieldRow>
    );

    /**
     * A number field over several items. A shared value edits absolutely, a
     * mixed one relatively; each item clamps to its own range.
     */
    function numberField<T>(
      label: string,
      items: readonly T[],
      get: (item: T) => number,
      range: (item: T) => Range,
      build: (changes: Array<{ item: T; value: number }>) => TimelineOp[],
      unit?: string
    ) {
      const value = shared(items.map(get));
      const r0 = items.length > 0 ? range(items[0]!) : { min: 0, max: 0 };
      return (
        <InspectorFieldRow label={label} key={label}>
          <InspectorValueInput
            value={display(value)}
            unit={unit}
            ariaLabel={label}
            scrub={value === MIXED ? undefined : { step: 1, min: r0.min, max: r0.max }}
            onCommit={(raw) => {
              const typed = parseNumber(raw);
              if (typed === null || items.length === 0) return;
              const changes = items.map((item) => ({
                item,
                value: clamp(value === MIXED ? get(item) + typed : typed, range(item))
              }));
              const ops = build(changes);
              if (ops.length > 0) runOps(ops);
            }}
          />
        </InspectorFieldRow>
      );
    }

    // ── Pattern ──────────────────────────────────────────────────────────
    const patternRows = pattern.rows;
    const patternLoopStart = shared(patternRows.map((r) => r.loopStart + 1)) ?? 1;
    const patternLoopEnd = shared(patternRows.map((r) => r.loopEnd)) ?? pattern.lengthSteps;
    const minRowEnd = patternRows.length > 0 ? Math.min(...patternRows.map((r) => r.loopEnd)) : pattern.lengthSteps;
    const maxRowStart = patternRows.length > 0 ? Math.max(...patternRows.map((r) => r.loopStart + 1)) : 1;
    const key = pattern.key ?? { tonic: 0, mode: "major" as const };
    const keyOptions = (["major", "minor"] as const).flatMap((mode) =>
      PITCH_NAMES.map((name, tonic) => ({ value: `${tonic}:${mode}`, label: `${name} ${t(`stepSequencer.inspector.${mode}`)}` }))
    );
    const scaleOptions = [
      { value: "chromatic", label: t("stepSequencer.inspector.chromatic") },
      ...SCALE_IDS.map((id) => {
        const name = SCALES[id].name.toLowerCase();
        return { value: id, label: name.charAt(0).toUpperCase() + name.slice(1) };
      })
    ];
    const setPattern = (fields: Record<string, unknown>) => runOps([{ op: "set_pattern", clipId, ...fields } as TimelineOp]);
    const patternItem = [pattern];

    const patternTab = (
      <InspectorSection title={t("stepSequencer.inspector.pattern")}>
        {numberField(t("stepSequencer.inspector.length"), patternItem, (p) => p.lengthSteps, () => ({ min: 1, max: 64 }), ([c]) => [
          { op: "set_pattern", clipId, lengthSteps: c!.value }
        ])}
        <InspectorFieldRow label={t("stepSequencer.inspector.loopStart")}>
          <InspectorValueInput
            value={display(patternLoopStart)}
            ariaLabel={t("stepSequencer.inspector.loopStart")}
            onCommit={(raw) => {
              const v = parseNumber(raw);
              if (v === null) return;
              // A mixed value moves each row by the typed amount (F60).
              if (patternLoopStart === MIXED) {
                runOps(patternRows.map((r) => ({ op: "set_pattern_row", clipId, row: r.id, loopStart: clamp(r.loopStart + 1 + v, { min: 1, max: r.loopEnd }) }) as TimelineOp));
                return;
              }
              setPattern({ loopStart: clamp(v, { min: 1, max: minRowEnd }) });
            }}
          />
        </InspectorFieldRow>
        <InspectorFieldRow label={t("stepSequencer.inspector.loopEnd")}>
          <InspectorValueInput
            value={display(patternLoopEnd)}
            ariaLabel={t("stepSequencer.inspector.loopEnd")}
            onCommit={(raw) => {
              const v = parseNumber(raw);
              if (v === null) return;
              if (patternLoopEnd === MIXED) {
                runOps(patternRows.map((r) => ({ op: "set_pattern_row", clipId, row: r.id, loopEnd: clamp(r.loopEnd + v, { min: r.loopStart + 1, max: r.lengthSteps }) }) as TimelineOp));
                return;
              }
              setPattern({ loopEnd: clamp(v, { min: maxRowStart, max: pattern.lengthSteps }) });
            }}
          />
        </InspectorFieldRow>
        {selectField(t("stepSequencer.inspector.stepRate"), pattern.stepRate, rateOptions, (v) => setPattern({ stepRate: v }))}
        {selectField(t("stepSequencer.inspector.playback"), pattern.playback, playbackOptions, (v) => setPattern({ playback: v }))}
        <InspectorToggleRow label={t("stepSequencer.inspector.legato")} checked={pattern.legato} onChange={(v) => setPattern({ legato: v })} />
        {numberField(t("stepSequencer.inspector.swing"), patternItem, (p) => p.swing, () => ({ min: 0, max: 100 }), ([c]) => [
          { op: "set_pattern", clipId, swing: c!.value }
        ], "%")}
        {selectField(
          t("stepSequencer.inspector.swingDivision"),
          pattern.swingDivision,
          [
            { value: "1/8", label: "1/8" },
            { value: "1/16", label: "1/16" }
          ],
          (v) => setPattern({ swingDivision: v })
        )}
        {selectField(
          t("stepSequencer.inspector.pitchSource"),
          pattern.pitchSource,
          [
            { value: "off", label: t("stepSequencer.inspector.off") },
            { value: "key", label: t("stepSequencer.inspector.key") },
            { value: "chords", label: t("stepSequencer.inspector.chords") }
          ],
          (v) => setPattern({ pitchSource: v })
        )}
        {selectField(t("stepSequencer.inspector.key"), `${key.tonic}:${key.mode}`, keyOptions, (v) => {
          const [tonic, mode] = v.split(":");
          setPattern({ key: { tonic: Number(tonic), mode } });
        })}
        <InspectorToggleRow
          label={t("stepSequencer.inspector.noTranspose")}
          checked={pattern.noTranspose}
          onChange={(v) => setPattern({ noTranspose: v })}
        />
        <InspectorFieldRow label={t("stepSequencer.inspector.scale")}>
          <FlexRow gap={SPACING.xs} align="center" sx={{ ml: "auto" }}>
            <InspectorSelect
              label={t("stepSequencer.inspector.scale")}
              value={pattern.scale}
              options={scaleOptions}
              onChange={(v) => setPattern({ scale: v as StepScaleId })}
            />
            <EditorButton
              density="compact"
              variant={pattern.scaleQuantize ? "contained" : "outlined"}
              aria-label={t("stepSequencer.inspector.scaleQuantize")}
              aria-pressed={pattern.scaleQuantize}
              title={t("stepSequencer.inspector.scaleQuantize")}
              onClick={() => setPattern({ scaleQuantize: !pattern.scaleQuantize })}
            >
              {t("stepSequencer.inspector.quantizeShort")}
            </EditorButton>
          </FlexRow>
        </InspectorFieldRow>
        {numberField(t("stepSequencer.inspector.midiChannel"), patternItem, (p) => p.midiChannel, () => ({ min: 1, max: 16 }), ([c]) => [
          { op: "set_pattern", clipId, midiChannel: c!.value }
        ])}
        {selectField(t("stepSequencer.inspector.automationMode"), pattern.automationMode, automationOptions, (v) => setPattern({ automationMode: v }))}
        <InspectorToggleRow label={t("stepSequencer.inspector.mono")} checked={pattern.mono} onChange={(v) => setPattern({ mono: v })} />
        <InspectorFieldRow label={t("stepSequencer.inspector.seed")}>
          <FlexRow gap={SPACING.xs} align="center" sx={{ ml: "auto" }}>
            <Caption color="muted">{pattern.seed}</Caption>
            <EditorButton density="compact" variant="outlined" onClick={() => runOps([{ op: "set_pattern_seed", clipId } as TimelineOp])}>
              {t("stepSequencer.inspector.reseed")}
            </EditorButton>
          </FlexRow>
        </InspectorFieldRow>
      </InspectorSection>
    );

    // ── Row ──────────────────────────────────────────────────────────────
    const rowOps = (changes: Array<{ item: StepRow; value: number }>, field: string): TimelineOp[] =>
      changes.map(({ item, value }) => ({ op: "set_pattern_row", clipId, row: item.id, [field]: value }) as TimelineOp);
    const setRows = (fields: Record<string, unknown>) =>
      runOps(rows.map((r) => ({ op: "set_pattern_row", clipId, row: r.id, ...fields }) as TimelineOp));
    const rowName = shared(rows.map((r) => r.name ?? ""));
    const assignmentText = shared(rows.map((r) => rowLabel({ assignment: r.assignment }, instrument)));
    const assignmentLabel = assignmentText === MIXED ? t("stepSequencer.inspector.mixed") : display(assignmentText);
    const bool = (label: string, values: boolean[], onChange: (v: boolean) => void) => (
      <InspectorFieldRow label={label} key={label}>
        <Box sx={{ ml: "auto" }}>
          <Checkbox
            size="small"
            checked={values.length > 0 && values.every(Boolean)}
            indeterminate={values.some(Boolean) && !values.every(Boolean)}
            inputProps={{ "aria-label": label }}
            onChange={(_e, v) => onChange(v)}
          />
        </Box>
      </InspectorFieldRow>
    );

    const rowTab =
      rows.length > 0 ? (
        <InspectorSection title={t("stepSequencer.inspector.row")}>
          <InspectorFieldRow label={t("stepSequencer.inspector.rowAssignment")}>
            <EditorButton
              density="compact"
              variant="outlined"
              sx={{ ml: "auto", minWidth: ASSIGNMENT_BUTTON_MIN_WIDTH, justifyContent: "flex-end" }}
              disabled={!assignmentGroups || !onAssignRows}
              aria-label={`${t("stepSequencer.inspector.rowAssignment")}: ${assignmentLabel}`}
              onClick={(e) => setAssignAnchor(e.currentTarget)}
            >
              {assignmentLabel}
            </EditorButton>
          </InspectorFieldRow>
          <InspectorFieldRow label={t("stepSequencer.inspector.rowName")}>
            <InspectorValueInput
              value={display(rowName)}
              allowEmpty
              placeholder={assignmentText === MIXED ? undefined : display(assignmentText)}
              ariaLabel={t("stepSequencer.inspector.rowName")}
              onCommit={(raw) => {
                if (raw === MIXED) return;
                setRows({ name: raw.trim() });
              }}
            />
          </InspectorFieldRow>
          {numberField(t("stepSequencer.inspector.length"), rows, (r) => r.lengthSteps, () => ({ min: 1, max: pattern.lengthSteps }), (c) =>
            rowOps(c, "lengthSteps")
          )}
          {numberField(t("stepSequencer.inspector.loopStart"), rows, (r) => r.loopStart + 1, (r) => ({ min: 1, max: r.loopEnd }), (c) =>
            rowOps(c, "loopStart")
          )}
          {numberField(t("stepSequencer.inspector.loopEnd"), rows, (r) => r.loopEnd, (r) => ({ min: r.loopStart + 1, max: r.lengthSteps }), (c) =>
            rowOps(c, "loopEnd")
          )}
          {selectField(t("stepSequencer.inspector.stepRate"), shared(rows.map((r) => r.stepRate)), rateOptions, (v) => setRows({ stepRate: v }))}
          {selectField(t("stepSequencer.inspector.playback"), shared(rows.map((r) => r.playback)), playbackOptions, (v) => setRows({ playback: v }))}
          {numberField(t("stepSequencer.inspector.midiChannel"), rows, (r) => r.midiChannel, () => ({ min: 1, max: 16 }), (c) =>
            rowOps(c, "midiChannel")
          )}
          {selectField(t("stepSequencer.inspector.automationMode"), shared(rows.map((r) => r.automationMode)), automationOptions, (v) =>
            setRows({ automationMode: v })
          )}
          {bool(t("stepSequencer.row.mute"), rows.map((r) => r.mute), (v) => setRows({ mute: v }))}
          {bool(t("stepSequencer.row.solo"), rows.map((r) => r.solo), (v) => setRows({ solo: v }))}
          {assignmentGroups && onAssignRows && (
            <RowAssignmentMenu
              anchorEl={assignAnchor}
              groups={assignmentGroups}
              currentId={rows.length === 1 ? assignmentChoiceId(rows[0]!.assignment) : undefined}
              onPick={(choice) => onAssignRows(rows.map((r) => r.id), choice)}
              onClose={() => setAssignAnchor(null)}
            />
          )}
        </InspectorSection>
      ) : (
        <Caption color="muted" sx={{ p: SPACING.md }}>{t("stepSequencer.inspector.noRow")}</Caption>
      );

    // ── Step ─────────────────────────────────────────────────────────────
    const stepTab = (() => {
      const targets = stepTargets.filter((x) => x.steps.length > 0);
      if (targets.length === 0) {
        return <Caption color="muted" sx={{ p: SPACING.md }}>{t("stepSequencer.inspector.noStep")}</Caption>;
      }
      type Item = { row: StepRow; step: number; n: Normalized };
      const all: Item[] = targets.flatMap(({ row, steps }) => steps.map((step) => ({ row, step, n: normalizeStep(row.steps[step]) })));
      const pitched = all.filter((i) => !isAutomation(i.row));
      const automation = all.filter((i) => isAutomation(i.row));

      /** One `set_steps` per row and distinct value. */
      const stepOps = (changes: Array<{ item: Item; value: unknown }>, field: string): TimelineOp[] => {
        const groups = new Map<string, { row: StepRow; value: unknown; steps: number[] }>();
        for (const { item, value } of changes) {
          const k = `${item.row.id}\u0000${JSON.stringify(value)}`;
          const g = groups.get(k) ?? { row: item.row, value, steps: [] };
          g.steps.push(item.step + 1);
          groups.set(k, g);
        }
        return [...groups.values()].map(
          (g) => ({ op: "set_steps", clipId, row: g.row.id, steps: g.steps, values: { [field]: g.value } }) as TimelineOp
        );
      };
      const setAll = (items: Item[], field: string, value: unknown) => runOps(stepOps(items.map((item) => ({ item, value })), field));
      const modeField = (label: string, items: Item[], mode: "velocity" | "value" | "gate" | "note" | "octave" | "repeat" | "chance" | "offset", unit?: string) =>
        items.length === 0
          ? null
          : numberField(label, items, (i) => stepModeValue(i.row, i.step, mode), (i) => ({ ...modeRange(i.row, mode), fraction: isDeviceValue(i.row, mode) }), (c) => stepOps(c, mode), unit);
      const rawField = (label: string, items: Item[], field: string, get: (i: Item) => number, range: Range, unit?: string) =>
        items.length === 0 ? null : numberField(label, items, get, () => range, (c) => stepOps(c, field), unit);
      const flag = (label: string, items: Item[], field: "on" | "tie" | "skip") =>
        items.length === 0 ? null : bool(label, items.map((i) => i.n[field]), (v) => setAll(items, field, v));

      const condition = shared(all.map((i) => i.n.condition.type));
      const recurrences = all.filter((i) => i.n.condition.type === "recurrence");
      const recurrenceOf = (i: Item) => i.n.condition as Extract<Condition, { type: "recurrence" }>;
      const conditionOps = (changes: Array<{ item: Item; value: number }>, part: "iteration" | "cycles") =>
        stepOps(
          changes.map(({ item, value }) => {
            const c = recurrenceOf(item);
            const cycles = part === "cycles" ? value : c.cycles;
            const iteration = Math.min(part === "iteration" ? value : c.iteration, cycles);
            return { item, value: { type: "recurrence", iteration, cycles } };
          }),
          "condition"
        );
      const stepRate = shared(all.map((i) => i.n.stepRate ?? "row"));
      const rowRates = shared(all.map((i) => i.row.stepRate));

      return (
        <>
          <InspectorSection title={t("stepSequencer.inspector.playbackGroup")}>
            {flag(t("stepSequencer.mode.onOff"), all, "on")}
            {modeField(t("stepSequencer.mode.chance"), all, "chance", "%")}
            {selectField(
              t("stepSequencer.inspector.condition"),
              condition,
              [
                { value: "always", label: t("stepSequencer.inspector.always") },
                { value: "recurrence", label: t("stepSequencer.inspector.recurrence") },
                { value: "first", label: t("stepSequencer.inspector.first") },
                { value: "last", label: t("stepSequencer.inspector.last") }
              ],
              (v) =>
                setAll(all, "condition", v === "recurrence" ? { type: "recurrence", iteration: 1, cycles: 2 } : { type: v }),
              "step-inspector-condition"
            )}
            {condition === "recurrence" && (
              <>
                {numberField(
                  t("stepSequencer.inspector.iteration"),
                  recurrences,
                  (i) => recurrenceOf(i).iteration,
                  (i) => ({ min: 1, max: recurrenceOf(i).cycles }),
                  (c) => conditionOps(c, "iteration")
                )}
                {numberField(t("stepSequencer.inspector.cycles"), recurrences, (i) => recurrenceOf(i).cycles, () => ({ min: 2, max: 16 }), (c) =>
                  conditionOps(c, "cycles")
                )}
              </>
            )}
            {selectField(
              t("stepSequencer.inspector.stepRate"),
              stepRate,
              [
                { value: "row", label: t("stepSequencer.inspector.rowRate", { rate: rowRates === MIXED ? MIXED : (rowRates ?? "") }) },
                ...rateOptions
              ],
              (v) => setAll(all, "stepRate", v === "row" ? null : v)
            )}
            {flag(t("stepSequencer.mode.skip"), all, "skip")}
          </InspectorSection>
          <InspectorSection title={t("stepSequencer.inspector.general")}>
            {modeField(t("stepSequencer.mode.note"), pitched, "note")}
            {modeField(t("stepSequencer.mode.octave"), pitched, "octave")}
            {modeField(t("stepSequencer.mode.velocity"), pitched, "velocity")}
            {modeField(t("stepSequencer.mode.value"), automation, "value")}
            {modeField(t("stepSequencer.mode.gate"), pitched, "gate", "%")}
            {flag(t("stepSequencer.mode.tie"), pitched, "tie")}
            {modeField(t("stepSequencer.mode.offset"), all, "offset", "%")}
            {rawField(t("stepSequencer.inspector.midiChannel"), all, "midiChannel", (i) => i.n.midiChannel ?? i.row.midiChannel, { min: 1, max: 16 })}
            {rawField(t("stepSequencer.inspector.articulation"), all, "articulation", (i) => i.n.articulation, { min: 0, max: 255 })}
          </InspectorSection>
          {pitched.length > 0 && (
            <InspectorSection title={t("stepSequencer.inspector.repeats")}>
              {modeField(t("stepSequencer.mode.repeat"), pitched, "repeat")}
              {(["velocityRamp", "velocityCurve", "distribution"] as const).map((field) =>
                rawField(t(`stepSequencer.inspector.${field}`), pitched, field, (i) => i.n[field], { min: -100, max: 100 }, "%")
              )}
            </InspectorSection>
          )}
        </>
      );
    })();

    return (
      <FlexColumn data-testid="step-sequencer-inspector" sx={{ width: 260, flexShrink: 0, minHeight: 0, borderRight: 1, borderColor: "divider" }}>
        <TabGroup
          size="small"
          fullWidth
          aria-label={t("stepSequencer.inspector.tabs")}
          tabs={[
            { value: "pattern", label: t("stepSequencer.inspector.pattern") },
            { value: "row", label: t("stepSequencer.inspector.row") },
            { value: "step", label: t("stepSequencer.inspector.step") }
          ]}
          value={tab}
          onChange={(v) => setTab(v as InspectorTab)}
        />
        <ScrollArea sx={{ flex: 1, minHeight: 0, px: SPACING.sm }}>
          {tab === "pattern" ? patternTab : tab === "row" ? rowTab : stepTab}
        </ScrollArea>
      </FlexColumn>
    );
  }
);
StepSequencerInspector.displayName = "StepSequencerInspector";
