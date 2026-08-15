/**
 * `ui_app_*` frontend tools: let the agent read and edit an open App Builder
 * (the Puck document) the same way it edits the workflow graph with `ui_*`
 * tools. Both tool sets are registered globally, so an agent in the builder's
 * chat can shape the app and the workflow it binds to in one conversation.
 *
 * An app is its own resource (an `applications` row), so every tool takes an
 * `application_id` naming which open app builder to act on. There is no
 * workflow-id fallback: the workflows an app runs are named by its operations
 * (`target_workflow_id`), which is a different thing from the app's identity.
 * The open ids are listed in the ui_context system prompt block;
 * `getPuckAgentHandler` throws a descriptive error listing them when the
 * requested application has no app builder open.
 */
import { z } from "zod";
import type { InputMapping, OutputMapping } from "@nodetool-ai/app-runtime";

import { FrontendToolRegistry } from "../frontendTools";
import type { PuckAgentHandler } from "../../../components/appbuilder/puck/puckAgentBridge";
import { getPuckAgentHandler } from "../../../components/appbuilder/puck/puckAgentBridge";
import { docUrl } from "./resourceLinks";
import { restFetch } from "../../rest-fetch";

const applicationIdParam = z
  .string()
  .describe(
    "Id of the application whose app document to operate on. The open app " +
      "builders are listed in the ui_context block."
  );

FrontendToolRegistry.register({
  name: "ui_app_get_snapshot",
  description:
    "Read an open App Builder: every placed widget (id, type, props, " +
    "parent), the selected widget, the page title, and the available widget " +
    "types. Call this first to see what's on the page before editing.",
  parameters: z.object({ application_id: applicationIdParam }),
  async execute({ application_id }) {
    return { ok: true, ...getPuckAgentHandler(application_id).getSnapshot() };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_list_component_types",
  description:
    "List the widget types the App Builder supports and their fields (props). " +
    "Use this to learn valid `type` values and which props each widget accepts " +
    "(e.g. label, binding, events).",
  parameters: z.object({ application_id: applicationIdParam }),
  async execute({ application_id }) {
    return {
      ok: true,
      types: getPuckAgentHandler(application_id).listComponentTypes()
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_add_component",
  description:
    "Add a widget to the app. Bindings reference workflow nodes that must " +
    "already exist: input widgets bind to Input nodes (props.binding = input " +
    "name) or directly to any node property (props.binding = " +
    "'node:<nodeId>#<property>'), display widgets to Output nodes or " +
    "Variables, and other state to Variables. Add those nodes first with the " +
    "workflow tools. To nest inside a layout widget, pass parent_id and the " +
    "slot it holds children in: Panel and Accordion use 'content', Columns " +
    "'left' | 'right', Tabs 'tab1' | 'tab2' | 'tab3'. " +
    "Returns the new widget's `id` — pass it as the next add's parent_id, or " +
    "to ui_app_update_component, without re-reading the snapshot.",
  parameters: z.object({
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
  async execute({ application_id, type, props, parent_id, slot, index }) {
    const component = getPuckAgentHandler(application_id).addComponent({
      type,
      props: props as Record<string, unknown> | undefined,
      parentId: parent_id ?? null,
      slot: slot ?? null,
      index
    });
    // The id is the whole point of the call: the next add nests under it and
    // ui_app_update_component addresses it. An editor that reports none is a
    // failure, not a success with a null payload — one agent read a batch of
    // those as "8 tool calls succeeded" and moved on.
    if (typeof component?.id !== "string" || component.id === "") {
      throw new Error(
        `Added a ${type} widget but the app builder reported no widget id. ` +
          "Call ui_app_get_snapshot to see what is on the page."
      );
    }
    return {
      ok: true,
      id: component.id,
      type: component.type,
      parent_id: component.parentId ?? null,
      slot: component.slot ?? null,
      component,
      url: docUrl("app", application_id)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_update_component",
  description:
    "Merge props into an existing widget (e.g. set its binding, label, or " +
    "events). The widget's id cannot be changed.",
  parameters: z.object({
    application_id: applicationIdParam,
    id: z
      .string()
      .describe(
        "Widget id from ui_app_get_snapshot — a component inside the app, not a workflow id."
      ),
    props: z.record(z.string(), z.unknown()).describe("Props to merge.")
  }),
  async execute({ application_id, id, props }) {
    const component = getPuckAgentHandler(application_id).updateComponent(
      id,
      props as Record<string, unknown>
    );
    if (!component) {
      return { ok: false, error: `No widget with id ${id}` };
    }
    return { ok: true, component, url: docUrl("app", application_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_remove_component",
  description: "Remove a widget (and anything nested inside it) from the app.",
  parameters: z.object({
    application_id: applicationIdParam,
    id: z
      .string()
      .describe("Widget id to remove — a component inside the app.")
  }),
  async execute({ application_id, id }) {
    const removed = getPuckAgentHandler(application_id).removeComponent(id);
    return {
      ok: removed,
      removed_id: removed ? id : null,
      url: docUrl("app", application_id)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_select_component",
  description:
    "Select a widget so its properties show in the inspector (or pass null to " +
    "clear the selection).",
  parameters: z.object({
    application_id: applicationIdParam,
    id: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Widget id to select — a component inside the app. Null or omitted clears the selection."
      )
  }),
  async execute({ application_id, id }) {
    getPuckAgentHandler(application_id).selectComponent(id ?? null);
    return { ok: true };
  }
});

/* ---------------------------------------------------------------- operations */

const INPUT_MAPPING_FORMS =
  '{"from":"widget"} | {"from":"variable","variableId":"tone"} | ' +
  '{"from":"constant","value":"en"} | ' +
  '{"from":"resource","resourceBindingId":"shots"}';

const OUTPUT_MAPPING_FORMS =
  '{"to":"display"} | {"to":"variable","variableId":"draft"}';

/**
 * The strict mapping shapes, plus a loose branch that only exists so this file
 * — not a raw ZodError — reports a wrong `from`/`to`. One agent got
 * "Invalid discriminator value" and no list of what was valid.
 */
const looseMapping = z.looseObject({});

const inputMapping = z
  .union([
    z.discriminatedUnion("from", [
      z.object({ from: z.literal("widget") }),
      z.object({ from: z.literal("variable"), variableId: z.string() }),
      z.object({ from: z.literal("constant"), value: z.unknown() }),
      z.object({ from: z.literal("resource"), resourceBindingId: z.string() })
    ]),
    looseMapping
  ])
  .describe(
    "Where this input takes its value: the bound widget, a variable, a " +
      `constant, or the selected resource. One of: ${INPUT_MAPPING_FORMS}`
  );

const outputMapping = z
  .union([
    z.discriminatedUnion("to", [
      z.object({ to: z.literal("display") }),
      z.object({ to: z.literal("variable"), variableId: z.string() })
    ]),
    looseMapping
  ])
  .describe(
    "Where this output lands: a display widget, or a variable. One of: " +
      OUTPUT_MAPPING_FORMS
  );

function describeValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function parseInputMappings(
  raw: Record<string, unknown> | undefined
): Record<string, InputMapping> | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const out: Record<string, InputMapping> = {};
  for (const [nodeId, value] of Object.entries(raw)) {
    const where = `inputs["${nodeId}"]`;
    const mapping = value as { from?: unknown; variableId?: unknown; resourceBindingId?: unknown };
    const from = mapping?.from;
    if (from === "widget") {
      out[nodeId] = { from: "widget" };
    } else if (from === "variable") {
      if (typeof mapping.variableId !== "string") {
        throw new Error(
          `${where}: {"from":"variable"} needs "variableId" (an id from ui_app_list_variables).`
        );
      }
      out[nodeId] = { from: "variable", variableId: mapping.variableId };
    } else if (from === "constant") {
      out[nodeId] = {
        from: "constant",
        value: (mapping as { value?: unknown }).value
      };
    } else if (from === "resource") {
      if (typeof mapping.resourceBindingId !== "string") {
        throw new Error(
          `${where}: {"from":"resource"} needs "resourceBindingId" (an id from ui_app_list_resources).`
        );
      }
      out[nodeId] = {
        from: "resource",
        resourceBindingId: mapping.resourceBindingId
      };
    } else {
      throw new Error(
        `${where}: ${describeValue(value)} is not an input mapping — "from" ` +
          `must be "widget", "variable", "constant" or "resource". ` +
          `Forms: ${INPUT_MAPPING_FORMS}`
      );
    }
  }
  return out;
}

function parseOutputMappings(
  raw: Record<string, unknown> | undefined
): Record<string, OutputMapping> | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const out: Record<string, OutputMapping> = {};
  for (const [nodeId, value] of Object.entries(raw)) {
    const where = `outputs["${nodeId}"]`;
    const mapping = value as { to?: unknown; variableId?: unknown };
    if (mapping?.to === "display") {
      out[nodeId] = { to: "display" };
    } else if (mapping?.to === "variable") {
      if (typeof mapping.variableId !== "string") {
        throw new Error(
          `${where}: {"to":"variable"} needs "variableId" (an id from ui_app_list_variables).`
        );
      }
      out[nodeId] = { to: "variable", variableId: mapping.variableId };
    } else {
      throw new Error(
        `${where}: ${describeValue(value)} is not an output mapping — "to" ` +
          `must be "display" or "variable". Forms: ${OUTPUT_MAPPING_FORMS}`
      );
    }
  }
  return out;
}

const operationPolicy = z
  .enum(["parallel", "replace", "queue"])
  .describe(
    "How a second invocation behaves while one runs: run side by side, cancel the previous one, or queue behind it."
  );

FrontendToolRegistry.register({
  name: "ui_app_list_operations",
  description:
    "List the app's operation bindings: each one names a workflow the app can " +
    "run, with its input and output mappings and its concurrency policy. " +
    "Widget bindings address an operation by id (op:<opId>/in:<nodeId>).",
  parameters: z.object({ application_id: applicationIdParam }),
  async execute({ application_id }) {
    return {
      ok: true,
      operations: getPuckAgentHandler(application_id).listOperations()
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_add_operation",
  description:
    "Bind a workflow to the app as a named operation. The same workflow may be " +
    "bound twice with different mappings. `inputs` keys on input node IDs and " +
    "`outputs` on output node IDs (not names) — get them from " +
    "ui_app_get_binding_targets. An input with no mapping takes its bound " +
    "widget's value; an output with no mapping displays.",
  parameters: z.object({
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
      .describe(
        "Input node id → mapping, e.g. " +
          '{"node-1":{"from":"variable","variableId":"tone"}}.'
      ),
    outputs: z
      .record(z.string(), outputMapping)
      .optional()
      .describe(
        "Output node id → mapping, e.g. " +
          '{"node-9":{"to":"variable","variableId":"draft"}}.'
      ),
    timeout_ms: z.number().int().optional()
  }),
  async execute({
    application_id,
    id,
    name,
    target_workflow_id,
    workflow_version,
    policy,
    inputs,
    outputs,
    timeout_ms
  }) {
    const operation = getPuckAgentHandler(application_id).addOperation({
      id,
      name,
      workflowId: target_workflow_id,
      workflowVersion: workflow_version,
      policy,
      inputs: parseInputMappings(inputs),
      outputs: parseOutputMappings(outputs),
      timeoutMs: timeout_ms
    });
    return { ok: true, operation, url: docUrl("app", application_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_update_operation",
  description:
    "Change an operation binding. Input and output mappings merge per node id, " +
    "so one input can be remapped without restating the others.",
  parameters: z.object({
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
        "Input node id → mapping, merged into the existing mappings. E.g. " +
          '{"node-1":{"from":"variable","variableId":"tone"}}.'
      ),
    outputs: z
      .record(z.string(), outputMapping)
      .optional()
      .describe(
        "Output node id → mapping, merged into the existing mappings. E.g. " +
          '{"node-9":{"to":"variable","variableId":"draft"}}.'
      ),
    timeout_ms: z.number().int().optional()
  }),
  async execute({
    application_id,
    id,
    name,
    target_workflow_id,
    workflow_version,
    policy,
    inputs,
    outputs,
    timeout_ms
  }) {
    const operation = getPuckAgentHandler(application_id).updateOperation(id, {
      ...(name !== undefined ? { name } : {}),
      ...(target_workflow_id !== undefined
        ? { workflowId: target_workflow_id }
        : {}),
      ...(workflow_version !== undefined
        ? { workflowVersion: workflow_version }
        : {}),
      ...(policy !== undefined ? { policy } : {}),
      ...(inputs !== undefined ? { inputs: parseInputMappings(inputs) } : {}),
      ...(outputs !== undefined
        ? { outputs: parseOutputMappings(outputs) }
        : {}),
      ...(timeout_ms !== undefined ? { timeoutMs: timeout_ms } : {})
    });
    if (!operation) {
      return { ok: false, error: `No operation with id ${id}` };
    }
    return { ok: true, operation, url: docUrl("app", application_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_remove_operation",
  description:
    "Remove an operation binding. Widgets still bound to it (op:<opId>/...) " +
    "stop resolving, so re-bind or remove them too.",
  parameters: z.object({
    application_id: applicationIdParam,
    id: z.string().describe("Operation id to remove.")
  }),
  async execute({ application_id, id }) {
    const removed = getPuckAgentHandler(application_id).removeOperation(id);
    return {
      ok: removed,
      removed_id: removed ? id : null,
      url: docUrl("app", application_id)
    };
  }
});

/* ----------------------------------------------------------------- variables */

const variableScope = z
  .enum(["instance", "user"])
  .describe(
    "'instance' lives as long as the open app; 'user' is per user and may persist."
  );

FrontendToolRegistry.register({
  name: "ui_app_list_variables",
  description:
    "List the app's declared variables — the app state widgets read and write " +
    "and operation outputs can land in. Widgets bind to one as var:<id>.",
  parameters: z.object({ application_id: applicationIdParam }),
  async execute({ application_id }) {
    return {
      ok: true,
      variables: getPuckAgentHandler(application_id).listVariables()
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_declare_variable",
  description:
    "Declare an app variable. Only user-scoped variables may persist — " +
    "`persist` is forced false on an instance-scoped one.",
  parameters: z.object({
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
  async execute({ application_id, id, name, type, default: def, scope, persist }) {
    const variable = getPuckAgentHandler(application_id).declareVariable({
      id,
      name,
      type,
      default: def,
      scope,
      persist
    });
    return { ok: true, variable, url: docUrl("app", application_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_update_variable",
  description:
    "Change a declared variable. Narrowing the scope to 'instance' clears " +
    "`persist`, since only user-scoped variables may persist.",
  parameters: z.object({
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
  async execute({ application_id, id, name, type, default: def, scope, persist }) {
    const variable = getPuckAgentHandler(application_id).updateVariable(id, {
      ...(name !== undefined ? { name } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(def !== undefined ? { default: def } : {}),
      ...(scope !== undefined ? { scope } : {}),
      ...(persist !== undefined ? { persist } : {})
    });
    if (!variable) {
      return { ok: false, error: `No variable with id ${id}` };
    }
    return { ok: true, variable, url: docUrl("app", application_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_remove_variable",
  description:
    "Remove a declared variable. Widgets bound to var:<id> stop resolving.",
  parameters: z.object({
    application_id: applicationIdParam,
    id: z.string().describe("Variable id to remove.")
  }),
  async execute({ application_id, id }) {
    const removed = getPuckAgentHandler(application_id).removeVariable(id);
    return {
      ok: removed,
      removed_id: removed ? id : null,
      url: docUrl("app", application_id)
    };
  }
});

/* ----------------------------------------------------------------- resources */

const resourceKind = z
  .enum(["asset", "timeline", "storyboard", "sketch"])
  .describe("Kind of document the binding addresses.");

FrontendToolRegistry.register({
  name: "ui_app_list_resources",
  description:
    "List the app's resource bindings — the document collections its pickers " +
    "and resource actions may reach.",
  parameters: z.object({ application_id: applicationIdParam }),
  async execute({ application_id }) {
    return {
      ok: true,
      resources: getPuckAgentHandler(application_id).listResources()
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_add_resource",
  description:
    "Bind a resource collection to the app. Scope it to a project " +
    "(project_id, a collection a picker chooses from) or to one pinned " +
    "document (fixed_id); one of the two is required. `operations` is what the " +
    "app may do with it, defaulting to read-only.",
  parameters: z.object({
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
  async execute({
    application_id,
    id,
    name,
    kind,
    project_id,
    fixed_id,
    operations
  }) {
    const resource = getPuckAgentHandler(application_id).addResource({
      id,
      name,
      kind,
      scope: { projectId: project_id, fixedId: fixed_id },
      operations
    });
    return { ok: true, resource, url: docUrl("app", application_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_remove_resource",
  description:
    "Remove a resource binding. Pickers and resource actions pointing at it " +
    "stop resolving.",
  parameters: z.object({
    application_id: applicationIdParam,
    id: z.string().describe("Resource binding id to remove.")
  }),
  async execute({ application_id, id }) {
    const removed = getPuckAgentHandler(application_id).removeResource(id);
    return {
      ok: removed,
      removed_id: removed ? id : null,
      url: docUrl("app", application_id)
    };
  }
});

/* ----------------------------------------------------------- binding targets */

FrontendToolRegistry.register({
  name: "ui_app_get_binding_targets",
  description:
    "List everything a widget can bind to, with the exact token to store in " +
    "its `binding` prop: each operation's input and output nodes " +
    "(op:<opId>/in:<nodeId>, op:<opId>/out:<nodeId>), its execution fields " +
    "(op:<opId>/exec#running|progress|error|activity), and every variable " +
    "(var:<id>). " +
    "Call this before binding a widget instead of guessing a name. An " +
    "operation over a workflow this editor has not loaded reports " +
    "ioAvailable: false and no node lists.",
  parameters: z.object({ application_id: applicationIdParam }),
  async execute({ application_id }) {
    return {
      ok: true,
      ...getPuckAgentHandler(application_id).getBindingTargets()
    };
  }
});

/* ---------------------------------------------------------------- verifying */

const WIDGET_REF =
  "Widget id, unique widget type, or unique widget label — from ui_app_get_snapshot.";

const INTERACTION_FORMS =
  '{"set":{"key":"<binding>","value":<any>,"operationId":"<opId>"}} | ' +
  '{"click":"<widget>"} | {"change":"<widget>","value":<any>} | ' +
  '{"run":"<opId>"} | {"cancel":"<opId>"} | ' +
  '{"seedResource":{"id":"<resource binding id>","items":[{"id":"a"}]}}';

/**
 * The six step forms, plus a loose branch so a mis-shaped step is reported by
 * this file with the whole list. An agent guessed the shape twice in a row
 * from the server's "no widget matches undefined".
 */
const interactionStep = z
  .union([
    z.object({
      set: z.object({
        key: z
          .string()
          .describe("Binding key, e.g. 'op:main/in:node-1' or 'var:tone'."),
        value: z.unknown(),
        operationId: z
          .string()
          .optional()
          .describe("Operation the key belongs to. Defaults to the first one.")
      })
    }),
    z.object({ click: z.string().describe(WIDGET_REF) }),
    z.object({ change: z.string().describe(WIDGET_REF), value: z.unknown() }),
    z.object({ run: z.string().describe("Operation id to run.") }),
    z.object({
      cancel: z.string().describe("Operation id whose runs to cancel.")
    }),
    z.object({
      seedResource: z.object({
        id: z.string().describe("Resource binding id."),
        items: z.array(z.record(z.string(), z.unknown()))
      })
    }),
    z.record(z.string(), z.unknown())
  ])
  .describe(`One interaction step. One of: ${INTERACTION_FORMS}`);

type InteractionStepInput = z.output<typeof interactionStep>;

/** How a step's widget reference resolves in the harness: id, type, or label. */
function widgetTargets(
  handler: PuckAgentHandler
): Array<{ id: string; type: string; label: string | null }> {
  return handler.getSnapshot().components.map((component) => ({
    id: component.id,
    type: component.type,
    label:
      typeof component.props?.label === "string" ? component.props.label : null
  }));
}

function assertWidgetRef(
  ref: string,
  stepNumber: number,
  handler: PuckAgentHandler
): void {
  const targets = widgetTargets(handler);
  const matches = targets.some(
    (target) =>
      target.id === ref || target.type === ref || target.label === ref
  );
  if (matches) {
    return;
  }
  const listed = targets
    .map(
      (target) =>
        `${target.id} (${target.type}${
          target.label === null ? "" : `, label "${target.label}"`
        })`
    )
    .join("; ");
  throw new Error(
    `Interaction step ${stepNumber}: no widget matches "${ref}" (tried id, ` +
      `type, and label). ` +
      (listed === ""
        ? "This app has no widgets yet — add one with ui_app_add_component."
        : `Widgets in this app: ${listed}.`)
  );
}

/**
 * Check every step before the round trip, so a bad script names its own fix
 * instead of coming back from the server as `change undefined`.
 */
function checkInteractions(
  steps: InteractionStepInput[],
  handler: PuckAgentHandler
): InteractionStepInput[] {
  steps.forEach((step, index) => {
    const stepNumber = index + 1;
    const record = step as Record<string, unknown>;
    if (typeof record.click === "string") {
      assertWidgetRef(record.click, stepNumber, handler);
      return;
    }
    if (typeof record.change === "string") {
      assertWidgetRef(record.change, stepNumber, handler);
      return;
    }
    if (typeof record.run === "string" || typeof record.cancel === "string") {
      return;
    }
    const set = record.set as { key?: unknown } | undefined;
    if (set !== undefined && typeof set?.key === "string") {
      return;
    }
    const seed = record.seedResource as
      | { id?: unknown; items?: unknown }
      | undefined;
    if (
      seed !== undefined &&
      typeof seed?.id === "string" &&
      Array.isArray(seed.items)
    ) {
      return;
    }
    throw new Error(
      `Interaction step ${stepNumber} is not a valid step (keys: ` +
        `${Object.keys(record).join(", ") || "none"}). Valid steps: ` +
        INTERACTION_FORMS
    );
  });
  return steps;
}

FrontendToolRegistry.register({
  name: "ui_app_debug",
  description:
    "Verify the app you are editing, including unsaved edits: the current " +
    "draft is sent to the server, which checks every binding against the " +
    "workflows the operations name and reports a verdict (issues, warnings), " +
    "each widget's end state (binding, hasValue, visible, disabled, display), " +
    "invocation outcomes, and what was not simulated. " +
    "With run: false (the default) it is a static wiring check — free and " +
    "instant; call it after any binding, operation, or variable change and fix " +
    "what it names. With run: true it executes the app's workflows for real, " +
    "which costs money and takes time: do that once, before you tell the user " +
    "the app is done, and read the verdict. " +
    "Omit `interact` to click the app's natural run trigger, or script the " +
    `flow with steps: ${INTERACTION_FORMS}. A widget is named by its id, its ` +
    "type when only one widget has it, or its label when only one widget has " +
    "it.",
  parameters: z.object({
    application_id: applicationIdParam,
    run: z
      .boolean()
      .optional()
      .describe(
        "Execute the app's workflows (costs money). Defaults to false: wiring check only."
      ),
    params: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Initial values by binding key, applied before the interactions run."
      ),
    interact: z
      .array(interactionStep)
      .optional()
      .describe(
        "Interaction steps to replay, in order. Omit to use the app's " +
          `natural run trigger. Each step is one of: ${INTERACTION_FORMS}`
      ),
    timeout_ms: z
      .number()
      .int()
      .optional()
      .describe("Per-run timeout in milliseconds.")
  }),
  async execute({ application_id, run, params, interact, timeout_ms }) {
    const handler = getPuckAgentHandler(application_id);
    const steps =
      interact === undefined ? undefined : checkInteractions(interact, handler);
    const document = handler.document();
    const response = await restFetch("/api/applications/debug", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        document,
        params,
        interact: steps,
        run,
        timeout_ms
      })
    });
    const report: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        report && typeof report === "object" && "detail" in report
          ? String((report as { detail: unknown }).detail)
          : `App debug failed (${response.status})`;
      return { ok: false, error: detail };
    }
    return { ok: true, application_id, ...(report as object | null) };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_set_title",
  description: "Set the app's page title (shown at the top of the app).",
  parameters: z.object({
    application_id: applicationIdParam,
    title: z.string()
  }),
  async execute({ application_id, title }) {
    getPuckAgentHandler(application_id).setRootProps({ title });
    return { ok: true, title, url: docUrl("app", application_id) };
  }
});
