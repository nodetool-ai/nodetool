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
  operationTarget,
  parseApplicationDocument,
  parseBinding,
  parseCondition,
  resolveBinding,
  stateKey,
  widgetBindingProps,
  widgetMode,
  WIDGET_CATALOG,
  type ApplicationDocument,
  type BindingMode,
  type BindingRef,
  type BindingScope,
  type ConditionProps,
  type OperationBinding,
  type VariableDeclaration
} from "@nodetool-ai/app-runtime";

import type { DebugGraph } from "../debug/types.js";
import type {
  AppEventSpec,
  AppIO,
  AppOperationSpec,
  AppSpec,
  AppValidation,
  AppWidgetSpec
} from "./types.js";
import {
  isNonEmptyString,
  isString
} from "../predicates.js";

/** The same shape with its `readonly` modifiers dropped, for step-by-step construction. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const SET_VARIABLE_NODE_TYPE = "nodetool.variable.SetVariable";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | null => (isString(v) ? v : null);

interface PuckNode {
  type: string;
  props: Record<string, unknown>;
}

const isPuckNode = (v: unknown): v is PuckNode =>
  isRecord(v) && typeof v.type === "string" && isRecord(v.props);

/**
 * The app's operations resolved against real graphs, plus the declared
 * variables and resources. Built by the harness (resolving an operation's
 * workflow may need a database read) and handed to the pure layer here.
 */
export interface AppContext {
  defaultOperationId: string;
  operations: AppOperationSpec[];
  variables: VariableDeclaration[];
  resources: Array<{ id: string; name: string; kind: string }>;
}

/**
 * A widget's stored `visibleWhen`/`disabledWhen` props. Undefined when the
 * widget carries none, so an unconditional widget's spec is unchanged.
 */
const parseConditionProps = (raw: unknown): ConditionProps | undefined => {
  if (!isRecord(raw)) return undefined;
  const binding = str(raw.binding);
  if (!binding) return undefined;
  const op = str(raw.op);
  const value = str(raw.value);
  const props: ConditionProps = { binding };
  if (op) {
    props.op = op;
  }
  if (value !== null) {
    props.value = value;
  }
  return props;
};

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
      invocationId: str(item.invocationId) || undefined,
      resourceBindingId: str(item.resourceBindingId) || undefined,
      command: str(item.command) || undefined
    });
  }
  return events;
};

/**
 * The binding scope an app resolves against: every declared operation with the
 * surface of the workflow it runs, plus the declared variables. Without a
 * context this is the single-operation shape a legacy `app_doc` has.
 */
export function bindingScopeFor(io: AppIO, context?: AppContext): BindingScope {
  const operationIO = (id: string, own: AppIO | null) => ({
    operationId: id,
    inputs: (own ?? io).inputs.map(({ nodeId, name }) => ({ nodeId, name })),
    outputs: (own ?? io).outputs.map(({ nodeId, name }) => ({ nodeId, name })),
    nodeIds: (own ?? io).nodeIds,
    variableNames: (own ?? io).variables
  });
  if (!context) {
    return {
      defaultOperationId: DEFAULT_OPERATION_ID,
      operations: [operationIO(DEFAULT_OPERATION_ID, io)],
      variables: []
    };
  }
  return {
    defaultOperationId: context.defaultOperationId,
    operations: context.operations.map((op) => operationIO(op.id, op.io)),
    variables: context.variables
  };
}

/**
 * True for the widgets the catalog gives a `resourceBindingId` field — the ones
 * that read a document collection through the resource provider.
 */
const usesResourceBinding = (type: string): boolean =>
  WIDGET_CATALOG[type]?.fields.resourceBindingId !== undefined;

const modeToBindingMode = (mode: AppWidgetSpec["bindingMode"]): BindingMode =>
  mode === "write" ? "write" : mode === "read" ? "read" : "none";

/**
 * The operations a parsed document declares, as report specs. A document with
 * none gets the implicit single operation a legacy `app_doc` runs.
 */
export function documentOperations(
  document: ApplicationDocument
): OperationBinding[] {
  if (document.operations.length > 0) return document.operations;
  return [
    {
      id: DEFAULT_OPERATION_ID,
      name: "Run",
      workflowId: "",
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
}

/** Parse an app document (object or JSON string), or explain why it will not. */
export function parseAppDocument(appDoc: unknown) {
  if (appDoc == null) {
    return {
      document: null,
      issue: "Workflow has no app_doc — build the app in the App Builder first."
    };
  }
  let raw: unknown = appDoc;
  if (isString(raw)) {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {
        document: null,
        issue: "app_doc is a string but not valid JSON."
      };
    }
  }
  const document = parseApplicationDocument(raw, { hostWorkflowId: "self" });
  return document
    ? { document, issue: null }
    : {
        document: null,
        issue: "app_doc is not a valid application document (no `ui`/`data`)."
      };
}

/**
 * Variables the document declared as persisted but that the parser downgraded:
 * only user-scoped variables may persist, and the parser applies that silently.
 */
function persistDowngrades(appDoc: unknown): string[] {
  const raw = isString(appDoc) ? safeParse(appDoc) : appDoc;
  if (!isRecord(raw) || !Array.isArray(raw.variables)) return [];
  const names: string[] = [];
  for (const entry of raw.variables) {
    if (!isRecord(entry) || entry.persist !== true) continue;
    if (entry.scope === "user") continue;
    names.push(str(entry.name) ?? str(entry.id) ?? "(unnamed)");
  }
  return names;
}

/** A decoded JSON document, before anything validates its shape. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const safeParse = (value: string): JsonValue => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

/**
 * Parse an app document (object or JSON string) into an {@link AppSpec},
 * resolving every widget binding to a node-ID reference against the live
 * graph. Slot children are discovered from the widget catalog, falling back to
 * a structural scan so a new layout widget keeps working before the catalog
 * knows about it.
 */
export function parseAppSpec(
  appDoc: unknown,
  io: AppIO,
  context?: AppContext,
  /**
   * The document the target loader already parsed. Passed in so an application
   * or bundle target is not re-parsed as if it were a `workflow.app_doc` —
   * `appDoc` stays the raw stored value, which is what the persist-downgrade
   * check needs to see.
   */
  preparsed?: { document: ApplicationDocument | null; issue: string | null }
) {
  const { document, issue } = preparsed ?? parseAppDocument(appDoc);
  if (!document) return { spec: null, issues: [issue ?? ""], warnings: [] };

  const issues: string[] = [];
  const warnings: string[] = [];
  for (const name of persistDowngrades(appDoc)) {
    warnings.push(
      `Variable "${name}" declares persist: true with scope: "instance" — only user-scoped variables persist, so it was downgraded to in-memory.`
    );
  }
  const scope = bindingScopeFor(io, context);
  const rootProps = isRecord(document.ui.root.props)
    ? document.ui.root.props
    : {};
  const title = str(rootProps.title);

  const widgets: AppWidgetSpec[] = [];
  const walk = (
    items: unknown[],
    parentId: string | null,
    slot: string | null
  ) => {
    for (const item of items) {
      if (!isPuckNode(item)) continue;
      const id = str(item.props.id) ?? `${item.type}-${widgets.length}`;
      const bindingMode = widgetMode(item.type);
      const binding = str(item.props.binding) || null;
      // A resource widget addresses a collection, not app state, so it carries
      // `resourceBindingId` where the state widgets carry `binding`.
      const resourceBindingId = usesResourceBinding(item.type)
        ? str(item.props.resourceBindingId) || null
        : null;
      const visibleWhen = parseConditionProps(item.props.visibleWhen);
      const disabledWhen = parseConditionProps(item.props.disabledWhen);
      const format = str(item.props.format) || null;
      const ref: BindingRef | null = binding
        ? resolveBinding(binding, scope, modeToBindingMode(bindingMode))
        : bindingMode === "write"
          ? // An unbound write widget still holds its own value — as widget-local
            // view state, which cannot collide with a workflow input.
            { kind: "view", componentId: id, prop: "value" }
          : null;
      type WidgetFields = Mutable<AppWidgetSpec>;
      const widget: WidgetFields = {
        id,
        type: item.type,
        bindingMode,
        binding,
        ref,
        stateKey: ref ? stateKey(ref) : null,
        canonicalBinding: ref ? encodeBinding(ref) : null,
        resourceBindingId,
        extraBindings: widgetBindingProps(item.type).flatMap(
          ({ prop, mode }) => {
            const value = str(item.props[prop]);
            if (!value) return [];
            return [
              { prop, binding: value, ref: resolveBinding(value, scope, mode) }
            ];
          }
        ),
        label: str(item.props.label) ?? str(item.props.text) ?? null,
        events: parseEvents(item.props.events),
        parentId,
        slot
      };
      if (visibleWhen) {
        widget.visibleWhen = visibleWhen;
      }
      if (disabledWhen) {
        widget.disabledWhen = disabledWhen;
      }
      if (format) {
        widget.format = format;
      }
      widgets.push(widget);
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

  const operations =
    context?.operations ??
    documentOperations(document).map((binding) =>
      operationSpec(binding, null, null)
    );

  return {
    spec: {
      version: document.schemaVersion,
      title,
      widgets,
      operations,
      variables: context?.variables ?? document.variables,
      resources: document.resources.map(({ id, name, kind }) => ({
        id,
        name,
        kind
      }))
    },
    issues,
    warnings
  };
}

/** An operation binding plus the surface it resolved against, for the report. */
export function operationSpec(
  binding: OperationBinding,
  io: AppIO | null,
  unavailable: string | null
): AppOperationSpec {
  return {
    id: binding.id,
    name: binding.name,
    workflowId: binding.workflowId,
    target: operationTarget(binding),
    policy: binding.policy,
    timeoutMs: binding.timeoutMs ?? null,
    inputs: binding.inputs,
    outputs: binding.outputs,
    io,
    unavailable
  };
}

/** Read a node property from the kernel graph shape (`properties`, not `data`). */
const nodeProps = (node: Record<string, unknown>): Record<string, unknown> =>
  isRecord(node.properties) ? node.properties : {};

const nodeName = (node: Record<string, unknown>): string => {
  const name = nodeProps(node).name;
  if (isNonEmptyString(name)) return name;
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

/** Every id a variable binding may name: declared ids/names + graph channels. */
function knownVariableIds(io: AppIO, context?: AppContext): Set<string> {
  const known = new Set<string>(io.variables);
  for (const variable of context?.variables ?? []) {
    known.add(variable.id);
    known.add(variable.name);
  }
  for (const operation of context?.operations ?? []) {
    for (const name of operation.io?.variables ?? []) known.add(name);
  }
  return known;
}

/** Statically check the app's wiring against the workflow's bindable surface. */
export function validateApp(
  spec: AppSpec,
  io: AppIO,
  context?: AppContext
): AppValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const scope = bindingScopeFor(io, context);
  const defaultOperationId =
    context?.defaultOperationId ?? DEFAULT_OPERATION_ID;
  // Without a context there is one operation over the host workflow, so the
  // host surface is its surface.
  const operations = spec.operations.map((op) =>
    op.io || op.id !== defaultOperationId ? op : { ...op, io }
  );
  const operationIds = new Set(operations.map((op) => op.id));
  // Node ids per operation, for the operations whose workflow resolved. An
  // operation with no `io` has no graph to check against, so its bindings are
  // left alone rather than reported as missing nodes.
  const nodeIdsByOperation = new Map<string, ReadonlySet<string>>(
    operations
      .filter((op) => op.io !== null)
      .map((op) => [op.id, new Set(op.io?.nodeIds ?? [])])
  );
  /**
   * The node an ID-form binding names, when the operation's graph does not have
   * it. `parseBinding` accepts any well-formed token, so a widget bound to a
   * node that was deleted (or never existed) resolves to a ref addressing a
   * state slot no run ever fills — a silent blank widget without this check.
   */
  const missingNode = (
    binding: string | null,
    ref: BindingRef | null
  ): { operationId: string; nodeId: string } | null => {
    if (!parseBinding(binding) || !ref || !("nodeId" in ref)) return null;
    const known = nodeIdsByOperation.get(ref.operationId);
    if (!known || known.has(ref.nodeId)) return null;
    return { operationId: ref.operationId, nodeId: ref.nodeId };
  };
  const variableIds = knownVariableIds(io, context);
  const resourceIds = new Set(spec.resources.map((r) => r.id));

  let hasRunTrigger = false;
  /** `opId:nodeId` of every output a widget displays. */
  const displayedOutputs = new Set<string>();
  /** Operations some widget event can run. */
  const runnableOperations = new Set<string>();
  /** Operation ids whose execution state a widget shows. */
  const execBindings = new Map<string, string[]>();

  for (const w of spec.widgets) {
    const where = `${w.type} "${w.id}"`;
    if (w.bindingMode === "unknown") {
      errors.push(
        `${where}: unknown widget type — not in the app-builder catalog.`
      );
      continue;
    }
    if (w.binding && !w.ref) {
      errors.push(
        w.bindingMode === "write"
          ? `${where}: bound to "${w.binding}" but the workflow has no input node or node property that resolves it.`
          : `${where}: bound to "${w.binding}" but the workflow has no output or variable with that name.`
      );
    } else if (
      !w.binding &&
      w.bindingMode === "write" &&
      !usesResourceBinding(w.type)
    ) {
      warnings.push(
        `${where}: not bound to an input — its value stays local UI state.`
      );
    }
    // A resource widget with no collection behind it renders an empty picker
    // the user can never choose from, which a run-only check never surfaces.
    if (usesResourceBinding(w.type)) {
      if (!w.resourceBindingId) {
        errors.push(
          `${where}: no resource binding selected — the widget has no collection to show. Add one with a resource binding.`
        );
      } else if (!resourceIds.has(w.resourceBindingId)) {
        errors.push(
          `${where}: bound to resource "${w.resourceBindingId}" but the app declares no such resource binding.`
        );
      }
    }
    // An explicit `op:<id>/…` token resolves on its own syntax, so a token
    // naming an operation the document never declared has to be caught here.
    const explicit = parseBinding(w.binding);
    if (explicit && "operationId" in explicit && explicit.operationId) {
      if (!operationIds.has(explicit.operationId)) {
        errors.push(
          `${where}: bound to "${w.binding}" but the app declares no operation "${explicit.operationId}".`
        );
      }
    }
    const missing = missingNode(w.binding, w.ref);
    if (missing) {
      errors.push(
        `${where}: bound to "${w.binding}" but operation "${missing.operationId}" runs a workflow with no node "${missing.nodeId}".`
      );
    }
    // An unresolvable condition binding is not enforced at runtime — the widget
    // shows and stays enabled — so the author sees a condition that quietly
    // does nothing.
    for (const [prop, props] of [
      ["visibleWhen", w.visibleWhen],
      ["disabledWhen", w.disabledWhen]
    ] as const) {
      if (!props?.binding || parseCondition(props, scope)) continue;
      warnings.push(
        `${where}: ${prop} reads "${props.binding}", which resolves to nothing — the condition never applies, so the widget stays visible and enabled.`
      );
    }
    for (const extra of w.extraBindings) {
      const extraMissing = missingNode(extra.binding, extra.ref);
      if (!extra.ref) {
        errors.push(
          `${where}: ${extra.prop} is bound to "${extra.binding}" but the workflow has no output or variable with that name.`
        );
      } else if (extraMissing) {
        errors.push(
          `${where}: ${extra.prop} is bound to "${extra.binding}" but operation "${extraMissing.operationId}" runs a workflow with no node "${extraMissing.nodeId}".`
        );
      } else if (extra.ref.kind === "output") {
        displayedOutputs.add(`${extra.ref.operationId}:${extra.ref.nodeId}`);
      }
    }
    if (w.ref?.kind === "output") {
      displayedOutputs.add(`${w.ref.operationId}:${w.ref.nodeId}`);
    }
    if (w.ref?.kind === "execution") {
      const list = execBindings.get(w.ref.operationId) ?? [];
      list.push(`${where} (${w.ref.field})`);
      execBindings.set(w.ref.operationId, list);
    }

    for (const event of w.events) {
      const target = event.operationId ?? defaultOperationId;
      if (event.kind === "run") {
        hasRunTrigger = true;
        runnableOperations.add(target);
      }
      if (
        (event.kind === "run" || event.kind === "cancel") &&
        !operationIds.has(target)
      ) {
        errors.push(
          `${where}: ${event.kind} targets operation "${target}" but the app declares no such operation.`
        );
      }
      if (
        VARIABLE_EVENT_KINDS.has(event.kind) &&
        !resolveBinding(event.key, scope, "read")
      ) {
        errors.push(
          `${where}: ${event.kind} targets variable "${event.key ?? ""}" but the workflow has no SetVariable node with that name.`
        );
      }
      if (event.kind === "resourceCommand" || event.kind === "openResource") {
        if (
          !event.resourceBindingId ||
          !resourceIds.has(event.resourceBindingId)
        ) {
          errors.push(
            `${where}: ${event.kind} targets resource "${event.resourceBindingId ?? ""}" but the app declares no such resource binding.`
          );
        }
      }
    }
  }

  if (spec.widgets.length > 0 && !hasRunTrigger) {
    errors.push(
      'No widget has a "run" event — the app can never execute the workflow. Add a Run button or an on-change run.'
    );
  }

  for (const operation of operations) {
    const label = `Operation "${operation.id}"`;
    if (operation.unavailable) {
      errors.push(`${label}: ${operation.unavailable}`);
    }
    validateMappings(operation, variableIds, resourceIds, errors, warnings);

    const mappedToVariable = new Set(
      Object.entries(operation.outputs)
        .filter(([, mapping]) => mapping.to === "variable")
        .map(([nodeId]) => nodeId)
    );
    for (const output of operation.io?.outputs ?? []) {
      if (displayedOutputs.has(`${operation.id}:${output.nodeId}`)) continue;
      if (mappedToVariable.has(output.nodeId)) continue;
      warnings.push(
        `Workflow output "${output.name}" is not displayed by any widget.`
      );
    }

    if (spec.widgets.length > 0 && !runnableOperations.has(operation.id)) {
      const shown = execBindings.get(operation.id);
      // A display of an operation nothing can start shows nothing, ever.
      if (shown) {
        errors.push(
          `${label} is never run by any widget, but ${shown.join(", ")} shows its execution state.`
        );
      } else {
        warnings.push(`${label} is declared but no widget event runs it.`);
      }
    }
  }

  return { errors, warnings };
}

/** Check one operation's input/output mappings against what the app declares. */
function validateMappings(
  operation: AppOperationSpec,
  variableIds: ReadonlySet<string>,
  resourceIds: ReadonlySet<string>,
  errors: string[],
  warnings: string[]
): void {
  const label = `Operation "${operation.id}"`;
  const inputNodeIds = new Set(
    (operation.io?.inputs ?? []).map((i) => i.nodeId)
  );
  const outputNodeIds = new Set(
    (operation.io?.outputs ?? []).map((o) => o.nodeId)
  );

  for (const [nodeId, mapping] of Object.entries(operation.inputs)) {
    if (operation.io && !inputNodeIds.has(nodeId)) {
      errors.push(
        `${label}: input mapping for node "${nodeId}", which the workflow has no input node for.`
      );
    }
    switch (mapping.from) {
      case "variable":
        if (!variableIds.has(mapping.variableId)) {
          errors.push(
            `${label}: input "${nodeId}" reads variable "${mapping.variableId}", which the app does not declare.`
          );
        }
        break;
      case "constant":
        if (mapping.value === undefined) {
          warnings.push(
            `${label}: input "${nodeId}" is mapped to a constant with no value — the run sends nothing for it.`
          );
        }
        break;
      case "resource":
        if (!resourceIds.has(mapping.resourceBindingId)) {
          errors.push(
            `${label}: input "${nodeId}" reads resource binding "${mapping.resourceBindingId}", which the app does not declare.`
          );
        } else {
          warnings.push(
            `${label}: input "${nodeId}" comes from resource binding "${mapping.resourceBindingId}" — a headless run only sees a seeded collection, so seed it with a seedResource step or a "resource:${mapping.resourceBindingId}" param before running.`
          );
        }
        break;
      default:
        break;
    }
  }

  for (const [nodeId, mapping] of Object.entries(operation.outputs)) {
    if (operation.io && !outputNodeIds.has(nodeId)) {
      errors.push(
        `${label}: output mapping for node "${nodeId}", which the workflow has no output node for.`
      );
    }
    if (mapping.to === "variable" && !variableIds.has(mapping.variableId)) {
      errors.push(
        `${label}: output "${nodeId}" writes variable "${mapping.variableId}", which the app does not declare.`
      );
    }
  }
}
