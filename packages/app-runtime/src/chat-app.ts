/**
 * Chat presentation of a step app.
 *
 * A document with `presentation: "chat"` runs as a conversation: the app agent
 * owns the loop and shows the app's steps as cards in the thread. This module
 * holds what every surface has to agree on: how a document splits into steps,
 * how a press inside a card reaches the agent as an app event, and how the
 * agent reads the running app.
 *
 * Steps come from the document itself. A `Stepper` at the top level names the
 * steps and the variable that holds the current one; every top-level widget
 * gated `visibleWhen: <that variable> eq <step>` belongs to that step. A page
 * app with that shape runs in chat with no layout change.
 */

import type { ApplicationDocument } from "./document.js";
import { isBoolean, isNumber, isRecord, isString } from "./predicates.js";
import {
  isLiveInvocation,
  type AppInstanceState,
  type InvocationStatus
} from "./state.js";

export interface ChatAppField {
  /** The widget's binding: `var:<id>` or `op:<op>/in:<node>`. */
  binding: string;
  label: string;
}

export interface ChatAppStep {
  value: string;
  title: string;
  /** The step's top-level widgets, with the step gate removed. */
  items: unknown[];
  /** The values the step's widgets hold, so the agent knows where each lives. */
  fields: ChatAppField[];
}

export interface ChatAppLayout {
  /** The Stepper's component id. */
  stepperId: string;
  /** The Stepper's binding, e.g. `var:step`. */
  stepBinding: string;
  /** The variable that holds the current step. */
  stepVariableId: string;
  steps: ChatAppStep[];
  /** Top-level widgets gated on no step (a title, a note): shown above the thread. */
  header: unknown[];
}

interface PuckItem {
  type: string;
  props: Record<string, unknown>;
}

const isPuckItem = (value: unknown): value is PuckItem =>
  isRecord(value) && isString(value.type) && isRecord(value.props);

const stepGate = (item: PuckItem, stepBinding: string): string | null => {
  const gate = item.props.visibleWhen;
  if (!isRecord(gate) || gate.binding !== stepBinding || gate.op !== "eq") {
    return null;
  }
  return isString(gate.value) ? gate.value : null;
};

const FIELD_BINDING = /^(var:[^/#]+|op:[^/]+\/in:[^/#]+)$/;

/** Labelled widgets bound to a variable or an operation input, in order. */
const fieldsOf = (items: unknown[], stepBinding: string): ChatAppField[] => {
  const fields: ChatAppField[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!isPuckItem(value)) return;
    const { binding, label, title } = value.props;
    const name = isString(label) && label.trim() ? label.trim() : isString(title) && title.trim() ? title.trim() : null;
    if (
      isString(binding) &&
      binding !== stepBinding &&
      FIELD_BINDING.test(binding) &&
      name &&
      value.type !== "Button" &&
      !fields.some((field) => field.binding === binding)
    ) {
      fields.push({ binding, label: name });
    }
    for (const nested of Object.values(value.props)) {
      if (Array.isArray(nested)) walk(nested);
    }
  };
  walk(items);
  return fields;
};

/**
 * The variables a language-model picker binds. In chat the agent's own model
 * fills them, so the cards do not show those pickers.
 */
export const chatModelVariableIds = (
  document: Pick<ApplicationDocument, "ui">
): string[] => {
  const ids: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!isPuckItem(value)) return;
    const { binding, modelKind } = value.props;
    if (
      value.type === "ModelSelect" &&
      modelKind === "language_model" &&
      isString(binding) &&
      binding.startsWith("var:") &&
      !ids.includes(binding.slice(4))
    ) {
      ids.push(binding.slice(4));
    }
    for (const nested of Object.values(value.props)) {
      if (Array.isArray(nested)) walk(nested);
    }
  };
  walk(document.ui.content);
  return ids;
};

/**
 * Drop the language-model pickers, and the `<id>-help` or `<id>-hint` text
 * that explains each one, from a step's widgets.
 */
const withoutModelPickers = (items: unknown[], modelIds: string[]): unknown[] => {
  const hidden = new Set<string>();
  for (const id of modelIds) {
    hidden.add(id);
    hidden.add(`${id}-help`);
    hidden.add(`${id}-hint`);
  }
  const strip = (list: unknown[]): unknown[] =>
    list
      .filter((item) => {
        if (!isPuckItem(item)) return true;
        const { id, binding } = item.props;
        if (item.type === "ModelSelect" && isString(binding) && modelIds.includes(binding.slice(4))) {
          return false;
        }
        return !(isString(id) && hidden.has(id));
      })
      .map((item) => {
        if (!isPuckItem(item)) return item;
        const props: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(item.props)) {
          props[key] = Array.isArray(value) ? strip(value) : value;
        }
        return { ...item, props };
      });
  return strip(items);
};

/**
 * Keep only the widgets with one of `ids`, and the containers that hold them.
 * A container keeps only its matching children. Returns all items when no id
 * matches, so a wrong id never shows an empty card.
 */
export const pickStepItems = (items: unknown[], ids: string[]): unknown[] => {
  const wanted = new Set(ids);
  const pick = (list: unknown[]): unknown[] => {
    const kept: unknown[] = [];
    for (const item of list) {
      if (!isPuckItem(item)) continue;
      if (isString(item.props.id) && wanted.has(item.props.id)) {
        kept.push(item);
        continue;
      }
      let found = false;
      const props: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item.props)) {
        if (Array.isArray(value) && value.some(isPuckItem)) {
          const inner = pick(value);
          if (inner.length) found = true;
          props[key] = inner;
        } else {
          props[key] = value;
        }
      }
      if (found) kept.push({ ...item, props });
    }
    return kept;
  };
  const picked = pick(items);
  return picked.length ? picked : items;
};

const withoutGate = (item: PuckItem): PuckItem => {
  const props = { ...item.props };
  delete props.visibleWhen;
  return { ...item, props };
};

/**
 * Split a document into chat steps, or null when it has no top-level Stepper
 * bound to a variable. Widgets gated on a step the Stepper does not list are
 * dropped: they could never show on the page either.
 */
export const chatAppLayout = (
  document: Pick<ApplicationDocument, "ui">
): ChatAppLayout | null => {
  const content = document.ui.content.filter(isPuckItem);
  const stepper = content.find((item) => item.type === "Stepper");
  if (!stepper) return null;
  const stepBinding = stepper.props.binding;
  if (!isString(stepBinding) || !stepBinding.startsWith("var:")) return null;
  const rawSteps = Array.isArray(stepper.props.steps) ? stepper.props.steps : [];
  const steps: ChatAppStep[] = [];
  for (const raw of rawSteps) {
    if (!isRecord(raw) || !isString(raw.value) || !raw.value) continue;
    if (steps.some((step) => step.value === raw.value)) continue;
    steps.push({
      value: raw.value,
      title: isString(raw.title) && raw.title ? raw.title : raw.value,
      items: [],
      fields: []
    });
  }
  if (steps.length === 0) return null;
  const header: unknown[] = [];
  const modelIds = chatModelVariableIds(document);
  for (const item of content) {
    if (item === stepper) continue;
    const gate = stepGate(item, stepBinding);
    if (gate === null) {
      header.push(item);
      continue;
    }
    steps.find((step) => step.value === gate)?.items.push(withoutGate(item));
  }
  for (const step of steps) {
    step.items = withoutModelPickers(step.items, modelIds);
    step.fields = fieldsOf(step.items, stepBinding);
  }
  return {
    stepperId: isString(stepper.props.id) ? stepper.props.id : "steps",
    stepBinding,
    stepVariableId: stepBinding.slice("var:".length),
    steps,
    header
  };
};

export const isChatApp = (
  document: Pick<ApplicationDocument, "presentation" | "ui"> | null | undefined
): boolean =>
  document?.presentation === "chat" && chatAppLayout(document) !== null;

// ── App events ──────────────────────────────────────────────────────────────

/** What a press inside a card asks the agent to do. */
export type ChatAppRequest =
  | { kind: "step"; step: string }
  | { kind: "run"; operationId: string };

/**
 * An operation the agent started that outlived its tool call. The app sends
 * it as an app event when the run ends, so the agent picks the loop back up.
 */
export interface ChatAppSettled {
  operationId: string;
  status: "completed" | "failed" | "cancelled";
  error?: string;
  /** The step the operation moved the app to, when it set one. */
  step?: string;
}

const SETTLED_STATUSES = new Set(["completed", "failed", "cancelled"]);

/**
 * A press inside a card or on the steps bar, sent to the agent as a user turn.
 * Cards run nothing themselves: the agent reads the event and acts on it.
 */
export interface ChatAppEvent {
  /** The step whose card held the control; absent for the steps bar. */
  step?: string;
  /** The control's visible label. */
  control: string;
  requests: ChatAppRequest[];
  /** Labels of the values the user changed in this card since it was shown. */
  changed?: string[];
  /** Set when the event reports a finished run rather than a press. */
  settled?: ChatAppSettled;
}

const APP_EVENT_PREFIX = "[app event] ";

/** The text of the user turn an app event becomes. The model reads the JSON. */
export const formatChatAppEvent = (event: ChatAppEvent): string =>
  `${APP_EVENT_PREFIX}${JSON.stringify(event)}`;

/** Read an app event back from a user turn's text, or null for typed text. */
export const parseChatAppEvent = (text: string): ChatAppEvent | null => {
  if (!text.startsWith(APP_EVENT_PREFIX)) return null;
  let value: unknown;
  try {
    value = JSON.parse(text.slice(APP_EVENT_PREFIX.length));
  } catch {
    return null;
  }
  if (!isRecord(value) || !isString(value.control) || !Array.isArray(value.requests)) {
    return null;
  }
  const requests: ChatAppRequest[] = [];
  for (const request of value.requests) {
    if (!isRecord(request)) continue;
    if (request.kind === "step" && isString(request.step)) {
      requests.push({ kind: "step", step: request.step });
    } else if (request.kind === "run" && isString(request.operationId)) {
      requests.push({ kind: "run", operationId: request.operationId });
    }
  }
  const event: ChatAppEvent = { control: value.control, requests };
  if (isString(value.step)) event.step = value.step;
  if (Array.isArray(value.changed)) event.changed = value.changed.filter(isString);
  const settled = parseSettled(value.settled);
  if (settled) event.settled = settled;
  return event;
};

const parseSettled = (value: unknown): ChatAppSettled | null => {
  if (
    !isRecord(value) ||
    !isString(value.operationId) ||
    !isString(value.status) ||
    !SETTLED_STATUSES.has(value.status)
  ) {
    return null;
  }
  const settled: ChatAppSettled = {
    operationId: value.operationId,
    status: value.status as ChatAppSettled["status"]
  };
  if (isString(value.error)) settled.error = value.error;
  if (isString(value.step)) settled.step = value.step;
  return settled;
};

// ── The agent's view of the app ─────────────────────────────────────────────

const textOf = (items: unknown[], limit: number): string => {
  const lines: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!isPuckItem(value)) return;
    const { type, props } = value;
    if (type === "Heading" || type === "Text" || type === "Markdown" || type === "Alert") {
      for (const key of ["text", "title", "subtitle"]) {
        const text = props[key];
        if (isString(text) && text.trim() && !isString(props.binding)) {
          lines.push(text.trim());
        }
      }
    }
    if (type === "Button" && isString(props.label)) {
      lines.push(`[button: ${props.label}]`);
    }
    for (const nested of Object.values(props)) {
      if (Array.isArray(nested)) walk(nested);
    }
  };
  walk(items);
  const joined = lines.join(" · ");
  return joined.length > limit ? `${joined.slice(0, limit - 1)}…` : joined;
};

export interface ChatAppPromptOptions {
  appRunId: string;
  title: string;
}

/**
 * The system-prompt addendum for the app agent: what the app makes, its steps
 * and operations, the tools, and the rules of the loop.
 */
export const buildChatAppSystemPrompt = (
  document: ApplicationDocument,
  layout: ChatAppLayout,
  { appRunId, title }: ChatAppPromptOptions
): string => {
  const objective = document.recipe?.creativeStrategy?.objective;
  const steps = layout.steps
    .map((step, index) => {
      const summary = textOf(step.items, 320);
      const values = step.fields
        .map((field) => `${field.binding.startsWith("var:") ? field.binding.slice(4) : field.binding} (${field.label})`)
        .join(", ");
      return `${index + 1}. \`${step.value}\` "${step.title}"${summary ? ` — ${summary}` : ""}${values ? `\n   Values: ${values}` : ""}`;
    })
    .join("\n");
  const operations = document.operations
    .map((operation) =>
      `- \`${operation.id}\` "${operation.name}"${operation.agentTask ? " (your task, see below)" : ""}`
    )
    .join("\n");
  const tasks = document.operations
    .filter((operation) => operation.agentTask)
    .map((operation) => {
      const writes = Object.values(operation.outputs)
        .flatMap((mapping) => (mapping.to === "variable" ? [mapping.variableId] : []))
        .join(", ");
      return `### \`${operation.id}\` "${operation.name}"\nWrites: ${writes || "nothing"}\n${operation.agentTask}`;
    })
    .join("\n\n");
  const modelIds = chatModelVariableIds(document);
  return `# Running the app "${title}"
You run this mini app for the user as a conversation. You own the loop: the
user sees a steps bar, your messages, and the step cards you show. Cards show
results and collect values; they never run anything themselves.
${objective ? `\nWhat it makes: ${objective}\n` : ""}
app_run_id: \`${appRunId}\` (pass it to every ui_app_run_* call)

Steps, in order:
${steps}

Operations:
${operations || "- none"}

## Tools
Call these directly, never from inside \`execute_code\`: each call shows in the chat.
- \`ui_app_run_get_state\`: the current step, every value (with the empty required ones), and each operation's status and last error. Read it before deciding.
- \`ui_app_run_show_step\`: show a step's card in the chat and make it the current step. Add a short \`note\` for the user when it helps. Pass \`only\` with widget ids to show just those widgets of the step.
- \`ui_app_run_set_inputs\`: write values the user gave you in chat, or a fix you proposed and they accepted.
- \`ui_app_run_operation\`: run one operation and wait for it. It returns the outputs, the step the operation moved to, or the error with the run id. A long run returns \`status: "running"\` instead: say it is running and end the turn. An app event with \`settled\` arrives when it ends.
- \`ui_app_run_cancel\`: stop a running operation.

${modelIds.length ? `\nThe language-model values (${modelIds.join(", ")}) follow the model of this chat. The app fills them before each run, so never ask the user to pick one.\n` : ""}${tasks ? `
## Your tasks
These operations are yours. Do the work yourself with your own tools, such as reading web pages and searching images in a code action. Write the result with \`ui_app_run_set_inputs\`, then show the step that holds it. Never call \`ui_app_run_operation\` for them. When an app event asks to run one, that is the user asking you to do it now.

${tasks}
` : ""}
## App events
A user turn that starts with \`[app event]\` is a press inside a card or on the steps bar, as JSON: \`step\` (the card), \`control\` (its label), \`requests\` (\`{"kind":"step","step":…}\` to go to a step, \`{"kind":"run","operationId":…}\` to run an operation, in the order the control lists them), \`changed\` (values edited in that card). An event with \`settled\` reports that an operation you started has ended: its \`status\`, \`error\` and the \`step\` it moved to. Treat it as that operation's result.

## Rules
1. Start by showing the first step. Show a step before you ask for its values. A value lives on the step that lists it under Values: to get one changed, show that step.
2. Act on app events in order: run what it asks to run, then show the step it asks for. When an operation moves the step itself, show that step.
3. Run an operation only after an app event asks for it or the user says yes in chat. Many spend money.
4. When the user asks to go back, show that step. Keep values from later steps unless the user changes them.
5. After a failure, say in one sentence what went wrong in the user's terms, then offer up to three ways forward: a value to change (show its step), another model, a retry, or a workaround. Never claim a result you did not get.
6. Before a step that needs values that are still empty, say which ones and show the step that holds them.
7. Say what the user needs in the \`note\` of ui_app_run_show_step and end the turn there, without a second message. Keep it to one or two sentences and do not repeat what the card already shows.
8. Typed questions get plain answers. The user may ask anything about the app, a result, or a failure at any time.`;
};

/** A short, model-sized form of an app value: long text cut, media as its ref. */
export const previewAppValue = (value: unknown): unknown => {
  if (value === undefined || value === null || value === "") return null;
  if (isString(value)) {
    return value.length > 240 ? `${value.slice(0, 239)}…` : value;
  }
  if (isNumber(value) || isBoolean(value)) return value;
  if (Array.isArray(value)) {
    return value.length <= 5
      ? value.map(previewAppValue)
      : { items: value.length, first: value.slice(0, 3).map(previewAppValue) };
  }
  if (isRecord(value)) {
    if (isString(value.type) && (isString(value.uri) || isString(value.asset_id))) {
      const media: Record<string, unknown> = { type: value.type };
      // The asset id is the durable handle. A stored uri can be a resolved
      // display path (file://, a signed URL) that no tool accepts.
      if (isString(value.asset_id) && value.asset_id) {
        media.uri = `asset://${value.asset_id}`;
      } else if (isString(value.uri)) {
        media.uri = value.uri.slice(0, 160);
      }
      return media;
    }
    const keys = Object.keys(value);
    if (keys.length > 12) return { keys: keys.slice(0, 12), more: keys.length - 12 };
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const nested = value[key];
      out[key] = isRecord(nested) || Array.isArray(nested) ? "…" : previewAppValue(nested);
    }
    return out;
  }
  return String(value);
};

const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (isRecord(value) && isString(value.type) && !value.uri && !value.asset_id && !value.data);

export interface ChatAppOperationState {
  id: string;
  name: string;
  status: InvocationStatus | "idle";
  error?: string;
}

export interface ChatAppStateSnapshot {
  step: string | null;
  steps: Array<{ value: string; title: string }>;
  variables: Record<string, unknown>;
  inputs: Record<string, unknown>;
  missing_required: string[];
  operations: ChatAppOperationState[];
}

/** A compact read of the running app for the agent. */
export const chatAppSnapshot = (
  document: ApplicationDocument,
  layout: ChatAppLayout,
  state: AppInstanceState
): ChatAppStateSnapshot => {
  const step = state.variables[layout.stepVariableId];
  const variables: Record<string, unknown> = {};
  for (const declaration of document.variables) {
    if (declaration.id === layout.stepVariableId) continue;
    variables[declaration.id] = previewAppValue(state.variables[declaration.id]);
  }
  const inputs: Record<string, unknown> = {};
  for (const [key, slot] of Object.entries(state.inputs)) {
    inputs[key] = previewAppValue(slot.value);
  }
  const stepOf = (binding: string) =>
    layout.steps.find((step) => step.fields.some((field) => field.binding === binding))?.value;
  const missing = (document.recipe?.inputs ?? [])
    .filter((input) => input.required && isEmptyValue(state.variables[input.id]))
    .map((input) => {
      const step = stepOf(`var:${input.id}`);
      return `${input.id} (${input.label})${step ? ` on step ${step}` : ""}`;
    });
  const operations = document.operations.map((operation): ChatAppOperationState => {
    const id = state.activeInvocation[operation.id];
    const resolved = id ? (state.invocationAliases[id] ?? id) : undefined;
    const invocation = resolved ? state.invocations[resolved] : undefined;
    const entry: ChatAppOperationState = {
      id: operation.id,
      name: operation.name,
      status: invocation ? invocation.status : "idle"
    };
    if (invocation?.error) entry.error = invocation.error;
    return entry;
  });
  return {
    step: isString(step) ? step : null,
    steps: layout.steps.map(({ value, title }) => ({ value, title })),
    variables,
    inputs,
    missing_required: missing,
    operations
  };
};

/**
 * The invocation an operation's latest run settled into, following the
 * client-reservation alias to the provider job id.
 */
export const settledInvocation = (
  state: AppInstanceState,
  operationId: string,
  before: string | undefined
): { id: string; status: InvocationStatus; error?: string } | null => {
  const active = state.activeInvocation[operationId];
  if (!active || active === before) return null;
  const id = state.invocationAliases[active] ?? active;
  if (id === before) return null;
  const invocation = state.invocations[id];
  if (!invocation || isLiveInvocation(invocation)) return null;
  const settled: { id: string; status: InvocationStatus; error?: string } = {
    id,
    status: invocation.status
  };
  if (invocation.error) settled.error = invocation.error;
  return settled;
};
