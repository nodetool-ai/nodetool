/**
 * Headless bridge for the App Builder (Puck) tool-loop eval.
 *
 * The real frontend tools (`web/src/lib/tools/builtin/puck.ts`) delegate to a
 * `PuckAgentHandler` the live editor registers on `puckAgentBridge` — it drives
 * the Puck editor through usePuck's dispatch, so it can only run in the browser.
 * This bridge reimplements the *effects* of those tools against a plain
 * in-memory document tree (the same shape `puckDataOps.ts` walks: a top-level
 * `content` array plus slot-valued props on layout widgets), so a model can
 * drive the same `ui_app_*` tool surface headlessly.
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
 * The widget catalog, mirroring the Puck config's `components`. Only the
 * type/label/field-kind metadata the `ui_app_*` tools surface matters here —
 * render functions and default props are the browser's concern. Layout widgets
 * (Panel/Columns) carry `slot` fields; nesting a widget targets one of them.
 */
const WIDGET_TYPES: Record<string, WidgetTypeDef> = {
  // ── Display ──
  Heading: { label: "Heading", fields: { text: "text", level: "select", binding: "custom" } },
  Text: { label: "Text", fields: { text: "textarea", binding: "custom" } },
  Markdown: { label: "Markdown", fields: { text: "textarea", binding: "custom" } },
  Image: { label: "Image", fields: { binding: "custom", fit: "select", height: "number", placeholder: "text" } },
  Output: { label: "Output", fields: { binding: "custom", placeholder: "text" } },
  Progress: { label: "Progress", fields: { label: "text", binding: "custom" } },
  // ── Inputs ──
  WorkflowInput: { label: "Workflow Input", fields: { binding: "custom", events: "custom" } },
  TextInput: { label: "Text Input", fields: { binding: "custom", label: "text", placeholder: "text", multiline: "radio", events: "custom" } },
  NumberInput: { label: "Number Input", fields: { binding: "custom", label: "text", min: "number", max: "number", step: "number", events: "custom" } },
  Slider: { label: "Slider", fields: { binding: "custom", label: "text", min: "number", max: "number", step: "number", events: "custom" } },
  Switch: { label: "Switch", fields: { binding: "custom", label: "text", events: "custom" } },
  Select: { label: "Select", fields: { binding: "custom", label: "text", options: "custom", events: "custom" } },
  // ── Actions ──
  Button: { label: "Button", fields: { label: "text", variant: "select", color: "select", events: "custom" } },
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
}

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
  let idSeq = 0;

  const nextId = (type: string): string => `${type}-${++idSeq}`;

  const seed = (nodes: SeedComponent[]): ComponentNode[] =>
    nodes.map((n) => {
      const id = n.id ?? nextId(n.type);
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
        if (!WIDGET_TYPES[type as string]) {
          throw new Error(
            `Unknown widget type "${type}". Call ui_app_list_component_types for valid types.`
          );
        }
        const id = nextId(type as string);
        const node: ComponentNode = {
          type: type as string,
          props: { ...((props as Record<string, unknown>) ?? {}), id }
        };
        const parentId = (parent_id as string | null | undefined) ?? null;
        const at = index as number | undefined;

        if (!parentId) {
          content = insertInto(content, node, at);
        } else {
          const parent = flattenComponents(content).find(
            (c) => c.id === parentId
          );
          if (!parent) throw new Error(`No widget with id ${parentId}`);
          const slots = SLOT_FIELDS[parent.type] ?? [];
          if (slots.length === 0) {
            throw new Error(
              `Widget "${parentId}" (${parent.type}) has no slots to nest into.`
            );
          }
          const wanted = (slot as string | null | undefined) ?? null;
          const targetSlot =
            wanted && slots.includes(wanted) ? wanted : slots[0];
          content = mapTree(content, (n) => {
            if (n.props.id !== parentId) return n;
            const current = Array.isArray(n.props[targetSlot])
              ? (n.props[targetSlot] as ComponentNode[])
              : [];
            return {
              ...n,
              props: { ...n.props, [targetSlot]: insertInto(current, node, at) }
            };
          });
        }
        selectedId = id;
        const summary = flattenComponents(content).find((c) => c.id === id)!;
        return { ok: true, component: summary };
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
        return { ok: true, selectedId };
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
    )
  ];

  return {
    tools,
    finalState: (): AppBridgeFinalState => ({
      title,
      selectedId,
      components: flattenComponents(content)
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

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

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
    }
  ];
