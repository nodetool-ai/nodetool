/**
 * `ui_app_*` frontend tools: let the agent read and edit an open App Builder
 * (the Puck document) the same way it edits the workflow graph with `ui_*`
 * tools. Both tool sets are registered globally, so an agent in the builder's
 * chat can shape the app and the workflow it binds to in one conversation.
 *
 * An app document lives on its workflow's `app_doc` field, so every tool takes
 * a `workflow_id` naming which open app builder to act on — the same id the
 * graph tools use. The open ids are listed in the ui_context system prompt
 * block; `getPuckAgentHandler` throws a descriptive error listing them when the
 * requested workflow has no app builder open.
 */
import { z } from "zod";

import { FrontendToolRegistry } from "../frontendTools";
import { getPuckAgentHandler } from "../../../components/appbuilder/puck/puckAgentBridge";

const workflowIdParam = z
  .string()
  .describe(
    "Id of the workflow whose app document to operate on. The open app " +
      "builders are listed in the ui_context block."
  );

FrontendToolRegistry.register({
  name: "ui_app_get_snapshot",
  description:
    "Read a workflow's open App Builder: every placed widget (id, type, props, " +
    "parent), the selected widget, the page title, and the available widget " +
    "types. Call this first to see what's on the page before editing.",
  parameters: z.object({ workflow_id: workflowIdParam }),
  async execute({ workflow_id }) {
    return { ok: true, ...getPuckAgentHandler(workflow_id).getSnapshot() };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_list_component_types",
  description:
    "List the widget types the App Builder supports and their fields (props). " +
    "Use this to learn valid `type` values and which props each widget accepts " +
    "(e.g. label, binding, events).",
  parameters: z.object({ workflow_id: workflowIdParam }),
  async execute({ workflow_id }) {
    return {
      ok: true,
      types: getPuckAgentHandler(workflow_id).listComponentTypes()
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
    "workflow tools. To nest inside a Panel or Columns widget, pass parent_id " +
    "(and slot: 'content' | 'left' | 'right').",
  parameters: z.object({
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
  async execute({ workflow_id, type, props, parent_id, slot, index }) {
    const component = getPuckAgentHandler(workflow_id).addComponent({
      type,
      props: props as Record<string, unknown> | undefined,
      parentId: parent_id ?? null,
      slot: slot ?? null,
      index
    });
    return { ok: true, component };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_update_component",
  description:
    "Merge props into an existing widget (e.g. set its binding, label, or " +
    "events). The widget's id cannot be changed.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    id: z
      .string()
      .describe(
        "Widget id from ui_app_get_snapshot — a component inside the app, not a workflow id."
      ),
    props: z.record(z.string(), z.unknown()).describe("Props to merge.")
  }),
  async execute({ workflow_id, id, props }) {
    const component = getPuckAgentHandler(workflow_id).updateComponent(
      id,
      props as Record<string, unknown>
    );
    if (!component) {
      return { ok: false, error: `No widget with id ${id}` };
    }
    return { ok: true, component };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_remove_component",
  description: "Remove a widget (and anything nested inside it) from the app.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    id: z
      .string()
      .describe("Widget id to remove — a component inside the app.")
  }),
  async execute({ workflow_id, id }) {
    const removed = getPuckAgentHandler(workflow_id).removeComponent(id);
    return { ok: removed, removed_id: removed ? id : null };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_select_component",
  description:
    "Select a widget so its properties show in the inspector (or pass null to " +
    "clear the selection).",
  parameters: z.object({
    workflow_id: workflowIdParam,
    id: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Widget id to select — a component inside the app. Null or omitted clears the selection."
      )
  }),
  async execute({ workflow_id, id }) {
    getPuckAgentHandler(workflow_id).selectComponent(id ?? null);
    return { ok: true };
  }
});

/* ---------------------------------------------------------------- operations */

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

FrontendToolRegistry.register({
  name: "ui_app_list_operations",
  description:
    "List the app's operation bindings: each one names a workflow the app can " +
    "run, with its input and output mappings and its concurrency policy. " +
    "Widget bindings address an operation by id (op:<opId>/in:<nodeId>).",
  parameters: z.object({ workflow_id: workflowIdParam }),
  async execute({ workflow_id }) {
    return {
      ok: true,
      operations: getPuckAgentHandler(workflow_id).listOperations()
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
  async execute({
    workflow_id,
    id,
    name,
    target_workflow_id,
    workflow_version,
    policy,
    inputs,
    outputs,
    timeout_ms
  }) {
    const operation = getPuckAgentHandler(workflow_id).addOperation({
      id,
      name,
      workflowId: target_workflow_id,
      workflowVersion: workflow_version,
      policy,
      inputs,
      outputs,
      timeoutMs: timeout_ms
    });
    return { ok: true, operation };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_update_operation",
  description:
    "Change an operation binding. Input and output mappings merge per node id, " +
    "so one input can be remapped without restating the others.",
  parameters: z.object({
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
      .describe("Input node id → mapping. Merged into the existing mappings."),
    outputs: z
      .record(z.string(), outputMapping)
      .optional()
      .describe("Output node id → mapping. Merged into the existing mappings."),
    timeout_ms: z.number().int().optional()
  }),
  async execute({
    workflow_id,
    id,
    name,
    target_workflow_id,
    workflow_version,
    policy,
    inputs,
    outputs,
    timeout_ms
  }) {
    const operation = getPuckAgentHandler(workflow_id).updateOperation(id, {
      ...(name !== undefined ? { name } : {}),
      ...(target_workflow_id !== undefined
        ? { workflowId: target_workflow_id }
        : {}),
      ...(workflow_version !== undefined
        ? { workflowVersion: workflow_version }
        : {}),
      ...(policy !== undefined ? { policy } : {}),
      ...(inputs !== undefined ? { inputs } : {}),
      ...(outputs !== undefined ? { outputs } : {}),
      ...(timeout_ms !== undefined ? { timeoutMs: timeout_ms } : {})
    });
    if (!operation) {
      return { ok: false, error: `No operation with id ${id}` };
    }
    return { ok: true, operation };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_remove_operation",
  description:
    "Remove an operation binding. Widgets still bound to it (op:<opId>/...) " +
    "stop resolving, so re-bind or remove them too.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    id: z.string().describe("Operation id to remove.")
  }),
  async execute({ workflow_id, id }) {
    const removed = getPuckAgentHandler(workflow_id).removeOperation(id);
    return { ok: removed, removed_id: removed ? id : null };
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
  parameters: z.object({ workflow_id: workflowIdParam }),
  async execute({ workflow_id }) {
    return {
      ok: true,
      variables: getPuckAgentHandler(workflow_id).listVariables()
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_declare_variable",
  description:
    "Declare an app variable. Only user-scoped variables may persist — " +
    "`persist` is forced false on an instance-scoped one.",
  parameters: z.object({
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
  async execute({ workflow_id, id, name, type, default: def, scope, persist }) {
    const variable = getPuckAgentHandler(workflow_id).declareVariable({
      id,
      name,
      type,
      default: def,
      scope,
      persist
    });
    return { ok: true, variable };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_update_variable",
  description:
    "Change a declared variable. Narrowing the scope to 'instance' clears " +
    "`persist`, since only user-scoped variables may persist.",
  parameters: z.object({
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
  async execute({ workflow_id, id, name, type, default: def, scope, persist }) {
    const variable = getPuckAgentHandler(workflow_id).updateVariable(id, {
      ...(name !== undefined ? { name } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(def !== undefined ? { default: def } : {}),
      ...(scope !== undefined ? { scope } : {}),
      ...(persist !== undefined ? { persist } : {})
    });
    if (!variable) {
      return { ok: false, error: `No variable with id ${id}` };
    }
    return { ok: true, variable };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_remove_variable",
  description:
    "Remove a declared variable. Widgets bound to var:<id> stop resolving.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    id: z.string().describe("Variable id to remove.")
  }),
  async execute({ workflow_id, id }) {
    const removed = getPuckAgentHandler(workflow_id).removeVariable(id);
    return { ok: removed, removed_id: removed ? id : null };
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
  parameters: z.object({ workflow_id: workflowIdParam }),
  async execute({ workflow_id }) {
    return {
      ok: true,
      resources: getPuckAgentHandler(workflow_id).listResources()
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
  async execute({
    workflow_id,
    id,
    name,
    kind,
    project_id,
    fixed_id,
    operations
  }) {
    const resource = getPuckAgentHandler(workflow_id).addResource({
      id,
      name,
      kind,
      scope: { projectId: project_id, fixedId: fixed_id },
      operations
    });
    return { ok: true, resource };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_remove_resource",
  description:
    "Remove a resource binding. Pickers and resource actions pointing at it " +
    "stop resolving.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    id: z.string().describe("Resource binding id to remove.")
  }),
  async execute({ workflow_id, id }) {
    const removed = getPuckAgentHandler(workflow_id).removeResource(id);
    return { ok: removed, removed_id: removed ? id : null };
  }
});

/* ----------------------------------------------------------- binding targets */

FrontendToolRegistry.register({
  name: "ui_app_get_binding_targets",
  description:
    "List everything a widget can bind to, with the exact token to store in " +
    "its `binding` prop: each operation's input and output nodes " +
    "(op:<opId>/in:<nodeId>, op:<opId>/out:<nodeId>), its execution fields " +
    "(op:<opId>/exec#running|progress|error), and every variable (var:<id>). " +
    "Call this before binding a widget instead of guessing a name. An " +
    "operation over a workflow this editor has not loaded reports " +
    "ioAvailable: false and no node lists.",
  parameters: z.object({ workflow_id: workflowIdParam }),
  async execute({ workflow_id }) {
    return {
      ok: true,
      ...getPuckAgentHandler(workflow_id).getBindingTargets()
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_app_set_title",
  description: "Set the app's page title (shown at the top of the app).",
  parameters: z.object({
    workflow_id: workflowIdParam,
    title: z.string()
  }),
  async execute({ workflow_id, title }) {
    getPuckAgentHandler(workflow_id).setRootProps({ title });
    return { ok: true, title };
  }
});
