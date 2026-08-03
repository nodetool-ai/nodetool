/**
 * Interaction completion.
 *
 * A spec's interactions are already `InteractionStep[]` — the simulator's own
 * script language — so nothing here translates. What it does is close the two
 * gaps a spec routinely leaves: an interaction that clicks Run without ever
 * supplying the operation's inputs, and an operation nothing exercises at all.
 *
 * Authored steps are never edited, reordered, or dropped. Seeds are prepended
 * (a value must exist before the run that reads it) and a derived interaction
 * is a new entry, flagged as derived so the report never presents a script the
 * spec did not ask for as one it did.
 */

import type { InteractionStep } from "@nodetool-ai/execution/app-debug";
import { parseBinding } from "@nodetool-ai/app-runtime";
import { operationsExercised, resolveSpecWidget } from "./spec.js";
import type {
  BuildSpec,
  BuildSpecInteraction,
  BuildSpecOperation,
  CompletedInteraction
} from "./types.js";

/** State keys an interaction already writes, by any means. */
function keysTouched(
  spec: BuildSpec,
  interaction: BuildSpecInteraction
): Set<string> {
  const keys = new Set<string>();
  for (const step of interaction.steps) {
    if ("set" in step) {
      keys.add(step.set.key);
      continue;
    }
    const ref =
      "change" in step ? step.change : "click" in step ? step.click : null;
    if (ref === null) continue;
    const widget = resolveSpecWidget(spec, ref);
    if (!widget) continue;
    const parsed = parseBinding(widget.binding);
    if (parsed?.kind === "input") keys.add(parsed.nodeId);
  }
  return keys;
}

/**
 * Seed steps for every input the interaction leaves untouched. An input with no
 * example is skipped: a run against `undefined` fails for a reason the report
 * should attribute to the spec, not to a value this module invented.
 */
function seedSteps(
  operation: BuildSpecOperation,
  touched: ReadonlySet<string>
): InteractionStep[] {
  return operation.inputs
    .filter((input) => !touched.has(input.name) && input.example !== undefined)
    .map((input) => ({
      set: {
        key: input.name,
        value: input.example,
        operationId: operation.id
      }
    }));
}

/** The minimal script that exercises one operation end to end. */
function deriveInteraction(
  spec: BuildSpec,
  operation: BuildSpecOperation
): CompletedInteraction {
  const seeds = seedSteps(operation, new Set());
  const outputNames = new Set(operation.outputs.map((o) => o.name));
  const display = spec.widgets.filter((widget) => {
    const parsed = parseBinding(widget.binding);
    return (
      parsed?.kind === "output" &&
      parsed.operationId === operation.id &&
      outputNames.has(parsed.nodeId)
    );
  });
  return {
    name: `${operation.id}-default`,
    steps: [...seeds, { run: operation.id }],
    expect: display.map((widget) => ({
      widget: widget.role,
      check: "nonEmpty" as const
    })),
    derived: true,
    operationId: operation.id,
    addedSteps: [...seeds.map((step) => describe(step)), `run ${operation.id}`]
  };
}

const describe = (step: InteractionStep): string => {
  if ("set" in step) return `set ${step.set.key}`;
  if ("run" in step) return `run ${step.run}`;
  if ("cancel" in step) return `cancel ${step.cancel}`;
  if ("click" in step) return `click ${step.click}`;
  if ("change" in step) return `change ${step.change}`;
  return `seedResource ${step.seedResource.id}`;
};

/**
 * The scripts Run replays: every authored interaction with its missing inputs
 * seeded, plus one derived interaction per operation the spec forgot.
 */
export function completeInteractions(spec: BuildSpec): CompletedInteraction[] {
  const completed: CompletedInteraction[] = [];
  const exercised = new Set<string>();

  for (const interaction of spec.interactions) {
    const operationIds = operationsExercised(spec, interaction);
    for (const id of operationIds) exercised.add(id);
    const touched = keysTouched(spec, interaction);
    const seeds: InteractionStep[] = [];
    for (const id of operationIds) {
      const operation = spec.operations.find((op) => op.id === id);
      if (!operation) continue;
      seeds.push(...seedSteps(operation, touched));
    }
    completed.push({
      name: interaction.name,
      steps: [...seeds, ...interaction.steps],
      expect: interaction.expect,
      derived: false,
      addedSteps: seeds.map(describe)
    });
  }

  for (const operation of spec.operations) {
    if (exercised.has(operation.id)) continue;
    completed.push(deriveInteraction(spec, operation));
  }

  return completed;
}
