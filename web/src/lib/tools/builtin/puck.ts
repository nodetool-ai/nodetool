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
