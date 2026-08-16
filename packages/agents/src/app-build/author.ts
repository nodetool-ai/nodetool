/**
 * The Author stage: a model drives the real `ui_app_*` tool contract until the
 * document matches the spec.
 *
 * There is no second authoring surface here — the tools are the bridge the
 * `app-tools` eval scores and the browser's own tool contract, and the loop is
 * the one `runToolLoop` runs for every tool-loop suite. What this module adds
 * is the *briefing*: the spec rendered as a system prompt with the exact node
 * ids each binding must name, so the model binds to what the planner actually
 * built rather than to the names the spec wished for.
 *
 * A repair round is not a rebuild. The round resumes from the document the
 * last one produced (`loadDocument`) and opens with the complaint, so the model
 * edits what is wrong and leaves the rest alone; the orchestrator's oscillation
 * guard depends on that being true.
 */

import type { BaseProvider, TurnBudget } from "@nodetool-ai/runtime";
import type { AppIO } from "@nodetool-ai/execution/app-debug";
import type { BindableWorkflow } from "@nodetool-ai/app-runtime";
import {
  createAppToolBridge,
  type AppBridgeDocument,
  type AppBridgeInitialState
} from "./bridge.js";
import {
  runToolLoop,
  type RunToolLoopOptions,
  type ToolLoopRun
} from "./tool-loop.js";
import type {
  BuildComplaint,
  BuildIssue,
  BuildSpec,
  StageRecord
} from "./types.js";

/** Turn cap for one authoring round. */
export const DEFAULT_AUTHOR_TURNS = 40;

/** The application id the bridge's tools are addressed with. */
export const AUTHORED_APP_ID = "app-under-build";

/** One operation's workflow, as the author must reference it. */
export interface AuthorWorkflow {
  operationId: string;
  /** Bundle-local key the operation binding must name. */
  key: string;
  /** The bindable surface of the graph behind that key. */
  io: AppIO;
}

export interface AuthorStageOptions {
  spec: BuildSpec;
  workflows: AuthorWorkflow[];
  provider: BaseProvider;
  model: string;
  /** Repair round this execution belongs to; 0 is the first pass. */
  round: number;
  /** The document to resume from. Absent on the first pass. */
  resumeFrom?: AppBridgeDocument;
  /** What the last round got wrong. Absent on the first pass. */
  complaint?: BuildComplaint;
  maxTurns?: number;
  turnBudget?: TurnBudget;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
}

export interface AuthorStageResult {
  document: AppBridgeDocument;
  /** The model called `ui_app_finish` rather than running out of turns. */
  finished: boolean;
  record: StageRecord;
  run: ToolLoopRun;
}

const issue = (
  code: string,
  message: string,
  severity: BuildIssue["severity"] = "error"
): BuildIssue => ({ stage: "author", code, severity, message });

/** `AppIO` as the bridge's binding-target tool reports it. */
const bindable = (io: AppIO): BindableWorkflow => ({
  inputs: io.inputs.map((input) => ({
    nodeId: input.nodeId,
    name: input.name,
    label: input.name
  })),
  outputs: io.outputs.map((output) => ({
    nodeId: output.nodeId,
    name: output.name,
    label: output.name
  })),
  variables: io.variables
});

/**
 * Run one authoring round. A provider failure or an exhausted turn cap is
 * reported, not thrown: whatever document exists goes to Check, whose
 * complaints are that round's result (design §7).
 */
export async function runAuthorStage(
  opts: AuthorStageOptions
): Promise<AuthorStageResult> {
  const startedAt = Date.now();
  const costBefore = opts.provider.getTotalCost();
  const host = opts.workflows[0];

  // Every operation's workflow is loaded, not just the first: an app with two
  // operations binds against both, and a workflow the bridge does not hold
  // reports no bindable surface at all.
  const initial: AppBridgeInitialState = {
    title: opts.spec.title,
    finishTool: true,
    workflows: Object.fromEntries(
      opts.workflows.map((workflow) => [workflow.key, bindable(workflow.io)])
    )
  };
  if (host) {
    initial.workflowId = host.key;
    initial.workflow = bindable(host.io);
  }
  const bridge = createAppToolBridge(initial);
  if (opts.resumeFrom) bridge.loadDocument(opts.resumeFrom);

  const loopOptions: RunToolLoopOptions = {
    provider: opts.provider,
    model: opts.model,
    tools: bridge.tools,
    systemPrompt: renderAuthorSystemPrompt(opts.spec, opts.workflows),
    userPrompt: opts.complaint
      ? renderComplaintPrompt(opts.complaint)
      : "Build the app the specification describes, then call ui_app_finish.",
    maxIterations: opts.maxTurns ?? DEFAULT_AUTHOR_TURNS,
    stopOn: (call) => call.name === "ui_app_finish" && !call.isError
  };
  if (opts.turnBudget) loopOptions.turnBudget = opts.turnBudget;
  if (opts.signal) loopOptions.signal = opts.signal;
  const onLog = opts.onLog;
  if (onLog) {
    loopOptions.onToolCall = (call) =>
      onLog(`  ${call.name}${call.isError ? " (error)" : ""}`);
  }
  const run = await runToolLoop(loopOptions);

  const finished = bridge.finalState().finished;
  const issues: BuildIssue[] = [];
  if (run.error !== undefined) {
    issues.push(issue("author_provider_error", run.error));
  } else if (!finished) {
    issues.push(
      issue(
        "author_unfinished",
        `the model stopped after ${run.totalCalls} tool call(s) without calling ui_app_finish; checking the document it left`,
        "warning"
      )
    );
  }

  return {
    document: bridge.document(),
    finished,
    run,
    record: {
      stage: "author",
      round: opts.round,
      status: run.error === undefined ? "ok" : "failed",
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      issues,
      costUsd: opts.provider.getTotalCost() - costBefore,
      detail: `${run.totalCalls} tool call(s)${finished ? ", finished" : ""}`
    }
  };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const bullet = (lines: string[]): string =>
  lines.length > 0 ? lines.join("\n") : "  (none)";

function renderOperations(
  spec: BuildSpec,
  workflows: AuthorWorkflow[]
): string {
  return workflows
    .map((workflow) => {
      const operation = spec.operations.find(
        (op) => op.id === workflow.operationId
      );
      const inputs = workflow.io.inputs.map(
        (input) => `  - input "${input.name}" → node id \`${input.nodeId}\``
      );
      const outputs = workflow.io.outputs.map(
        (output) => `  - output "${output.name}" → node id \`${output.nodeId}\``
      );
      return [
        `- operation \`${workflow.operationId}\` runs workflow \`${workflow.key}\``,
        `  (ui_app_add_operation: id "${workflow.operationId}", target_workflow_id "${workflow.key}"${
          operation?.streaming ? ', policy "replace"' : ""
        })`,
        bullet(inputs),
        bullet(outputs)
      ].join("\n");
    })
    .join("\n");
}

function renderWidgets(spec: BuildSpec, workflows: AuthorWorkflow[]): string {
  const nodeIdFor = (
    operationId: string,
    kind: "in" | "out",
    name: string
  ): string => {
    const workflow = workflows.find((w) => w.operationId === operationId);
    const list = kind === "in" ? workflow?.io.inputs : workflow?.io.outputs;
    return list?.find((entry) => entry.name === name)?.nodeId ?? name;
  };
  const rewrite = (binding: string): string => {
    const match = /^op:([^/]+)\/(in|out):(.+)$/.exec(binding);
    if (!match) return binding;
    const [, operationId, kind, name] = match;
    return `op:${operationId}/${kind}:${nodeIdFor(operationId, kind as "in" | "out", name)}`;
  };
  return spec.widgets
    .map((widget) => {
      const parts = [
        `- ${widget.role}: type \`${widget.type}\`, label "${widget.label}"`
      ];
      if (widget.binding !== "") {
        parts.push(`, binding \`${rewrite(widget.binding)}\``);
      }
      if (widget.container) parts.push(`, inside \`${widget.container}\``);
      if (widget.visibleWhen) {
        parts.push(`, visibleWhen \`${widget.visibleWhen}\``);
      }
      return parts.join("");
    })
    .join("\n");
}

function renderVariables(spec: BuildSpec): string {
  return bullet(
    spec.variables.map(
      (variable) =>
        `- \`${variable.id}\`: scope ${variable.scope === "app" ? "user" : "instance"}, persist ${variable.persist}, written by operation \`${variable.writtenBy}\``
    )
  );
}

function renderInteractions(spec: BuildSpec): string {
  return bullet(
    spec.interactions.map(
      (interaction) =>
        `- ${interaction.name}: ${interaction.steps
          .map((step) =>
            "click" in step
              ? `click ${step.click}`
              : "change" in step
                ? `change ${step.change}`
                : "run" in step
                  ? `run ${step.run}`
                  : "cancel" in step
                    ? `cancel ${step.cancel}`
                    : "set" in step
                      ? `set ${step.set.key}`
                      : `seedResource ${step.seedResource.id}`
          )
          .join(" → ")}`
    )
  );
}

/** The spec, rendered as the author's briefing. */
export function renderAuthorSystemPrompt(
  spec: BuildSpec,
  workflows: AuthorWorkflow[]
): string {
  return `You are building a NodeTool mini app with the ui_app_* tools. The
application id is "${AUTHORED_APP_ID}" — pass it to every tool.

The workflows already exist. Your job is the app: bind each workflow as an
operation, place the widgets, bind them, and wire the events that run the
operations. Do not invent operations, widgets, or bindings the specification
below does not ask for, and do not rename anything.

# App
Title: ${spec.title}

# Operations to declare
${renderOperations(spec, workflows)}

Bindings address nodes by **node id**, not by name — the ids above are the only
correct ones. An input with no mapping takes its bound widget's value and an
output with no mapping displays, so pass \`inputs\`/\`outputs\` only where the
specification asks for a variable mapping.

# Variables to declare
${renderVariables(spec)}

An operation output that writes a variable is mapped on the operation
(\`outputs: { "<output node id>": { "to": "variable", "variableId": "<id>" } }\`).

# Widgets to place
${renderWidgets(spec, workflows)}

Every widget's label must be exactly the label above — the checker finds
widgets by label. A widget listed with a container goes inside that container
widget's slot (\`parent_id\`, plus \`slot\`: 'content' for Panel and Accordion,
'left'/'right' for Columns, 'tab1'..'tab3' for Tabs).

At least one widget must run an operation. A Button runs one through its
\`events\` prop:
\`events: [{ "trigger": "click", "kind": "run", "operationId": "<operation id>" }]\`.

# Interactions the app must support
${renderInteractions(spec)}

Call \`ui_app_get_snapshot\` when you need to see what is placed, and
\`ui_app_finish\` with a one-line summary when everything above exists.`;
}

/** A repair round's opening message: everything wrong, and the edit rule. */
export function renderComplaintPrompt(complaint: BuildComplaint): string {
  const lines = complaint.issues.map(
    (i) =>
      `- [${i.stage}/${i.code}]${i.widget ? ` widget "${i.widget}":` : i.operation ? ` operation "${i.operation}":` : ""} ${i.message}`
  );
  return `The app you built has problems. This is the full list — nothing else
is wrong, and everything here must be fixed:

${lines.join("\n")}

The document you built is loaded. Edit it: call ui_app_get_snapshot to see the
current widgets, then fix exactly what is listed above with
ui_app_update_component / ui_app_update_operation / ui_app_add_component. Do
not delete and rebuild what already works. Call ui_app_finish when done.`;
}
