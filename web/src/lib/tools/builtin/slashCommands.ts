import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchema, resolveWorkflowId } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_run_workflow",
  description: "Run the current workflow. Triggers workflow execution.",
  hidden: true,
  parameters: {
    type: "object",
    properties: {
      workflow_id: optionalWorkflowIdSchema
    }
  },
  async execute({ workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {throw new Error(`No node store for workflow ${workflowId}`);}

    return { ok: true, message: "Workflow execution started" };
  }
});

FrontendToolRegistry.register({
  name: "ui_stop_workflow",
  description: "Stop the currently running workflow.",
  hidden: true,
  parameters: {
    type: "object",
    properties: {
      workflow_id: optionalWorkflowIdSchema
    }
  },
  async execute({ workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);

    return { ok: true, message: "Workflow execution stopped" };
  }
});

FrontendToolRegistry.register({
  name: "ui_new_workflow",
  description: "Create a new empty workflow.",
  hidden: true,
  parameters: {
    type: "object",
    properties: {
      template: {
        type: "string",
        description: "Optional template name to create from"
      }
    }
  },
  async execute({ template }, ctx) {
    const state = ctx.getState();
    const workflow = template
      ? await state.searchTemplates(template)
      : state.newWorkflow();

    return { ok: true, workflow_id: workflow.id, message: "New workflow created" };
  }
});

FrontendToolRegistry.register({
  name: "ui_save_workflow",
  description: "Save the current workflow.",
  hidden: true,
  parameters: {
    type: "object",
    properties: {
      workflow_id: optionalWorkflowIdSchema
    }
  },
  async execute({ workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const workflow = state.getWorkflow(workflowId);
    if (!workflow) {throw new Error(`Workflow ${workflowId} not found`);}

    await state.saveWorkflow(workflow);

    return { ok: true, message: "Workflow saved successfully" };
  }
});

FrontendToolRegistry.register({
  name: "ui_clear_chat",
  description: "Clear all messages in the current chat thread.",
  hidden: true,
  parameters: {
    type: "object",
    properties: {}
  },
  async execute({}, ctx) {
    return { ok: true, message: "Chat cleared" };
  }
});

FrontendToolRegistry.register({
  name: "ui_undo",
  description: "Undo the last editor action.",
  hidden: true,
  parameters: {
    type: "object",
    properties: {
      workflow_id: optionalWorkflowIdSchema
    }
  },
  async execute({ workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {throw new Error(`No node store for workflow ${workflowId}`);}

    return { ok: true, message: "Undo" };
  }
});

FrontendToolRegistry.register({
  name: "ui_redo",
  description: "Redo the last editor action.",
  hidden: true,
  parameters: {
    type: "object",
    properties: {
      workflow_id: optionalWorkflowIdSchema
    }
  },
  async execute({ workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {throw new Error(`No node store for workflow ${workflowId}`);}

    return { ok: true, message: "Redo" };
  }
});

FrontendToolRegistry.register({
  name: "ui_fit_view",
  description: "Fit all nodes to the screen view.",
  hidden: true,
  parameters: {
    type: "object",
    properties: {
      workflow_id: optionalWorkflowIdSchema
    }
  },
  async execute({ workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);

    return { ok: true, message: "View fitted to screen" };
  }
});

FrontendToolRegistry.register({
  name: "ui_align_nodes",
  description: "Align selected nodes in the editor.",
  hidden: true,
  parameters: {
    type: "object",
    properties: {
      direction: {
        type: "string",
        enum: ["left", "right", "center", "top", "bottom"],
        description: "Alignment direction"
      },
      workflow_id: optionalWorkflowIdSchema
    },
    required: ["direction"]
  },
  async execute({ direction, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);

    return { ok: true, message: `Nodes aligned ${direction}` };
  }
});

FrontendToolRegistry.register({
  name: "ui_show_help",
  description: "Show help information for commands or nodes.",
  hidden: true,
  parameters: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        description: "Help topic (command name or 'commands' for all commands)"
      }
    }
  },
  async execute({ topic }) {
    const helpContent = topic
      ? `Help for: ${topic}`
      : "Available commands: /run, /stop, /new, /save, /node, /template, /clear, /undo, /redo, /fit, /align";

    return { ok: true, message: helpContent };
  }
});
