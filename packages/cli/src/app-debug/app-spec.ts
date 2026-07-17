/**
 * Pure app-spec layer: parse a workflow's `app_doc` (a Puck document) into a
 * flat widget list, extract the graph's bindable surface, and statically
 * validate the wiring between the two.
 *
 * Mirrors the web app-builder's semantics (see
 * `web/src/components/appbuilder/`): write widgets bind to input-node names,
 * read widgets bind to output-node names or SetVariable names, and
 * setState/toggleState events target SetVariable names. Kept dependency-free so
 * it is unit-testable under the CLI's stubbed vitest setup.
 */
import type { DebugGraph } from "../debug/types.js";
import type {
  AppEventSpec,
  AppIO,
  AppSpec,
  AppValidation,
  AppWidgetSpec,
  WidgetBindingMode
} from "./types.js";

/** Widget catalog: how each Puck component type participates in the runtime. */
export const WIDGET_MODES: Record<string, WidgetBindingMode> = {
  Heading: "read",
  Text: "read",
  Markdown: "read",
  Image: "read",
  Audio: "read",
  Video: "read",
  Json: "read",
  Output: "read",
  Progress: "read",
  TextInput: "write",
  NumberInput: "write",
  Slider: "write",
  Switch: "write",
  Select: "write",
  Button: "action",
  Container: "layout",
  Columns: "layout",
  Divider: "layout"
};

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
    const kind =
      item.kind === "cancel" || item.kind === "setState" || item.kind === "toggleState"
        ? item.kind
        : "run";
    events.push({
      trigger,
      kind,
      // The builder stores "" for unset key/value — normalize to undefined.
      key: str(item.key) || undefined,
      value: str(item.value) || undefined
    });
  }
  return events;
};

/**
 * Parse an `app_doc` value (object or JSON string) into an {@link AppSpec}.
 * Slot children are discovered structurally — any prop that is an array of
 * `{type, props}` objects — so new layout widgets keep working unmodified.
 */
export function parseAppSpec(appDoc: unknown): {
  spec: AppSpec | null;
  issues: string[];
} {
  if (appDoc == null) {
    return { spec: null, issues: ["Workflow has no app_doc — build the app in the App Builder first."] };
  }
  let doc: unknown = appDoc;
  if (typeof doc === "string") {
    try {
      doc = JSON.parse(doc);
    } catch {
      return { spec: null, issues: ["app_doc is a string but not valid JSON."] };
    }
  }
  if (!isRecord(doc) || !isRecord(doc.data)) {
    return { spec: null, issues: ["app_doc is not a valid app document (missing `data`)."] };
  }
  const data = doc.data;
  if (!isRecord(data.root) || !Array.isArray(data.content)) {
    return { spec: null, issues: ["app_doc.data is not a valid Puck document (missing `root`/`content`)."] };
  }

  const issues: string[] = [];
  const version = typeof doc.version === "number" ? doc.version : 0;
  const rootProps = isRecord(data.root.props) ? data.root.props : {};
  const title = str(rootProps.title);

  const widgets: AppWidgetSpec[] = [];
  const walk = (items: unknown[], parentId: string | null, slot: string | null) => {
    for (const item of items) {
      if (!isPuckNode(item)) continue;
      const id = str(item.props.id) ?? `${item.type}-${widgets.length}`;
      const bindingMode = WIDGET_MODES[item.type] ?? "unknown";
      const binding = str(item.props.binding);
      widgets.push({
        id,
        type: item.type,
        bindingMode,
        binding: binding || null,
        stateKey: binding || (bindingMode === "write" ? id : null),
        label: str(item.props.label) ?? str(item.props.text) ?? null,
        events: parseEvents(item.props.events),
        parentId,
        slot
      });
      for (const [prop, value] of Object.entries(item.props)) {
        if (Array.isArray(value) && value.some(isPuckNode)) {
          walk(value, id, prop);
        }
      }
    }
  };
  walk(data.content, null, null);

  if (widgets.length === 0) {
    issues.push("The app document has no widgets — nothing to render or run.");
  }

  return { spec: { version, title, widgets }, issues };
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

/** Statically check the app's wiring against the workflow's bindable surface. */
export function validateApp(spec: AppSpec, io: AppIO): AppValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const inputNames = new Set(io.inputs.map((i) => i.name));
  const outputNames = new Set(io.outputs.map((o) => o.name));
  const variableNames = new Set(io.variables);
  const nodeIds = new Set(io.nodeIds);

  let hasRunTrigger = false;
  const boundOutputs = new Set<string>();

  for (const w of spec.widgets) {
    const where = `${w.type} "${w.id}"`;
    if (w.bindingMode === "unknown") {
      errors.push(`${where}: unknown widget type — not in the app-builder catalog.`);
      continue;
    }
    if (w.binding) {
      // `node:<id>#<prop>` write bindings target a graph node's property
      // directly (the web runtime overlays the value before the run).
      const nodeBinding = /^node:(.+)#[^#]+$/.exec(w.binding);
      if (w.bindingMode === "write" && nodeBinding) {
        if (!nodeIds.has(nodeBinding[1])) {
          errors.push(
            `${where}: bound to node property "${w.binding}" but the workflow has no node with id "${nodeBinding[1]}".`
          );
        }
      } else if (w.bindingMode === "write" && !inputNames.has(w.binding)) {
        errors.push(
          `${where}: bound to input "${w.binding}" but the workflow has no input node with that name.`
        );
      }
      if (w.bindingMode === "read") {
        if (outputNames.has(w.binding) || variableNames.has(w.binding)) {
          boundOutputs.add(w.binding);
        } else {
          errors.push(
            `${where}: bound to "${w.binding}" but the workflow has no output or variable with that name.`
          );
        }
      }
    } else if (w.bindingMode === "write") {
      warnings.push(`${where}: not bound to an input — its value stays local UI state.`);
    }

    for (const event of w.events) {
      if (event.kind === "run") hasRunTrigger = true;
      if (
        (event.kind === "setState" || event.kind === "toggleState") &&
        (!event.key || !variableNames.has(event.key))
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
    if (!boundOutputs.has(output.name)) {
      warnings.push(
        `Workflow output "${output.name}" is not displayed by any widget.`
      );
    }
  }

  return { errors, warnings };
}
