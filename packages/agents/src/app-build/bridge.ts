/**
 * Headless bridge for the App Builder (Puck) `ui_app_*` tool surface.
 *
 * Two callers share it: the `app-tools` eval suite
 * (`../evals/surfaces/app.ts`, which re-exports this module) and the app-build
 * Author stage, which drives the same tools with a real model to produce a
 * mini app. They cannot drift, because there is one implementation.
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
 * source of truth the browser tools also expose. Nor does it fork the widget
 * catalog: types, labels, fields, and slots come from `WIDGET_CATALOG`, the
 * same table the Puck config is checked against, so a model driving this bridge
 * sees every widget the editor offers.
 *
 * Two tools exist here that the browser has no counterpart for, both opt-in so
 * the eval surface stays exactly the frontend contract: `ui_app_finish`, which
 * lets an authoring model end its turn deliberately instead of trailing off,
 * and the `loadDocument`/`document` pair, which lets a repair round resume from
 * the document the previous round produced instead of an empty one.
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
  widgetFields,
  widgetSlots,
  WIDGET_CATALOG,
  type AppDocMeta,
  type BindableWorkflow,
  type BindingTargets,
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
import type { HeadlessTool } from "../evals/tool-loop-bridge.js";

/** The widget types the tools expose, with the fields each one accepts. */
const WIDGET_TYPES = Object.fromEntries(
  Object.entries(WIDGET_CATALOG).map(([type, descriptor]) => [
    type,
    { label: descriptor.label, fields: widgetFields(type) }
  ])
);

/** A placed widget: type plus props (props always carry an `id`). */
export interface ComponentNode {
  type: string;
  props: Record<string, unknown> & { id: string };
}

/**
 * The whole document the bridge holds — the Puck-shaped widget tree plus the
 * non-UI half. This is what round-trips through `document()` / `loadDocument`,
 * and what an `ApplicationBundle` is assembled from.
 */
export interface AppBridgeDocument {
  title: string | null;
  content: ComponentNode[];
  meta: AppDocMeta;
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
  /** The model called `ui_app_finish` (only reachable with `finishTool`). */
  finished: boolean;
  /** The summary it passed to `ui_app_finish`, when it called it. */
  finishSummary: string | null;
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
   * Id of the host workflow this editor has loaded — NOT the app's identity.
   * An operation pointing at it resolves against {@link workflow}; every other
   * operation resolves against {@link workflows}.
   */
  workflowId?: string;
  /** Bindable surface of that host workflow: its input/output nodes and channels. */
  workflow?: BindableWorkflow;
  /**
   * Every other workflow this editor has loaded, keyed by workflow id. An app
   * with one operation per workflow binds against all of them, so reporting
   * node targets for the host alone would leave every further operation with
   * no bindable surface.
   */
  workflows?: Readonly<Record<string, BindableWorkflow>>;
  /**
   * Offer `ui_app_finish` so the model can end the loop deliberately. Off by
   * default: the eval surface exposes the frontend contract and nothing else.
   */
  finishTool?: boolean;
}

/**
 * The bridge: the tool set, a final-state snapshot for structural predicates,
 * and the document round-trip the repair loop resumes through.
 */
export interface AppToolBridge {
  tools: HeadlessTool[];
  finalState: () => AppBridgeFinalState;
  /** The full document, for assembly into an `ApplicationBundle`. */
  document: () => AppBridgeDocument;
  /** Replace the document, e.g. to resume a repair round where the last ended. */
  loadDocument: (doc: AppBridgeDocument) => void;
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
  for (const slot of widgetSlots(node.type)) {
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

function tool<TResult>(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  impl: (args: Record<string, unknown>) => Promise<TResult>
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

const applicationIdParam = z
  .string()
  .describe(
    "Id of the application whose app document to operate on. The open app " +
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
 * A single app is modeled: every tool takes an `application_id` (mirroring the
 * real tools), which is accepted but not used to disambiguate — the bridge
 * holds one document. Passing an unknown id is not an error, matching how a
 * scored run only cares about the resulting document.
 */
export function createAppToolBridge(
  initial: AppBridgeInitialState = {}
): AppToolBridge {
  let content: ComponentNode[] = [];
  let title: string | null = initial.title ?? null;
  let selectedId: string | null = null;
  let meta: AppDocMeta = initial.meta ?? EMPTY_DOC_META;
  let finished = false;
  let finishSummary: string | null = null;
  const hostWorkflowId = initial.workflowId ?? "wf-app";
  const hostWorkflow = initial.workflow ?? EMPTY_WORKFLOW;
  const loadedWorkflows = new Map<string, BindableWorkflow>([
    [hostWorkflowId, hostWorkflow],
    ...Object.entries(initial.workflows ?? {})
  ]);

  /** Binding targets across every loaded workflow. */
  const allBindingTargets = (): BindingTargets =>
    bindingTargets(meta, hostWorkflowId, hostWorkflow, undefined, loadedWorkflows);
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
      "Read an open App Builder: every placed widget (id, type, props, " +
        "parent), the selected widget, the page title, and the available widget " +
        "types. Call this first to see what's on the page before editing.",
      z.object({ application_id: applicationIdParam }),
      async ({ application_id }) => ({
        ok: true,
        applicationId: application_id,
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
      z.object({ application_id: applicationIdParam }),
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
        "workflow tools. To nest inside a layout widget, pass parent_id and the " +
        "slot it holds children in: Panel and Accordion use 'content', Columns " +
        "'left' | 'right', Tabs 'tab1' | 'tab2' | 'tab3'.",
      z.object({
        application_id: applicationIdParam,
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
          .describe(
            "Id of a layout widget (Panel, Columns, Tabs, Accordion) in this app to nest inside."
          ),
        slot: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Slot of the parent: 'content' (Panel, Accordion), 'left' | 'right' " +
              "(Columns), or 'tab1' | 'tab2' | 'tab3' (Tabs). Defaults to the " +
              "parent's first slot."
          ),
        index: z
          .number()
          .int()
          .optional()
          .describe("Insertion index within the target list.")
      }),
      async ({ application_id: _app, type, props, parent_id, slot, index }) => {
        // The real tool/handler doesn't validate `type` — Puck inserts whatever
        // string it's given — so the bridge stays permissive too. An unknown
        // type just has no slots (widgetSlots defaults to []).
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
            const slots = widgetSlots(n.type);
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
        application_id: applicationIdParam,
        id: z
          .string()
          .describe(
            "Widget id from ui_app_get_snapshot — a component inside the app, not a workflow id."
          ),
        props: z.record(z.string(), z.unknown()).describe("Props to merge.")
      }),
      async ({ application_id: _app, id, props }) => {
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
        application_id: applicationIdParam,
        id: z
          .string()
          .describe("Widget id to remove — a component inside the app.")
      }),
      async ({ application_id: _app, id }) => {
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
        application_id: applicationIdParam,
        id: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Widget id to select — a component inside the app. Null or omitted clears the selection."
          )
      }),
      async ({ application_id: _app, id }) => {
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
        application_id: applicationIdParam,
        title: z.string()
      }),
      async ({ application_id: _app, title: next }) => {
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
      z.object({ application_id: applicationIdParam }),
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
        application_id: applicationIdParam,
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
        application_id: applicationIdParam,
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
        application_id: applicationIdParam,
        id: z.string().describe("Operation id to remove.")
      }),
      async ({ application_id: _app, id }) => {
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
      z.object({ application_id: applicationIdParam }),
      async () => ({ ok: true, variables: meta.variables })
    ),

    tool(
      "ui_app_declare_variable",
      "Declare an app variable. Only user-scoped variables may persist — " +
        "`persist` is forced false on an instance-scoped one.",
      z.object({
        application_id: applicationIdParam,
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
        application_id: applicationIdParam,
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
        application_id: applicationIdParam,
        id: z.string().describe("Variable id to remove.")
      }),
      async ({ application_id: _app, id }) => {
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
      z.object({ application_id: applicationIdParam }),
      async () => ({ ok: true, resources: meta.resources })
    ),

    tool(
      "ui_app_add_resource",
      "Bind a resource collection to the app. Scope it to a project " +
        "(project_id, a collection a picker chooses from) or to one pinned " +
        "document (fixed_id); one of the two is required. `operations` is what the " +
        "app may do with it, defaulting to read-only.",
      z.object({
        application_id: applicationIdParam,
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
        application_id: applicationIdParam,
        id: z.string().describe("Resource binding id to remove.")
      }),
      async ({ application_id: _app, id }) => {
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
      z.object({ application_id: applicationIdParam }),
      async () => ({ ok: true, ...allBindingTargets() })
    )
  ];

  if (initial.finishTool) {
    tools.push(
      tool(
        "ui_app_finish",
        "Call this when the app is complete: every widget the objective asks " +
          "for is placed, bound, and wired to an operation. Pass a one-line " +
          "summary of what you built. Do not call any tool after it.",
        z.object({
          application_id: applicationIdParam,
          summary: z.string().describe("One line describing the app you built.")
        }),
        async ({ summary }) => {
          finished = true;
          finishSummary = summary as string;
          return { ok: true };
        }
      )
    );
  }

  return {
    tools,
    finalState: (): AppBridgeFinalState => ({
      title,
      selectedId,
      components: flattenComponents(content),
      operations: meta.operations,
      variables: meta.variables,
      resources: meta.resources,
      finished,
      finishSummary
    }),
    document: (): AppBridgeDocument => ({ title, content, meta }),
    loadDocument: (doc: AppBridgeDocument) => {
      title = doc.title;
      content = doc.content;
      meta = doc.meta;
      // A resumed document owns ids the generator has never seen; register them
      // so a widget added this round cannot collide with one from the last.
      for (const summary of flattenComponents(content)) {
        usedIds.add(summary.id);
      }
      if (
        selectedId &&
        !flattenComponents(content).some((c) => c.id === selectedId)
      ) {
        selectedId = null;
      }
    }
  };
}
