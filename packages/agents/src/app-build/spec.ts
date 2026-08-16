/**
 * The Spec stage: a prompt becomes a {@link BuildSpec}, or the build refuses.
 *
 * One `StepExecutor` call with the spec as `outputSchema`. The schema pins the
 * shape; everything the schema cannot express — a widget type the catalog does
 * not have, a binding that names an input no operation declares, an interaction
 * that clicks a widget nobody placed — is checked here, before a single
 * planning token is spent, and bounced back into the still-open conversation
 * through the executor's acceptance callback. After
 * {@link MAX_REPAIR_ROUNDS} bounces the build fails with the validation record
 * as its reason: refuse rather than guess.
 *
 * `specFromFile` is the same validation with no model attached, so a
 * hand-written `spec.json` enters the build through exactly one gate.
 */

import * as fs from "node:fs/promises";
import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type { TurnBudget } from "@nodetool-ai/runtime";
import {
  WIDGET_CATALOG,
  parseBinding,
  type BindingRef
} from "@nodetool-ai/app-runtime";
import type { InteractionStep } from "@nodetool-ai/execution/app-debug";
import {
  StepExecutor,
  MAX_REPAIR_ROUNDS,
  type StepExecutorOptions
} from "../step-executor.js";
import type { Step, Task } from "../types.js";
import {
  validateAgainstSchema,
  formatViolations
} from "../utils/json-schema-validate.js";
import type {
  BuildIssue,
  BuildSpec,
  BuildSpecInteraction,
  BuildSpecOperation,
  StageRecord
} from "./types.js";

/** Tool-calling rounds allowed while pinning the spec. */
const SPEC_MAX_ITERATIONS = 8;

/** The JSON schema the model answers with. */
export const BUILD_SPEC_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["title", "operations", "variables", "widgets", "interactions"],
  properties: {
    title: { type: "string", minLength: 1 },
    operations: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "objective", "inputs", "outputs", "streaming"],
        properties: {
          id: { type: "string", minLength: 1 },
          objective: { type: "string" },
          workflowId: { type: "string" },
          inputs: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "type", "example"],
              properties: {
                name: { type: "string", minLength: 1 },
                type: { type: "string", minLength: 1 },
                example: {}
              }
            }
          },
          outputs: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "type"],
              properties: {
                name: { type: "string", minLength: 1 },
                type: { type: "string", minLength: 1 }
              }
            }
          },
          streaming: { type: "boolean" }
        }
      }
    },
    variables: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "scope", "persist", "writtenBy", "readBy"],
        properties: {
          id: { type: "string", minLength: 1 },
          scope: { type: "string", enum: ["app", "instance"] },
          persist: { type: "boolean" },
          writtenBy: { type: "string", minLength: 1 },
          readBy: { type: "array", items: { type: "string" } }
        }
      }
    },
    widgets: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["role", "type", "binding", "label"],
        properties: {
          role: { type: "string", minLength: 1 },
          type: { type: "string", minLength: 1 },
          binding: { type: "string" },
          label: { type: "string" },
          container: { type: "string" },
          visibleWhen: { type: "string" }
        }
      }
    },
    interactions: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "steps", "expect"],
        properties: {
          name: { type: "string", minLength: 1 },
          steps: { type: "array", items: { anyOf: interactionStepSchemas() } },
          expect: {
            type: "array",
            items: {
              type: "object",
              required: ["widget", "check"],
              properties: {
                widget: { type: "string", minLength: 1 },
                check: {
                  type: "string",
                  enum: ["nonEmpty", "equals", "matches"]
                },
                value: {}
              }
            }
          }
        }
      }
    }
  }
};

/** The app-debug script language, as schema branches. */
function interactionStepSchemas(): Array<Record<string, unknown>> {
  return [
    {
      type: "object",
      required: ["set"],
      additionalProperties: false,
      properties: {
        set: {
          type: "object",
          required: ["key", "value"],
          properties: {
            key: { type: "string", minLength: 1 },
            value: {},
            operationId: { type: "string" }
          }
        }
      }
    },
    {
      type: "object",
      required: ["click"],
      additionalProperties: false,
      properties: { click: { type: "string", minLength: 1 } }
    },
    {
      type: "object",
      required: ["change", "value"],
      additionalProperties: false,
      properties: { change: { type: "string", minLength: 1 }, value: {} }
    },
    {
      type: "object",
      required: ["run"],
      additionalProperties: false,
      properties: { run: { type: "string", minLength: 1 } }
    },
    {
      type: "object",
      required: ["cancel"],
      additionalProperties: false,
      properties: { cancel: { type: "string", minLength: 1 } }
    }
  ];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const issue = (
  code: string,
  message: string,
  ref?: { widget?: string; operation?: string }
): BuildIssue => {
  const built: BuildIssue = {
    stage: "spec",
    code,
    severity: "error",
    message
  };
  if (ref?.widget !== undefined) built.widget = ref.widget;
  if (ref?.operation !== undefined) built.operation = ref.operation;
  return built;
};

/**
 * Resolve a widget reference the way the simulator does: component id (here the
 * spec's `role`), then label, then a unique type.
 */
export function resolveSpecWidget(
  spec: BuildSpec,
  ref: string
): BuildSpec["widgets"][number] | null {
  const byRole = spec.widgets.find((w) => w.role === ref);
  if (byRole) return byRole;
  const byLabel = spec.widgets.filter((w) => w.label === ref);
  if (byLabel.length === 1) return byLabel[0] ?? null;
  const byType = spec.widgets.filter((w) => w.type === ref);
  if (byType.length === 1) return byType[0] ?? null;
  return null;
}

const findOperation = (
  spec: BuildSpec,
  id: string
): BuildSpecOperation | undefined => spec.operations.find((op) => op.id === id);

/**
 * Which operations an interaction touches. The spec has no widget events yet —
 * authoring assigns those — so this reads the vocabulary the spec does have:
 * explicit `run`/`cancel`, a `set` that names an operation, and the operation
 * any referenced widget's binding points at.
 */
export function operationsExercised(
  spec: BuildSpec,
  interaction: BuildSpecInteraction
): Set<string> {
  const ids = new Set<string>();
  const fromWidget = (ref: string): void => {
    const widget = resolveSpecWidget(spec, ref);
    if (!widget) return;
    const parsed = parseBinding(widget.binding);
    const operationId = operationOf(parsed);
    if (operationId) ids.add(operationId);
  };
  for (const step of interaction.steps) {
    if ("run" in step) ids.add(step.run);
    else if ("cancel" in step) ids.add(step.cancel);
    else if ("set" in step) {
      if (step.set.operationId) ids.add(step.set.operationId);
    } else if ("click" in step) fromWidget(step.click);
    else if ("change" in step) fromWidget(step.change);
  }
  for (const expectation of interaction.expect) fromWidget(expectation.widget);
  return ids;
}

const operationOf = (ref: BindingRef | null): string | null => {
  if (ref === null) return null;
  switch (ref.kind) {
    case "input":
    case "output":
    case "execution":
    case "nodeProperty":
      return ref.operationId === "" ? null : ref.operationId;
    default:
      return null;
  }
};

function checkWidgets(spec: BuildSpec): BuildIssue[] {
  const issues: BuildIssue[] = [];
  const seen = new Set<string>();
  const variableIds = new Set(spec.variables.map((v) => v.id));
  // The link from a spec role to the widget the author placed is the label it
  // was told to use verbatim, so two widgets sharing one label resolve to
  // neither and both are reported missing from an app that has them both.
  const seenLabels = new Set<string>();

  for (const widget of spec.widgets) {
    const ref = { widget: widget.role };
    if (widget.label !== "" && seenLabels.has(widget.label)) {
      issues.push(
        issue(
          "duplicate_widget_label",
          `two widgets share the label "${widget.label}" — labels are how a placed widget is matched back to its role, so each must be unique`,
          ref
        )
      );
    }
    seenLabels.add(widget.label);
    if (seen.has(widget.role)) {
      issues.push(
        issue(
          "duplicate_widget_role",
          `two widgets share the role "${widget.role}"`,
          ref
        )
      );
    }
    seen.add(widget.role);

    if (!(widget.type in WIDGET_CATALOG)) {
      issues.push(
        issue(
          "unknown_widget_type",
          `"${widget.type}" is not a widget type. Available: ${Object.keys(WIDGET_CATALOG).join(", ")}`,
          ref
        )
      );
      continue;
    }
    if (
      widget.container !== undefined &&
      !spec.widgets.some((w) => w.role === widget.container)
    ) {
      issues.push(
        issue(
          "unknown_container",
          `container "${widget.container}" is not a declared widget role`,
          ref
        )
      );
    }
    // Layout widgets hold other widgets and buttons fire events; neither reads
    // or writes state, so neither needs a binding.
    const mode = WIDGET_CATALOG[widget.type]?.mode;
    if (widget.binding === "") {
      if (mode === "read" || mode === "write") {
        issues.push(
          issue(
            "missing_binding",
            `widget "${widget.role}" (${widget.type}) is a ${mode} widget and needs a binding`,
            ref
          )
        );
      }
      continue;
    }
    const parsed = parseBinding(widget.binding);
    if (parsed === null) {
      issues.push(
        issue(
          "unparsable_binding",
          `binding "${widget.binding}" is not a binding token (op:<id>/in:<name>, op:<id>/out:<name>, op:<id>/exec#<field>, var:<id>, view:<role>#<prop>)`,
          ref
        )
      );
      continue;
    }
    issues.push(
      ...checkBindingTarget(
        spec,
        widget.role,
        widget.binding,
        parsed,
        variableIds
      )
    );
  }
  return issues;
}

function checkBindingTarget(
  spec: BuildSpec,
  role: string,
  binding: string,
  parsed: BindingRef,
  variableIds: ReadonlySet<string>
): BuildIssue[] {
  const ref = { widget: role };
  if (parsed.kind === "variable") {
    return variableIds.has(parsed.variableId)
      ? []
      : [
          issue(
            "unknown_variable",
            `binding "${binding}" names no declared variable`,
            ref
          )
        ];
  }
  if (parsed.kind === "view") {
    return spec.widgets.some((w) => w.role === parsed.componentId)
      ? []
      : [
          issue(
            "unknown_view_target",
            `binding "${binding}" names no declared widget`,
            ref
          )
        ];
  }
  const operationId = operationOf(parsed);
  if (operationId === null) {
    return [
      issue(
        "unparsable_binding",
        `binding "${binding}" does not name an operation; write it as op:<id>/…`,
        ref
      )
    ];
  }
  const operation = findOperation(spec, operationId);
  if (!operation) {
    return [
      issue(
        "unknown_operation",
        `binding "${binding}" names no declared operation`,
        {
          widget: role,
          operation: operationId
        }
      )
    ];
  }
  if (
    parsed.kind === "input" &&
    !operation.inputs.some((i) => i.name === parsed.nodeId)
  ) {
    return [
      issue(
        "unknown_operation_input",
        `operation "${operationId}" declares no input "${parsed.nodeId}"`,
        { widget: role, operation: operationId }
      )
    ];
  }
  if (
    parsed.kind === "output" &&
    !operation.outputs.some((o) => o.name === parsed.nodeId)
  ) {
    return [
      issue(
        "unknown_operation_output",
        `operation "${operationId}" declares no output "${parsed.nodeId}"`,
        { widget: role, operation: operationId }
      )
    ];
  }
  return [];
}

function checkOperations(spec: BuildSpec): BuildIssue[] {
  const issues: BuildIssue[] = [];
  const seen = new Set<string>();
  for (const operation of spec.operations) {
    if (seen.has(operation.id)) {
      issues.push(
        issue(
          "duplicate_operation_id",
          `two operations share the id "${operation.id}"`,
          {
            operation: operation.id
          }
        )
      );
    }
    seen.add(operation.id);
    if (
      operation.objective.trim() === "" &&
      operation.workflowId === undefined
    ) {
      issues.push(
        issue(
          "operation_not_buildable",
          `operation "${operation.id}" has neither an objective to plan from nor a workflowId to bind`,
          { operation: operation.id }
        )
      );
    }
  }
  return issues;
}

function checkVariables(spec: BuildSpec): BuildIssue[] {
  const issues: BuildIssue[] = [];
  const roles = new Set(spec.widgets.map((w) => w.role));
  const seen = new Set<string>();
  for (const variable of spec.variables) {
    if (seen.has(variable.id)) {
      issues.push(
        issue(
          "duplicate_variable_id",
          `two variables share the id "${variable.id}"`
        )
      );
    }
    seen.add(variable.id);
    if (!findOperation(spec, variable.writtenBy)) {
      issues.push(
        issue(
          "unknown_variable_writer",
          `variable "${variable.id}" is written by "${variable.writtenBy}", which is not a declared operation`,
          { operation: variable.writtenBy }
        )
      );
    }
    for (const reader of variable.readBy) {
      if (roles.has(reader) || findOperation(spec, reader)) continue;
      issues.push(
        issue(
          "unknown_variable_reader",
          `variable "${variable.id}" is read by "${reader}", which is neither a declared widget nor a declared operation`
        )
      );
    }
  }
  return issues;
}

function checkInteractions(spec: BuildSpec): BuildIssue[] {
  const issues: BuildIssue[] = [];
  const exercised = new Set<string>();

  for (const interaction of spec.interactions) {
    for (const step of interaction.steps) {
      issues.push(...checkStep(spec, interaction.name, step));
    }
    for (const expectation of interaction.expect) {
      const widget = resolveSpecWidget(spec, expectation.widget);
      if (!widget) {
        issues.push(
          issue(
            "expect_widget_unknown",
            `interaction "${interaction.name}" expects "${expectation.widget}", which matches no declared widget`,
            { widget: expectation.widget }
          )
        );
        continue;
      }
      if (WIDGET_CATALOG[widget.type]?.mode !== "read") {
        issues.push(
          issue(
            "expect_widget_not_display",
            `interaction "${interaction.name}" expects "${expectation.widget}" (${widget.type}), which shows no value — expectations must name a display widget`,
            { widget: widget.role }
          )
        );
      }
      if (expectation.check !== "nonEmpty" && expectation.value === undefined) {
        issues.push(
          issue(
            "expect_value_missing",
            `interaction "${interaction.name}" uses check "${expectation.check}" on "${expectation.widget}" without a value`,
            { widget: widget.role }
          )
        );
      }
    }
    for (const id of operationsExercised(spec, interaction)) exercised.add(id);
  }

  for (const operation of spec.operations) {
    if (exercised.has(operation.id)) continue;
    issues.push(
      issue(
        "operation_without_interaction",
        `no interaction exercises operation "${operation.id}"`,
        { operation: operation.id }
      )
    );
  }
  return issues;
}

function checkStep(
  spec: BuildSpec,
  interactionName: string,
  step: InteractionStep
): BuildIssue[] {
  const missingWidget = (ref: string, verb: string): BuildIssue[] =>
    resolveSpecWidget(spec, ref)
      ? []
      : [
          issue(
            "interaction_widget_unknown",
            `interaction "${interactionName}" ${verb} "${ref}", which matches no declared widget`,
            { widget: ref }
          )
        ];
  const missingOperation = (id: string, verb: string): BuildIssue[] =>
    findOperation(spec, id)
      ? []
      : [
          issue(
            "interaction_operation_unknown",
            `interaction "${interactionName}" ${verb} "${id}", which is not a declared operation`,
            { operation: id }
          )
        ];

  if ("click" in step) return missingWidget(step.click, "clicks");
  if ("change" in step) return missingWidget(step.change, "changes");
  if ("run" in step) return missingOperation(step.run, "runs");
  if ("cancel" in step) return missingOperation(step.cancel, "cancels");
  if ("set" in step) {
    const { key, operationId } = step.set;
    const issues = operationId
      ? missingOperation(operationId, "sets against")
      : [];
    if (issues.length > 0) return issues;
    const operation = operationId
      ? findOperation(spec, operationId)
      : spec.operations[0];
    const known =
      spec.variables.some((v) => v.id === key) ||
      (operation !== undefined &&
        (operation.inputs.some((i) => i.name === key) ||
          operation.outputs.some((o) => o.name === key)));
    return known
      ? []
      : [
          issue(
            "interaction_key_unknown",
            `interaction "${interactionName}" sets "${key}", which is no declared input, output, or variable`,
            operationId ? { operation: operationId } : {}
          )
        ];
  }
  // `seedResource` addresses a resource binding that only exists after
  // authoring, so the spec stage has nothing to check it against.
  return [];
}

/**
 * Everything the schema cannot express. Returns every problem found, so one
 * bounce can fix them all.
 */
export function validateBuildSpec(spec: BuildSpec): BuildIssue[] {
  return [
    ...checkOperations(spec),
    ...checkWidgets(spec),
    ...checkVariables(spec),
    ...checkInteractions(spec)
  ];
}

/** Schema check then catalog check. The one gate every spec passes through. */
export function parseBuildSpec(raw: unknown): {
  spec: BuildSpec | null;
  issues: BuildIssue[];
} {
  const violations = validateAgainstSchema(raw, BUILD_SPEC_SCHEMA, "spec");
  if (violations.length > 0) {
    return {
      spec: null,
      issues: [issue("schema_violation", formatViolations(violations))]
    };
  }
  const spec = raw as BuildSpec;
  const issues = validateBuildSpec(spec);
  return { spec: issues.length > 0 ? null : spec, issues };
}

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

export interface SpecStageOptions {
  /** What the user asked for. */
  prompt: string;
  provider: BaseProvider;
  model: string;
  context: ProcessingContext;
  /** Spend admission, shared with the rest of the build. */
  turnBudget?: TurnBudget;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface SpecStageResult {
  /** Null when the prompt could not be pinned — see the record. */
  spec: BuildSpec | null;
  record: StageRecord;
}

const stageRecord = (
  startedAt: number,
  issues: BuildIssue[],
  detail: string,
  costUsd: number
): StageRecord => ({
  stage: "spec",
  round: 0,
  status: issues.length > 0 ? "failed" : "ok",
  startedAt: new Date(startedAt).toISOString(),
  durationMs: Date.now() - startedAt,
  issues,
  costUsd,
  detail
});

/** Load a hand-written `spec.json`: same validation, no model. */
export async function specFromFile(path: string): Promise<SpecStageResult> {
  const startedAt = Date.now();
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path, "utf-8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      spec: null,
      record: stageRecord(
        startedAt,
        [issue("spec_unreadable", `${path}: ${message}`)],
        `could not read ${path}`,
        0
      )
    };
  }
  const { spec, issues } = parseBuildSpec(raw);
  return {
    spec,
    record: stageRecord(
      startedAt,
      issues,
      spec ? `loaded ${path}` : `${path} failed validation`,
      0
    )
  };
}

/** Pin a prompt to a validated {@link BuildSpec}, or refuse. */
export async function runSpecStage(
  opts: SpecStageOptions
): Promise<SpecStageResult> {
  const startedAt = Date.now();
  const costBefore = opts.provider.getTotalCost();
  const step: Step = {
    id: "app_build_spec",
    instructions: buildSpecPrompt(opts.prompt),
    dependsOn: [],
    completed: false,
    logs: [],
    outputSchema: JSON.stringify(BUILD_SPEC_SCHEMA)
  };
  const task: Task = {
    id: "app_build_spec",
    title: "Specify the app",
    steps: [step],
    dependsOn: []
  };

  // The last rejection is the failure reason: it is what the model could not
  // fix, which is exactly what a human reading the report needs.
  let lastIssues: BuildIssue[] = [];
  const executorOptions: StepExecutorOptions = {
    task,
    step,
    context: opts.context,
    provider: opts.provider,
    model: opts.model,
    tools: [],
    maxIterations: SPEC_MAX_ITERATIONS,
    acceptResult: async (result) => {
      const issues = validateBuildSpec(result as BuildSpec);
      lastIssues = issues;
      return issues.length === 0
        ? { accepted: true }
        : {
            accepted: false,
            reason: issues.map((i) => `${i.code}: ${i.message}`).join("; ")
          };
    }
  };
  if (opts.maxTokens !== undefined) executorOptions.maxTokens = opts.maxTokens;
  if (opts.turnBudget) executorOptions.turnBudget = opts.turnBudget;
  if (opts.signal) executorOptions.signal = opts.signal;
  const executor = new StepExecutor(executorOptions);

  for await (const _message of executor.execute()) {
    if (opts.signal?.aborted) break;
  }
  const costUsd = opts.provider.getTotalCost() - costBefore;

  if (opts.signal?.aborted) {
    return {
      spec: null,
      record: stageRecord(
        startedAt,
        [
          issue("cancelled", "the build was cancelled while specifying the app")
        ],
        "cancelled",
        costUsd
      )
    };
  }

  const result = executor.getResult();
  if (!step.completed || result === null || result === undefined) {
    const issues =
      lastIssues.length > 0
        ? lastIssues
        : [
            issue(
              "spec_unpinnable",
              step.error ??
                "the model produced no spec matching the schema for this prompt"
            )
          ];
    return {
      spec: null,
      record: stageRecord(
        startedAt,
        issues,
        `no spec after ${MAX_REPAIR_ROUNDS} attempts`,
        costUsd
      )
    };
  }

  const { spec, issues } = parseBuildSpec(result);
  return {
    spec,
    record: stageRecord(
      startedAt,
      issues,
      spec
        ? `${spec.operations.length} operation(s)`
        : "spec failed validation",
      costUsd
    )
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/** The catalog, rendered as the model sees it: type, mode, and its own fields. */
function renderWidgetCatalog(): string {
  return Object.entries(WIDGET_CATALOG)
    .map(([type, descriptor]) => {
      const fields = Object.keys(descriptor.fields).join(", ");
      return `- ${type} (${descriptor.mode}) — ${descriptor.label}; fields: ${fields}`;
    })
    .join("\n");
}

export function buildSpecPrompt(prompt: string): string {
  return `Specify a mini app that satisfies this request:

${prompt}

A mini app is a small UI over one or more workflows. Pin the whole target now —
what the app does, what it shows, and how a user drives it. Later stages plan
the workflows, place the widgets, and check the result against this spec; the
spec itself is never revised, so anything vague here stays vague.

# Operations
Each operation is one workflow run. Give it a slug \`id\`, an \`objective\` a
graph planner can build from (or a \`workflowId\` to bind an existing workflow),
its \`inputs\` (each with a runnable \`example\` value) and \`outputs\`, and
whether it streams. Declare inputs and outputs by name — those names are what
widgets bind to.

# Variables
App state that outlives a run: an id, \`scope\` ("app" or "instance"),
\`persist\`, the operation whose output writes it (\`writtenBy\`), and the widget
roles or operation ids that read it (\`readBy\`).

# Widgets
Each widget has a \`role\` (a stable slug naming its job), a \`type\` from the
catalog below, a \`binding\`, a \`label\`, optionally a \`container\` (another
widget's role) and a \`visibleWhen\` condition source.

Binding tokens:
- \`op:<operationId>/in:<inputName>\` — feeds an operation input
- \`op:<operationId>/out:<outputName>\` — shows an operation output
- \`op:<operationId>/exec#<running|progress|error|activity>\` — execution state
- \`var:<variableId>\` — app variable
- \`view:<widgetRole>#<prop>\` — widget-local state
A layout widget takes an empty binding. Every other binding must name something
declared above.

Catalog:
${renderWidgetCatalog()}

# Interactions
The behavioral contract, written in the debug script language. \`steps\` is a
list of:
- \`{"set": {"key": "<input|output|variable name>", "value": <value>, "operationId": "<id>"}}\`
- \`{"click": "<widget role>"}\`
- \`{"change": "<widget role>", "value": <value>}\`
- \`{"run": "<operationId>"}\`
- \`{"cancel": "<operationId>"}\`
\`expect\` asserts against display widgets after the steps settle:
\`{"widget": "<role>", "check": "nonEmpty" | "equals" | "matches", "value": …}\`.
Declare at least one interaction per operation.

Do not invent widget types, bindings, or names: every reference is checked
against the declarations in this spec and against the catalog above, and a
mismatch comes straight back to you.`;
}
