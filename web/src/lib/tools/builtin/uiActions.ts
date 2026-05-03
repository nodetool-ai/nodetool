import { z } from "zod";
import { uiOpenWorkflowParams, uiRunWorkflowParams, uiSwitchTabParams, uiCopyParams } from "@nodetool-ai/protocol";
import { getWorkflowRunnerStore } from "../../../stores/WorkflowRunner";
import { FrontendToolRegistry } from "../frontendTools";

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
  parameters: z.object(uiOpenWorkflowParams),
  async execute({ workflow_id }, ctx) {
    const state = ctx.getState();

    if (state.openWorkflow) {
      await state.openWorkflow(workflow_id);
    } else {
      await state.fetchWorkflow(workflow_id);
      const workflow = state.getWorkflow(workflow_id);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflow_id}`);
      }
      state.setCurrentWorkflowId(workflow_id);
    }

    return { ok: true, workflow_id };
  }
});

FrontendToolRegistry.register({
  name: "ui_run_workflow",
  description: "Run a workflow by id.",
  parameters: z.object(uiRunWorkflowParams),
  async execute({ workflow_id, params }, ctx) {
    const state = ctx.getState();

    if (state.runWorkflow) {
      await state.runWorkflow(workflow_id, params);
      return { ok: true, workflow_id };
    }

    await state.fetchWorkflow(workflow_id);
    const workflow = state.getWorkflow(workflow_id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflow_id}`);
    }

    const nodeStore = state.getNodeStore(workflow_id)?.getState();
    if (!nodeStore) {
      throw new Error(`No node store for workflow ${workflow_id}`);
    }

    const { nodes, edges } = nodeStore;
    await getWorkflowRunnerStore(workflow_id)
      .getState()
      .run(params ?? {}, workflow, nodes, edges);

    return { ok: true, workflow_id };
  }
});

FrontendToolRegistry.register({
  name: "ui_switch_tab",
  description:
    "Switch to an already-open workflow tab by zero-based tab index.",
  parameters: z.object(uiSwitchTabParams),
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
  parameters: z.object(uiCopyParams),
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
