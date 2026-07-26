/**
 * Headless bridge for the App Builder (Puck) tool-loop eval.
 *
 * The real frontend tools (`web/src/lib/tools/builtin/puck.ts`) delegate to a
 * `PuckAgentHandler` the live editor registers on `puckAgentBridge` — it drives
 * the Puck editor through usePuck's dispatch, so it can only run in the browser.
 * This bridge reimplements the *effects* of the layout tools against a plain
 * in-memory document tree (the same shape `puckDataOps.ts` walks: a top-level
 * `content` array plus slot-valued props on layout widgets), so a model can
 * drive the same `ui_app_*` tool surface headlessly.
 *
 * The document-meta tools (operations, variables, resources, binding targets)
 * are not reimplemented at all: they call the same `@nodetool-ai/app-runtime`
 * doc-ops the browser handler calls, so the two surfaces cannot drift.
 *
 * What it does NOT fork is the tool *contract*: names, descriptions, and Zod
 * parameter shapes are copied verbatim from the builtin file — the single
 * source of truth the browser tools also expose. The widget catalog mirrors the
 * Puck config (`web/src/components/appbuilder/puck/config.tsx`): a representative
 * set of display / input / action / layout widgets, with the layout widgets
 * (Panel, Columns) carrying the same slot fields the real editor nests into.
 */

import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import {
  EMPTY_DOC_META,
  addOperation,
  addResource,
  bindingTargets,
  declareVariable,
  removeOperation,
  removeResource,
  removeVariable,
  updateOperation,
  updateVariable,
  type AppDocMeta,
  type BindableWorkflow,
  type InputMapping,
  type OperationBinding,
  type OperationPatch,
  type OperationPolicy,
  type OutputMapping,
  type ResourceBinding,
  type ResourceKind,
  type ResourceOperation,
  type VariableDeclaration,
  type VariablePatch
} from "@nodetool-ai/app-runtime";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase
} from "../tool-loop-eval.js";

/** One widget type in the catalog: its fields and which of them are slots. */
interface WidgetTypeDef {
  label: string;
  /** Field name → field kind (text, textarea, number, select, slot, ...). */
  fields: Record<string, string>;
}

/**
 * The widget catalog: the full component set from the Puck config
 * (`web/src/components/appbuilder/puck/config.tsx`), kept 1:1 so a model
 * discovering types via `ui_app_list_component_types` sees the same catalog the
 * browser exposes. Only the type/label/field-kind metadata the `ui_app_*` tools
 * surface matters here — render functions and default props are the browser's
 * concern. Layout widgets (Panel/Columns) carry `slot` fields; nesting a widget
 * targets one of them. Keep this in sync when the frontend config's components
 * change.
 */
const WIDGET_TYPES: Record<string, WidgetTypeDef> = {
  // ── Display ──
  Heading: { label: "Heading", fields: { text: "text", level: "select", binding: "custom" } },
  Text: { label: "Text", fields: { text: "textarea", binding: "custom" } },
  Markdown: { label: "Markdown", fields: { text: "textarea", binding: "custom" } },
  Image: { label: "Image", fields: { binding: "custom", fit: "select", height: "number", placeholder: "text" } },
  Audio: { label: "Audio", fields: { binding: "custom", placeholder: "text" } },
  Video: { label: "Video", fields: { binding: "custom", height: "number", placeholder: "text" } },
  Json: { label: "JSON", fields: { binding: "custom" } },
  Output: { label: "Output", fields: { binding: "custom", placeholder: "text" } },
  Progress: { label: "Progress", fields: { label: "text", binding: "custom" } },
  // ── Inputs ──
  WorkflowInput: { label: "Workflow Input", fields: { binding: "custom", events: "array" } },
  TextInput: { label: "Text Input", fields: { binding: "custom", label: "text", placeholder: "text", multiline: "radio", events: "array" } },
  NumberInput: { label: "Number Input", fields: { binding: "custom", label: "text", min: "number", max: "number", step: "number", events: "array" } },
  Slider: { label: "Slider", fields: { binding: "custom", label: "text", min: "number", max: "number", step: "number", events: "array" } },
  Switch: { label: "Switch", fields: { binding: "custom", label: "text", events: "array" } },
  Select: { label: "Select", fields: { binding: "custom", label: "text", options: "array", events: "array" } },
  ImageInput: { label: "Image Input", fields: { binding: "custom", label: "text", events: "array" } },
  AudioInput: { label: "Audio Input", fields: { binding: "custom", label: "text", events: "array" } },
  VideoInput: { label: "Video Input", fields: { binding: "custom", label: "text", events: "array" } },
  DocumentInput: { label: "Document Input", fields: { binding: "custom", label: "text", events: "array" } },
  ColorInput: { label: "Color Input", fields: { binding: "custom", label: "text", events: "array" } },
  // ── Actions ──
  Button: { label: "Button", fields: { label: "text", variant: "select", color: "select", events: "array" } },
  // ── Layout ──
  Container: { label: "Panel", fields: { title: "text", content: "slot" } },
  Columns: { label: "Columns", fields: { gap: "number", left: "slot", right: "slot" } },
  Divider: { label: "Divider", fields: {} }
};

/** Map of widget type → its slot field names (mirrors `getSlotFields`). */
const SLOT_FIELDS: Record<string, string[]> = Object.fromEntries(
  Object.entries(WIDGET_TYPES).map(([type, def]) => [
    type,
    Object.entries(def.fields)
      .filter(([, kind]) => kind === "slot")
      .map(([name]) => name)
  ])
);

/** A placed widget: type plus props (props always carry an `id`). */
interface ComponentNode {
  type: string;
  props: Record<string, unknown> & { id: string };
}

/** Flattened view of one placed widget, matching the real `ComponentSummary`. */
export interface AppComponentSummary {
  id: string;
  type: string;
  props: Record<string, unknown>;
  parentId: string | null;
  slot: string | null;
}

export interface AppBridgeFinalState {
  title: string | null;
  selectedId: string | null;
  components: AppComponentSummary[];
  /** The non-UI half of the document, so a case can score bindings. */
  operations: OperationBinding[];
  variables: VariableDeclaration[];
  resources: ResourceBinding[];
}

/** A widget to seed, optionally nesting children into its slots. */
export interface SeedComponent {
  type: string;
  id?: string;
  props?: Record<string, unknown>;
  /** Children keyed by slot field name (e.g. `content`, `left`, `right`). */
  slots?: Record<string, SeedComponent[]>;
}

export interface AppBridgeInitialState {
  title?: string;
  components?: SeedComponent[];
  /** Operations, variables, and resources the document starts with. */
  meta?: AppDocMeta;
  /**
   * Id of the workflow this app document hangs off. `ui_app_get_binding_targets`
   * reports node-level targets only for operations pointing at it, mirroring an
   * editor that has loaded exactly its own workflow.
   */
  workflowId?: string;
  /** Bindable surface of that host workflow: its input/output nodes and channels. */
  workflow?: BindableWorkflow;
}

const EMPTY_WORKFLOW: BindableWorkflow = {
  inputs: [],
  outputs: [],
  variables: []
};

/** Slot arrays present on a node, mirroring `slotArrays` in puckDataOps. */
function slotArrays(
  node: ComponentNode
): { slot: string; items: ComponentNode[] }[] {
  const result: { slot: string; items: ComponentNode[] }[] = [];
  for (const slot of SLOT_FIELDS[node.type] ?? []) {
    const value = node.props[slot];
    if (Array.isArray(value)) {
      result.push({ slot, items: value as ComponentNode[] });
    }
  }
  return result;
}

/** Flatten the whole tree to summaries (mirrors `flattenComponents`). */
function flattenComponents(content: ComponentNode[]): AppComponentSummary[] {
  const out: AppComponentSummary[] = [];
  const walk = (
    items: ComponentNode[],
    parentId: string | null,
    slot: string | null
  ) => {
    for (const node of items) {
      out.push({
        id: node.props.id,
        type: node.type,
        props: node.props,
        parentId,
        slot
      });
      for (const { slot: s, items: children } of slotArrays(node)) {
        walk(children, node.props.id, s);
      }
    }
  };
  walk(content, null, null);
  return out;
}

/** Recursively map over every node, returning a new tree (mirrors `mapTree`). */
function mapTree(
  items: ComponentNode[],
  fn: (node: ComponentNode) => ComponentNode | null
): ComponentNode[] {
  const result: ComponentNode[] = [];
  for (const node of items) {
    const mapped = fn(node);
    if (mapped === null) continue;
    let next = mapped;
    for (const { slot, items: children } of slotArrays(next)) {
      next = {
        ...next,
        props: { ...next.props, [slot]: mapTree(children, fn) }
      };
    }
    result.push(next);
  }
  return result;
}

function tool(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  impl: (args: Record<string, unknown>) => Promise<unknown>
): HeadlessTool {
  return {
    name,
    description,
    parameters,
    execute: (args) => {
      const parsed = parseWithTypeCoercion(parameters, args ?? {}) as Record<
        string,
        unknown
      >;
      return impl(parsed);
    }
  };
}

const workflowIdParam = z
  .string()
  .describe(
    "Id of the workflow whose app document to operate on. The open app " +
      "builders are listed in the ui_context block."
  );

/* Parameter schemas for the document-meta tools, verbatim from the builtin. */

const inputMapping = z
  .discriminatedUnion("from", [
    z.object({ from: z.literal("widget") }),
    z.object({ from: z.literal("variable"), variableId: z.string() }),
    z.object({ from: z.literal("constant"), value: z.unknown() }),
    z.object({ from: z.literal("resource"), resourceBindingId: z.string() })
  ])
  .describe(
    "Where this input takes its value: the bound widget, a variable, a constant, or the selected resource."
  );

const outputMapping = z
  .discriminatedUnion("to", [
    z.object({ to: z.literal("display") }),
    z.object({ to: z.literal("variable"), variableId: z.string() })
  ])
  .describe("Where this output lands: a display widget, or a variable.");

const operationPolicy = z
  .enum(["parallel", "replace", "queue"])
  .describe(
    "How a second invocation behaves while one runs: run side by side, cancel the previous one, or queue behind it."
  );

const variableScope = z
  .enum(["instance", "user"])
  .describe(
    "'instance' lives as long as the open app; 'user' is per user and may persist."
  );

const resourceKind = z
  .enum(["asset", "timeline", "storyboard", "sketch"])
  .describe("Kind of document the binding addresses.");

/**
 * Build an in-memory App Builder bridge whose tools share the `ui_app_*`
 * contract but run headlessly against a plain document tree (no Puck editor).
 *
 * A single app is modeled: every tool takes a `workflow_id` (mirroring the real
 * tools), which is accepted but not used to disambiguate — the bridge holds one
 * document. Passing an unknown id is not an error, matching how a scored run
 * only cares about the resulting document.
 */
export function createAppToolBridge(
  initial: AppBridgeInitialState = {}
): HeadlessSurfaceBridge<AppBridgeFinalState> {
  let content: ComponentNode[] = [];
  let title: string | null = initial.title ?? null;
  let selectedId: string | null = null;
  let meta: AppDocMeta = initial.meta ?? EMPTY_DOC_META;
  const hostWorkflowId = initial.workflowId ?? "wf-app";
  const hostWorkflow = initial.workflow ?? EMPTY_WORKFLOW;
  let idSeq = 0;
  // Track every id in use so generated ids never collide with an explicitly
  // seeded one (e.g. seeding "Heading-1" then adding a Heading).
  const usedIds = new Set<string>();

  const nextId = (type: string): string => {
    let id: string;
    do {
      id = `${type}-${++idSeq}`;
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };

  const seed = (nodes: SeedComponent[]): ComponentNode[] =>
    nodes.map((n) => {
      const id = n.id ?? nextId(n.type);
      usedIds.add(id);
      const props: Record<string, unknown> & { id: string } = {
        ...(n.props ?? {}),
        id
      };
      for (const [slot, children] of Object.entries(n.slots ?? {})) {
        props[slot] = seed(children);
      }
      return { type: n.type, props };
    });

  content = seed(initial.components ?? []);

  const insertInto = (
    items: ComponentNode[],
    node: ComponentNode,
    index?: number
  ): ComponentNode[] => {
    const at = index ?? items.length;
    const next = [...items];
    next.splice(Math.max(0, Math.min(at, items.length)), 0, node);
    return next;
  };

  const tools: HeadlessTool[] = [
    tool(
      "ui_app_get_snapshot",
      "Read a workflow's open App Builder: every placed widget (id, type, props, " +
        "parent), the selected widget, the page title, and the available widget " +
        "types. Call this first to see what's on the page before editing.",
      z.object({ workflow_id: workflowIdParam }),
      async ({ workflow_id }) => ({
        ok: true,
        workflowId: workflow_id,
        rootProps: title !== null ? { title } : {},
        selectedId,
        componentTypes: Object.keys(WIDGET_TYPES),
        components: flattenComponents(content)
      })
    ),

    tool(
      "ui_app_list_component_types",
      "List the widget types the App Builder supports and their fields (props). " +
        "Use this to learn valid `type` values and which props each widget accepts " +
        "(e.g. label, binding, events).",
      z.object({ workflow_id: workflowIdParam }),
      async () => ({
        ok: true,
        types: Object.entries(WIDGET_TYPES).map(([type, def]) => ({
          type,
          label: def.label,
          fields: Object.entries(def.fields).map(([name, kind]) => ({
            name,
            type: kind
          }))
        }))
      })
    ),

    tool(
      "ui_app_add_component",
      "Add a widget to the app. Bindings reference workflow nodes that must " +
        "already exist: input widgets bind to Input nodes (props.binding = input " +
        "name) or directly to any node property (props.binding = " +
        "'node:<nodeId>#<property>'), display widgets to Output nodes or " +
        "Variables, and other state to Variables. Add those nodes first with the " +
        "workflow tools. To nest inside a Panel or Columns widget, pass parent_id " +
        "(and slot: 'content' | 'left' | 'right').",
      z.object({
        workflow_id: workflowIdParam,
        type: z
          .string()
          .describe("Widget type, e.g. 'Heading', 'TextInput', 'Button'."),
        props: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Initial props (label, text, binding, events, ...)."),
        parent_id: z
          .string()
          .nullable()
          .optional()
          .describe("Id of a Panel/Columns widget in this app to nest inside."),
        slot: z
          .string()
          .nullable()
          .optional()
          .describe("Slot of the parent: 'content', 'left', or 'right'."),
        index: z
          .number()
          .int()
          .optional()
          .describe("Insertion index within the target list.")
      }),
      async ({ workflow_id: _wf, type, props, parent_id, slot, index }) => {
        // The real tool/handler doesn't validate `type` — Puck inserts whatever
        // string it's given — so the bridge stays permissive too. An unknown
        // type just has no slots (SLOT_FIELDS lookup defaults to []).
        const id = nextId(type as string);
        const node: ComponentNode = {
          type: type as string,
          props: { ...((props as Record<string, unknown>) ?? {}), id }
        };
        const parentId = (parent_id as string | null | undefined) ?? null;
        const wanted = (slot as string | null | undefined) ?? null;
        const at = index as number | undefined;

        // Mirror puckDataOps.addComponent exactly: an unknown parent id or a
        // parent with no slots silently no-ops (the node is not inserted) — the
        // real tool never errors on these, it just leaves the tree unchanged.
        // Adding a widget does NOT change the selection either, matching
        // PuckAgentBinder.addComponent (only ui_app_select_component does).
        if (!parentId) {
          content = insertInto(content, node, at);
        } else {
          content = mapTree(content, (n) => {
            if (n.props.id !== parentId) return n;
            const slots = SLOT_FIELDS[n.type] ?? [];
            const targetSlot =
              wanted && slots.includes(wanted) ? wanted : slots[0];
            if (!targetSlot) return n;
            const current = Array.isArray(n.props[targetSlot])
              ? (n.props[targetSlot] as ComponentNode[])
              : [];
            return {
              ...n,
              props: { ...n.props, [targetSlot]: insertInto(current, node, at) }
            };
          });
        }
        // Echo parentId/slot as the caller passed them, matching the real tool
        // (PuckAgentBinder.addComponent returns slot: args.slot ?? null);
        // ui_app_get_snapshot is the authoritative source for the resolved tree.
        return {
          ok: true,
          component: {
            id: node.props.id,
            type: node.type,
            props: node.props,
            parentId,
            slot: wanted
          }
        };
      }
    ),

    tool(
      "ui_app_update_component",
      "Merge props into an existing widget (e.g. set its binding, label, or " +
        "events). The widget's id cannot be changed.",
      z.object({
        workflow_id: workflowIdParam,
        id: z
          .string()
          .describe(
            "Widget id from ui_app_get_snapshot — a component inside the app, not a workflow id."
          ),
        props: z.record(z.string(), z.unknown()).describe("Props to merge.")
      }),
      async ({ workflow_id: _wf, id, props }) => {
        let found = false;
        content = mapTree(content, (n) => {
          if (n.props.id !== id) return n;
          found = true;
          // Never let a caller overwrite the id.
          const { id: _ignored, ...rest } = props as Record<string, unknown>;
          return { ...n, props: { ...n.props, ...rest, id: n.props.id } };
        });
        if (!found) {
          return { ok: false, error: `No widget with id ${id}` };
        }
        const summary = flattenComponents(content).find((c) => c.id === id)!;
        return { ok: true, component: summary };
      }
    ),

    tool(
      "ui_app_remove_component",
      "Remove a widget (and anything nested inside it) from the app.",
      z.object({
        workflow_id: workflowIdParam,
        id: z
          .string()
          .describe("Widget id to remove — a component inside the app.")
      }),
      async ({ workflow_id: _wf, id }) => {
        let removed = false;
        content = mapTree(content, (n) => {
          if (n.props.id === id) {
            removed = true;
            return null;
          }
          return n;
        });
        // Clear the selection if the selected widget is gone — directly
        // removed or dropped as a descendant of the removed parent.
        if (
          removed &&
          selectedId &&
          !flattenComponents(content).some((c) => c.id === selectedId)
        ) {
          selectedId = null;
        }
        return { ok: removed, removed_id: removed ? id : null };
      }
    ),

    tool(
      "ui_app_select_component",
      "Select a widget so its properties show in the inspector (or pass null to " +
        "clear the selection).",
      z.object({
        workflow_id: workflowIdParam,
        id: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Widget id to select — a component inside the app. Null or omitted clears the selection."
          )
      }),
      async ({ workflow_id: _wf, id }) => {
        const wanted = (id as string | null | undefined) ?? null;
        // Mirror the real editor: selecting an unknown id clears the
        // selection (Puck's selector lookup returns null for it).
        selectedId =
          wanted && flattenComponents(content).some((c) => c.id === wanted)
            ? wanted
            : null;
        // Match the real tool contract, which returns only { ok: true }.
        return { ok: true };
      }
    ),

    tool(
      "ui_app_set_title",
      "Set the app's page title (shown at the top of the app).",
      z.object({
        workflow_id: workflowIdParam,
        title: z.string()
      }),
      async ({ workflow_id: _wf, title: next }) => {
        title = next as string;
        return { ok: true, title };
      }
    ),

    /* ------------------------------------------------------------ operations */

    tool(
      "ui_app_list_operations",
      "List the app's operation bindings: each one names a workflow the app can " +
        "run, with its input and output mappings and its concurrency policy. " +
        "Widget bindings address an operation by id (op:<opId>/in:<nodeId>).",
      z.object({ workflow_id: workflowIdParam }),
      async () => ({ ok: true, operations: meta.operations })
    ),

    tool(
      "ui_app_add_operation",
      "Bind a workflow to the app as a named operation. The same workflow may be " +
        "bound twice with different mappings. `inputs` keys on input node IDs and " +
        "`outputs` on output node IDs (not names) — get them from " +
        "ui_app_get_binding_targets. An input with no mapping takes its bound " +
        "widget's value; an output with no mapping displays.",
      z.object({
        workflow_id: workflowIdParam,
        id: z
          .string()
          .optional()
          .describe("Operation id. Derived from the name when omitted."),
        name: z.string().optional().describe("Display name, e.g. 'Translate'."),
        target_workflow_id: z
          .string()
          .describe("Id of the workflow this operation runs."),
        workflow_version: z
          .number()
          .int()
          .optional()
          .describe("Pin a workflow version. Omitted means latest."),
        policy: operationPolicy.optional(),
        inputs: z
          .record(z.string(), inputMapping)
          .optional()
          .describe("Input node id → mapping."),
        outputs: z
          .record(z.string(), outputMapping)
          .optional()
          .describe("Output node id → mapping."),
        timeout_ms: z.number().int().optional()
      }),
      async (args) => {
        const result = addOperation(meta, {
          id: args.id as string | undefined,
          name: args.name as string | undefined,
          workflowId: args.target_workflow_id as string,
          workflowVersion: args.workflow_version as number | undefined,
          policy: args.policy as OperationPolicy | undefined,
          inputs: args.inputs as Record<string, InputMapping> | undefined,
          outputs: args.outputs as Record<string, OutputMapping> | undefined,
          timeoutMs: args.timeout_ms as number | undefined
        });
        meta = result.meta;
        return { ok: true, operation: result.operation };
      }
    ),

    tool(
      "ui_app_update_operation",
      "Change an operation binding. Input and output mappings merge per node id, " +
        "so one input can be remapped without restating the others.",
      z.object({
        workflow_id: workflowIdParam,
        id: z.string().describe("Operation id to update."),
        name: z.string().optional(),
        target_workflow_id: z
          .string()
          .optional()
          .describe("Point the operation at a different workflow."),
        workflow_version: z.number().int().optional(),
        policy: operationPolicy.optional(),
        inputs: z
          .record(z.string(), inputMapping)
          .optional()
          .describe(
            "Input node id → mapping. Merged into the existing mappings."
          ),
        outputs: z
          .record(z.string(), outputMapping)
          .optional()
          .describe(
            "Output node id → mapping. Merged into the existing mappings."
          ),
        timeout_ms: z.number().int().optional()
      }),
      async (args) => {
        const patch: OperationPatch = {
          ...(args.name !== undefined ? { name: args.name as string } : {}),
          ...(args.target_workflow_id !== undefined
            ? { workflowId: args.target_workflow_id as string }
            : {}),
          ...(args.workflow_version !== undefined
            ? { workflowVersion: args.workflow_version as number }
            : {}),
          ...(args.policy !== undefined
            ? { policy: args.policy as OperationPolicy }
            : {}),
          ...(args.inputs !== undefined
            ? { inputs: args.inputs as Record<string, InputMapping> }
            : {}),
          ...(args.outputs !== undefined
            ? { outputs: args.outputs as Record<string, OutputMapping> }
            : {}),
          ...(args.timeout_ms !== undefined
            ? { timeoutMs: args.timeout_ms as number }
            : {})
        };
        const result = updateOperation(meta, args.id as string, patch);
        meta = result.meta;
        if (!result.operation) {
          return { ok: false, error: `No operation with id ${args.id}` };
        }
        return { ok: true, operation: result.operation };
      }
    ),

    tool(
      "ui_app_remove_operation",
      "Remove an operation binding. Widgets still bound to it (op:<opId>/...) " +
        "stop resolving, so re-bind or remove them too.",
      z.object({
        workflow_id: workflowIdParam,
        id: z.string().describe("Operation id to remove.")
      }),
      async ({ workflow_id: _wf, id }) => {
        const result = removeOperation(meta, id as string);
        meta = result.meta;
        return { ok: result.removed, removed_id: result.removed ? id : null };
      }
    ),

    /* ------------------------------------------------------------- variables */

    tool(
      "ui_app_list_variables",
      "List the app's declared variables — the app state widgets read and write " +
        "and operation outputs can land in. Widgets bind to one as var:<id>.",
      z.object({ workflow_id: workflowIdParam }),
      async () => ({ ok: true, variables: meta.variables })
    ),

    tool(
      "ui_app_declare_variable",
      "Declare an app variable. Only user-scoped variables may persist — " +
        "`persist` is forced false on an instance-scoped one.",
      z.object({
        workflow_id: workflowIdParam,
        id: z
          .string()
          .optional()
          .describe("Variable id. Derived from the name when omitted."),
        name: z.string().optional().describe("Display name."),
        type: z
          .object({ type: z.string(), optional: z.boolean().optional() })
          .optional()
          .describe("Node-SDK type metadata, e.g. { type: 'str' }."),
        default: z.unknown().optional().describe("Initial value."),
        scope: variableScope.optional(),
        persist: z
          .boolean()
          .optional()
          .describe("Persist across sessions. User scope only.")
      }),
      async (args) => {
        const result = declareVariable(meta, {
          id: args.id as string | undefined,
          name: args.name as string | undefined,
          type: args.type as { type: string; optional?: boolean } | undefined,
          default: args.default,
          scope: args.scope as "instance" | "user" | undefined,
          persist: args.persist as boolean | undefined
        });
        meta = result.meta;
        return { ok: true, variable: result.variable };
      }
    ),

    tool(
      "ui_app_update_variable",
      "Change a declared variable. Narrowing the scope to 'instance' clears " +
        "`persist`, since only user-scoped variables may persist.",
      z.object({
        workflow_id: workflowIdParam,
        id: z.string().describe("Variable id to update."),
        name: z.string().optional(),
        type: z
          .object({ type: z.string(), optional: z.boolean().optional() })
          .nullable()
          .optional(),
        default: z.unknown().optional(),
        scope: variableScope.optional(),
        persist: z.boolean().optional()
      }),
      async (args) => {
        const patch: VariablePatch = {
          ...(args.name !== undefined ? { name: args.name as string } : {}),
          ...(args.type !== undefined
            ? { type: args.type as VariableDeclaration["type"] }
            : {}),
          ...(args.default !== undefined ? { default: args.default } : {}),
          ...(args.scope !== undefined
            ? { scope: args.scope as "instance" | "user" }
            : {}),
          ...(args.persist !== undefined
            ? { persist: args.persist as boolean }
            : {})
        };
        const result = updateVariable(meta, args.id as string, patch);
        meta = result.meta;
        if (!result.variable) {
          return { ok: false, error: `No variable with id ${args.id}` };
        }
        return { ok: true, variable: result.variable };
      }
    ),

    tool(
      "ui_app_remove_variable",
      "Remove a declared variable. Widgets bound to var:<id> stop resolving.",
      z.object({
        workflow_id: workflowIdParam,
        id: z.string().describe("Variable id to remove.")
      }),
      async ({ workflow_id: _wf, id }) => {
        const result = removeVariable(meta, id as string);
        meta = result.meta;
        return { ok: result.removed, removed_id: result.removed ? id : null };
      }
    ),

    /* ------------------------------------------------------------- resources */

    tool(
      "ui_app_list_resources",
      "List the app's resource bindings — the document collections its pickers " +
        "and resource actions may reach.",
      z.object({ workflow_id: workflowIdParam }),
      async () => ({ ok: true, resources: meta.resources })
    ),

    tool(
      "ui_app_add_resource",
      "Bind a resource collection to the app. Scope it to a project " +
        "(project_id, a collection a picker chooses from) or to one pinned " +
        "document (fixed_id); one of the two is required. `operations` is what the " +
        "app may do with it, defaulting to read-only.",
      z.object({
        workflow_id: workflowIdParam,
        id: z
          .string()
          .optional()
          .describe("Resource binding id. Derived from the name when omitted."),
        name: z.string().optional().describe("Display name."),
        kind: resourceKind,
        project_id: z
          .string()
          .optional()
          .describe("Project whose documents of this kind the app may reach."),
        fixed_id: z.string().optional().describe("Id of one pinned document."),
        operations: z
          .array(z.enum(["read", "create", "update", "delete"]))
          .optional()
          .describe("Allowed operations. Defaults to ['read'].")
      }),
      async (args) => {
        const result = addResource(meta, {
          id: args.id as string | undefined,
          name: args.name as string | undefined,
          kind: args.kind as ResourceKind,
          scope: {
            projectId: args.project_id as string | undefined,
            fixedId: args.fixed_id as string | undefined
          },
          operations: args.operations as ResourceOperation[] | undefined
        });
        meta = result.meta;
        return { ok: true, resource: result.resource };
      }
    ),

    tool(
      "ui_app_remove_resource",
      "Remove a resource binding. Pickers and resource actions pointing at it " +
        "stop resolving.",
      z.object({
        workflow_id: workflowIdParam,
        id: z.string().describe("Resource binding id to remove.")
      }),
      async ({ workflow_id: _wf, id }) => {
        const result = removeResource(meta, id as string);
        meta = result.meta;
        return { ok: result.removed, removed_id: result.removed ? id : null };
      }
    ),

    /* -------------------------------------------------------- binding targets */

    tool(
      "ui_app_get_binding_targets",
      "List everything a widget can bind to, with the exact token to store in " +
        "its `binding` prop: each operation's input and output nodes " +
        "(op:<opId>/in:<nodeId>, op:<opId>/out:<nodeId>), its execution fields " +
        "(op:<opId>/exec#running|progress|error|activity), and every variable " +
        "(var:<id>). " +
        "Call this before binding a widget instead of guessing a name. An " +
        "operation over a workflow this editor has not loaded reports " +
        "ioAvailable: false and no node lists.",
      z.object({ workflow_id: workflowIdParam }),
      async () => ({
        ok: true,
        ...bindingTargets(meta, hostWorkflowId, hostWorkflow)
      })
    )
  ];

  return {
    tools,
    finalState: (): AppBridgeFinalState => ({
      title,
      selectedId,
      components: flattenComponents(content),
      operations: meta.operations,
      variables: meta.variables,
      resources: meta.resources
    })
  };
}

/** Count widgets of a given type in the final document (at any depth). */
function countByType(state: AppBridgeFinalState, type: string): number {
  return state.components.filter((c) => c.type === type).length;
}

const APP_SYSTEM_PROMPT = `You are an assistant building a mini web app in the App Builder through UI tools.

The app is a tree of widgets bound to a workflow. Use the ui_app_* tools:
- Call ui_app_get_snapshot first to see the placed widgets, the page title, and the available widget types.
- Call ui_app_list_component_types to learn valid widget \`type\` values and their props.
- Add widgets with ui_app_add_component. To nest inside a Panel (Container) or Columns widget, pass parent_id and slot ('content', 'left', or 'right').
- Edit a widget's props with ui_app_update_component (its id cannot change); remove one with ui_app_remove_component.
- Set the page title with ui_app_set_title.

Widgets are wired to workflow runs through the document's operations, variables, and resources:
- ui_app_get_binding_targets lists every slot a widget can bind to and the exact token to put in its \`binding\` prop (op:<opId>/in:<nodeId>, op:<opId>/out:<nodeId>, op:<opId>/exec#running|progress|error|activity, var:<id>). Call it before binding instead of guessing.
- ui_app_list_operations / ui_app_add_operation / ui_app_update_operation / ui_app_remove_operation manage which workflows the app runs and how their inputs and outputs are mapped.
- ui_app_list_variables / ui_app_declare_variable / ui_app_update_variable / ui_app_remove_variable manage app state. Only user-scoped variables may persist.
- ui_app_list_resources / ui_app_add_resource / ui_app_remove_resource manage the document collections the app may reach.

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

// Note on `noErrorResults`: the tool-loop runner only counts a *thrown* tool
// error as an errored result — a returned `{ ok: false }` (e.g. update/remove
// on an unknown id) is not flagged. These cases therefore lean on the
// `finalState` predicates to catch a wrong-but-non-throwing tool call, and use
// `noErrorResults` only to catch genuine exceptions.
export const APP_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<AppBridgeFinalState>[] =
  [
    {
      id: "build-form",
      description:
        "Set the page title, then add a heading, a text input, and a run button",
      objective:
        "Build a simple app: set the page title to 'Ask the AI', add a Heading, add a TextInput for the prompt, and add a Button to run the workflow.",
      createBridge: () => createAppToolBridge(),
      systemPrompt: APP_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_app_add_component", "ui_app_set_title"],
        noErrorResults: true,
        minToolCalls: 4,
        maxToolCalls: 15,
        finalState: [
          {
            name: "titleIsAskTheAI",
            detail: "page title was not set to 'Ask the AI'",
            test: (s) => (s.title ?? "").trim().toLowerCase() === "ask the ai"
          },
          {
            name: "hasHeading",
            detail: "no Heading widget present",
            test: (s) => countByType(s, "Heading") >= 1
          },
          {
            name: "hasTextInput",
            detail: "no TextInput widget present",
            test: (s) => countByType(s, "TextInput") >= 1
          },
          {
            name: "hasButton",
            detail: "no Button widget present",
            test: (s) => countByType(s, "Button") >= 1
          }
        ]
      }
    },
    {
      id: "nest-in-panel",
      description: "Add a Text widget inside an existing Panel's content slot",
      objective:
        "The app has one empty Panel. Add a Text widget inside that Panel so it appears within the panel, not at the top level.",
      createBridge: () =>
        createAppToolBridge({
          components: [{ type: "Container", id: "panel-1", props: { title: "Details" } }]
        }),
      systemPrompt: APP_SYSTEM_PROMPT,
      userPrompt:
        "Objective: The app has one empty Panel (a Container widget with id 'panel-1'). Add a Text widget inside that Panel's content slot so it is nested within the panel, not at the top level.",
      expect: {
        requiredTools: ["ui_app_add_component"],
        noErrorResults: true,
        minToolCalls: 1,
        maxToolCalls: 10,
        finalState: [
          {
            name: "textNestedInPanel",
            detail: "no Text widget nested inside 'panel-1'",
            test: (s) =>
              s.components.some(
                (c) =>
                  c.type === "Text" &&
                  c.parentId === "panel-1" &&
                  c.slot === "content"
              )
          },
          {
            name: "noTopLevelText",
            detail: "a Text widget was added at the top level instead of nested",
            test: (s) =>
              !s.components.some(
                (c) => c.type === "Text" && c.parentId === null
              )
          }
        ]
      }
    },
    {
      id: "relabel-and-remove",
      description:
        "Relabel an existing Button and remove a leftover Text widget",
      objective:
        "The app has a Button and a leftover Text widget. Change the Button's label to 'Submit', and remove the Text widget.",
      createBridge: () =>
        createAppToolBridge({
          components: [
            { type: "Button", id: "btn-1", props: { label: "Run" } },
            { type: "Text", id: "text-1", props: { text: "delete me" } }
          ]
        }),
      systemPrompt: APP_SYSTEM_PROMPT,
      userPrompt:
        "Objective: The app has a Button (id 'btn-1') and a leftover Text widget (id 'text-1'). Change the Button's label to 'Submit', and remove the Text widget.",
      expect: {
        requiredTools: ["ui_app_update_component", "ui_app_remove_component"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 10,
        finalState: [
          {
            name: "buttonRelabeled",
            detail: "the Button's label is not 'Submit'",
            test: (s) =>
              s.components.some(
                (c) => c.id === "btn-1" && c.props.label === "Submit"
              )
          },
          {
            name: "textRemoved",
            detail: "the Text widget is still present",
            test: (s) => !s.components.some((c) => c.type === "Text")
          }
        ]
      }
    },
    {
      id: "bind-widgets-to-workflow",
      description:
        "Look up the binding targets and wire an input and a display widget to them",
      objective:
        "Bind the app's TextInput to the workflow's prompt input node and its Text widget to the answer output node, using the exact binding tokens the App Builder reports.",
      createBridge: () =>
        createAppToolBridge({
          workflowId: "wf-app",
          workflow: {
            inputs: [{ nodeId: "in-1", name: "prompt", label: "Prompt" }],
            outputs: [{ nodeId: "out-1", name: "answer", label: "Answer" }],
            variables: []
          },
          components: [
            { type: "TextInput", id: "input-1", props: { label: "Prompt" } },
            { type: "Text", id: "text-1" }
          ]
        }),
      systemPrompt: APP_SYSTEM_PROMPT,
      userPrompt:
        "Objective: App 'wf-app' has a TextInput (id 'input-1') and a Text widget (id 'text-1'), both unbound. " +
        "Bind the TextInput to the workflow's prompt input node and the Text widget to its answer output node. " +
        "Look the tokens up with ui_app_get_binding_targets — do not guess them.",
      expect: {
        requiredTools: [
          "ui_app_get_binding_targets",
          "ui_app_update_component"
        ],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "inputBoundToPromptNode",
            detail: "the TextInput is not bound to op:main/in:in-1",
            test: (s) =>
              s.components.some(
                (c) => c.id === "input-1" && c.props.binding === "op:main/in:in-1"
              )
          },
          {
            name: "textBoundToAnswerNode",
            detail: "the Text widget is not bound to op:main/out:out-1",
            test: (s) =>
              s.components.some(
                (c) => c.id === "text-1" && c.props.binding === "op:main/out:out-1"
              )
          }
        ]
      }
    },
    {
      id: "declare-and-bind-variable",
      description:
        "Declare a persisted user-scoped variable and bind a Switch to it",
      objective:
        "Declare a user-scoped variable that persists across sessions and bind the app's Switch widget to it.",
      createBridge: () =>
        createAppToolBridge({
          workflowId: "wf-app",
          components: [
            { type: "Switch", id: "switch-1", props: { label: "Dark mode" } }
          ]
        }),
      systemPrompt: APP_SYSTEM_PROMPT,
      userPrompt:
        "Objective: App 'wf-app' has a Switch widget (id 'switch-1') for a dark-mode preference. " +
        "Declare a variable with id 'dark_mode' that is scoped to the user and persists across sessions, " +
        "then bind the Switch to it.",
      expect: {
        requiredTools: ["ui_app_declare_variable", "ui_app_update_component"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "variableIsUserScopedAndPersisted",
            detail:
              "no 'dark_mode' variable with scope 'user' and persist true was declared",
            test: (s) =>
              s.variables.some(
                (v) =>
                  v.id === "dark_mode" && v.scope === "user" && v.persist === true
              )
          },
          {
            name: "switchBoundToVariable",
            detail: "the Switch is not bound to var:dark_mode",
            test: (s) =>
              s.components.some(
                (c) =>
                  c.id === "switch-1" && c.props.binding === "var:dark_mode"
              )
          }
        ]
      }
    }
  ];
