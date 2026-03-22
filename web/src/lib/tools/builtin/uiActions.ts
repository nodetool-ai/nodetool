import { z } from "zod";
import { getWorkflowRunnerStore } from "../../../stores/WorkflowRunner";
import { FrontendToolRegistry } from "../frontendTools";

const workflowTargetSchema = z
  .object({
    workflow_id: z
      .string()
      .optional()
      .describe("Workflow id to target."),
    id: z
      .string()
      .optional()
      .describe("Alias for workflow_id.")
  })
  .refine((value) => Boolean(value.workflow_id ?? value.id), {
    message: "workflow_id (or id) is required"
  });

async function writeClipboardText(
  text: string,
  copyToClipboard?: (value: string) => Promise<void>
): Promise<void> {
  if (copyToClipboard) {
    await copyToClipboard(text);
    return;
  }

  if (window.api?.clipboard?.writeText) {
    await window.api.clipboard.writeText(text);
    return;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  throw new Error("Clipboard write is not available in this environment");
}

async function readClipboardText(
  pasteFromClipboard?: () => Promise<string>
): Promise<string> {
  if (pasteFromClipboard) {
    return pasteFromClipboard();
  }

  if (window.api?.clipboard?.readText) {
    return window.api.clipboard.readText();
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }

  throw new Error("Clipboard read is not available in this environment");
}

FrontendToolRegistry.register({
  name: "ui_open_workflow",
  description: "Open a workflow tab and switch to it by workflow id.",
  parameters: workflowTargetSchema,
  async execute({ workflow_id, id }, ctx) {
    const state = ctx.getState();
    const targetWorkflowId = workflow_id ?? id;
    if (!targetWorkflowId) {
      throw new Error("workflow_id is required");
    }

    if (state.openWorkflow) {
      await state.openWorkflow(targetWorkflowId);
    } else {
      await state.fetchWorkflow(targetWorkflowId);
      const workflow = state.getWorkflow(targetWorkflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${targetWorkflowId}`);
      }
      state.setCurrentWorkflowId(targetWorkflowId);
    }

    return { ok: true, workflow_id: targetWorkflowId };
  }
});

FrontendToolRegistry.register({
  name: "ui_run_workflow",
  description: "Run a workflow by id.",
  parameters: workflowTargetSchema.extend({
    params: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Optional workflow run parameters.")
  }),
  async execute({ workflow_id, id, params }, ctx) {
    const state = ctx.getState();
    const targetWorkflowId = workflow_id ?? id;
    if (!targetWorkflowId) {
      throw new Error("workflow_id is required");
    }

    if (state.runWorkflow) {
      await state.runWorkflow(targetWorkflowId, params);
      return { ok: true, workflow_id: targetWorkflowId };
    }

    await state.fetchWorkflow(targetWorkflowId);
    const workflow = state.getWorkflow(targetWorkflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${targetWorkflowId}`);
    }

    const nodeStore = state.getNodeStore(targetWorkflowId)?.getState();
    if (!nodeStore) {
      throw new Error(`No node store for workflow ${targetWorkflowId}`);
    }

    const { nodes, edges } = nodeStore;
    await getWorkflowRunnerStore(targetWorkflowId)
      .getState()
      .run(params ?? {}, workflow, nodes, edges);

    return { ok: true, workflow_id: targetWorkflowId };
  }
});

FrontendToolRegistry.register({
  name: "ui_switch_tab",
  description:
    "Switch to an already-open workflow tab by zero-based tab index.",
  parameters: z.object({
    tab_index: z
      .number()
      .int()
      .min(0)
      .describe("Zero-based tab index (0 is the first tab).")
  }),
  async execute({ tab_index }, ctx) {
    const state = ctx.getState();

    if (state.switchTab) {
      const workflowId = await state.switchTab(tab_index);
      return { ok: true, tab_index, workflow_id: workflowId };
    }

    const openWorkflowIds = state.getOpenWorkflowIds?.() ?? [];
    const workflowId = openWorkflowIds[tab_index];
    if (!workflowId) {
      throw new Error(
        `Tab index ${tab_index} is out of range (open tabs: ${openWorkflowIds.length})`
      );
    }

    state.setCurrentWorkflowId(workflowId);
    return { ok: true, tab_index, workflow_id: workflowId };
  }
});

FrontendToolRegistry.register({
  name: "ui_copy",
  description: "Copy text to clipboard.",
  parameters: z.object({
    text: z.string().describe("The text to copy to clipboard.")
  }),
  async execute({ text }, ctx) {
    await writeClipboardText(text, ctx.getState().copyToClipboard);
    return { ok: true, text_length: text.length };
  }
});

FrontendToolRegistry.register({
  name: "ui_paste",
  description: "Paste text from clipboard.",
  parameters: z.object({}),
  async execute(_args, ctx) {
    const text = await readClipboardText(ctx.getState().pasteFromClipboard);
    return { ok: true, text };
  }
});
