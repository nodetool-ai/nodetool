/**
 * Pure app-spec layer: parse a workflow's app document into a flat widget
 * list, extract the graph's bindable surface, and statically validate the
 * wiring between the two.
 *
 * The semantics — widget catalog, document parsing, binding resolution — come
 * from `@nodetool-ai/app-runtime`, so this harness checks the same rules the
 * web runtime enforces instead of a copy that drifts away from it.
 */
import {
  DEFAULT_OPERATION_ID,
  encodeBinding,
  parseApplicationDocument,
  resolveBinding,
  stateKey,
  widgetMode,
  WIDGET_CATALOG,
  type BindingMode,
  type BindingRef,
  type BindingScope
} from "@nodetool-ai/app-runtime";

import type { DebugGraph } from "../debug/types.js";
import type {
  AppEventSpec,
  AppIO,
  AppSpec,
  AppValidation,
  AppWidgetSpec
} from "./types.js";

const SET_VARIABLE_NODE_TYPE = "nodetool.variable.SetVariable";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

interface PuckNode {
  type: string;
  props: Record<string, unknown>;
}

const isPuckNode = (v: unknown): v is PuckNode =>
  isRecord(v) && typeof v.type === "string" && isRecord(v.props);

const parseEvents = (raw: unknown): AppEventSpec[] => {
  if (!Array.isArray(raw)) return [];
  const events: AppEventSpec[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const trigger = item.trigger === "change" ? "change" : "click";
    events.push({
      trigger,
      kind: str(item.kind) ?? "run",
      // The builder stores "" for unset key/value — normalize to undefined.
      key: str(item.key) || undefined,
      value: str(item.value) || undefined,
      operationId: str(item.operationId) || undefined,
      resourceBindingId: str(item.resourceBindingId) || undefined,
      command: str(item.command) || undefined
    });
  }
  return events;
};

/** The binding scope a single-workflow app resolves against. */
export function bindingScopeFor(io: AppIO): BindingScope {
  return {
    defaultOperationId: DEFAULT_OPERATION_ID,
    operations: [
      {
        operationId: DEFAULT_OPERATION_ID,
        inputs: io.inputs.map(({ nodeId, name }) => ({ nodeId, name })),
        outputs: io.outputs.map(({ nodeId, name }) => ({ nodeId, name })),
        nodeIds: io.nodeIds,
        variableNames: io.variables
      }
    ],
    variables: []
  };
}

const modeToBindingMode = (mode: AppWidgetSpec["bindingMode"]): BindingMode =>
  mode === "write" ? "write" : mode === "read" ? "read" : "none";

/**
 * Parse an app document (object or JSON string) into an {@link AppSpec},
 * resolving every widget binding to a node-ID reference against the live
 * graph. Slot children are discovered from the widget catalog, falling back to
 * a structural scan so a new layout widget keeps working before the catalog
 * knows about it.
 */
export function parseAppSpec(
  appDoc: unknown,
  io: AppIO
): { spec: AppSpec | null; issues: string[] } {
  if (appDoc == null) {
    return {
      spec: null,
      issues: ["Workflow has no app_doc — build the app in the App Builder first."]
    };
  }
  let raw: unknown = appDoc;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { spec: null, issues: ["app_doc is a string but not valid JSON."] };
    }
  }
  const document = parseApplicationDocument(raw, { hostWorkflowId: "self" });
  if (!document) {
    return {
      spec: null,
      issues: ["app_doc is not a valid application document (no `ui`/`data`)."]
    };
  }

  const issues: string[] = [];
  const scope = bindingScopeFor(io);
  const rootProps = isRecord(document.ui.root.props) ? document.ui.root.props : {};
  const title = str(rootProps.title);

  const widgets: AppWidgetSpec[] = [];
  const walk = (items: unknown[], parentId: string | null, slot: string | null) => {
    for (const item of items) {
      if (!isPuckNode(item)) continue;
      const id = str(item.props.id) ?? `${item.type}-${widgets.length}`;
      const bindingMode = widgetMode(item.type);
      const binding = str(item.props.binding) || null;
      const ref: BindingRef | null = binding
        ? resolveBinding(binding, scope, modeToBindingMode(bindingMode))
        : bindingMode === "write"
          ? // An unbound write widget still holds its own value — as widget-local
            // view state, which cannot collide with a workflow input.
            { kind: "view", componentId: id, prop: "value" }
          : null;
      widgets.push({
        id,
        type: item.type,
        bindingMode,
        binding,
        ref,
        stateKey: ref ? stateKey(ref) : null,
        canonicalBinding: ref ? encodeBinding(ref) : null,
        label: str(item.props.label) ?? str(item.props.text) ?? null,
        events: parseEvents(item.props.events),
        parentId,
        slot
      });
      const slots = WIDGET_CATALOG[item.type]?.slots;
      for (const [prop, value] of Object.entries(item.props)) {
        if (slots && !slots.includes(prop)) continue;
        if (Array.isArray(value) && value.some(isPuckNode)) {
          walk(value, id, prop);
        }
      }
    }
  };
  walk(document.ui.content, null, null);

  if (widgets.length === 0) {
    issues.push("The app document has no widgets — nothing to render or run.");
  }

  return { spec: { version: document.schemaVersion, title, widgets }, issues };
}

/** Read a node property from the kernel graph shape (`properties`, not `data`). */
const nodeProps = (node: Record<string, unknown>): Record<string, unknown> =>
  isRecord(node.properties) ? node.properties : {};

const nodeName = (node: Record<string, unknown>): string => {
  const name = nodeProps(node).name;
  if (typeof name === "string" && name.length > 0) return name;
  return str(node.id) ?? "";
};

const isOutputNodeType = (type: string): boolean =>
  type.includes(".output.") || type === "nodetool.workflows.base_node.Preview";

/**
 * Extract the app-bindable surface from a kernel-shape graph: input nodes,
 * output/Preview nodes, and SetVariable channel names — the same surface the
 * web builder offers in its binding pickers.
 */
export function extractAppIO(graph: DebugGraph): AppIO {
  const io: AppIO = { inputs: [], outputs: [], variables: [], nodeIds: [] };
  const variables = new Set<string>();
  for (const node of graph.nodes) {
    const type = str(node.type);
    const id = str(node.id);
    if (!type || !id) continue;
    io.nodeIds.push(id);
    if (type.startsWith("nodetool.input.")) {
      io.inputs.push({
        nodeId: id,
        nodeType: type,
        name: nodeName(node),
        defaultValue: nodeProps(node).value
      });
    } else if (isOutputNodeType(type)) {
      io.outputs.push({ nodeId: id, nodeType: type, name: nodeName(node) });
    } else if (type === SET_VARIABLE_NODE_TYPE) {
      const name = str(nodeProps(node).name)?.trim();
      if (name) variables.add(name);
    }
  }
  io.variables = [...variables].sort((a, b) => a.localeCompare(b));
  return io;
}

const VARIABLE_EVENT_KINDS = new Set([
  "setVariable",
  "toggleVariable",
  "setState",
  "toggleState"
]);

/** Statically check the app's wiring against the workflow's bindable surface. */
export function validateApp(spec: AppSpec, io: AppIO): AppValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const scope = bindingScopeFor(io);

  let hasRunTrigger = false;
  const displayedOutputs = new Set<string>();

  for (const w of spec.widgets) {
    const where = `${w.type} "${w.id}"`;
    if (w.bindingMode === "unknown") {
      errors.push(`${where}: unknown widget type — not in the app-builder catalog.`);
      continue;
    }
    if (w.binding && !w.ref) {
      errors.push(
        w.bindingMode === "write"
          ? `${where}: bound to "${w.binding}" but the workflow has no input node or node property that resolves it.`
          : `${where}: bound to "${w.binding}" but the workflow has no output or variable with that name.`
      );
    } else if (!w.binding && w.bindingMode === "write") {
      warnings.push(`${where}: not bound to an input — its value stays local UI state.`);
    }
    if (w.ref?.kind === "output") displayedOutputs.add(w.ref.nodeId);

    for (const event of w.events) {
      if (event.kind === "run") hasRunTrigger = true;
      if (
        VARIABLE_EVENT_KINDS.has(event.kind) &&
        !resolveBinding(event.key, scope, "read")
      ) {
        errors.push(
          `${where}: ${event.kind} targets variable "${event.key ?? ""}" but the workflow has no SetVariable node with that name.`
        );
      }
    }
  }

  if (spec.widgets.length > 0 && !hasRunTrigger) {
    errors.push(
      'No widget has a "run" event — the app can never execute the workflow. Add a Run button or an on-change run.'
    );
  }
  for (const output of io.outputs) {
    if (!displayedOutputs.has(output.nodeId)) {
      warnings.push(`Workflow output "${output.name}" is not displayed by any widget.`);
    }
  }

  return { errors, warnings };
}
