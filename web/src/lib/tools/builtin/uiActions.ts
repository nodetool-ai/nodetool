import { z } from "zod";
import { uiNewWorkflowParams, uiOpenWorkflowParams, uiRunWorkflowParams, uiSwitchTabParams, uiCopyParams } from "@nodetool-ai/protocol";
import { getWorkflowRunnerStore } from "../../../stores/WorkflowRunner";
import { FrontendToolRegistry } from "../frontendTools";
import { openDocument } from "./openDocument";
import { waitForRunReport, type RunReportNode } from "./runReport";
import { isRecord, isString } from "../../../utils/typePredicates";

const DEFAULT_RUN_WAIT_SECONDS = 300;

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
    // The workspace tab is what the user sees. Loading the workflow into the
    // editor store alone reported success with no tab on screen.
    const opened = await openDocument("workflow", workflow_id, ctx);
    return { ok: true, workflow_id: opened.id };
  }
});

FrontendToolRegistry.register({
  name: "ui_new_workflow",
  description:
    "Create an empty workflow, open it in a new editor tab, and switch to it. " +
    "Returns its `workflow_id` for the graph tools.",
  parameters: z.object(uiNewWorkflowParams),
  async execute({ name }, ctx) {
    const state = ctx.getState();
    const draft = { ...state.newWorkflow(), name: name?.trim() || "New Workflow" };
    state.addWorkflow(draft);
    // The server creates the row on this first save: the update route upserts
    // when no expected_updated_at is sent.
    await state.saveWorkflow(draft);
    const opened = await openDocument("workflow", draft.id, ctx);
    return { ok: true, workflow_id: opened.id, url: opened.url };
  }
});

FrontendToolRegistry.register({
  name: "ui_run_workflow",
  description:
    "Run a workflow in the editor, where the user sees each node run. Pass `wait: true` to get " +
    "the status, outputs keyed by output name, and node errors when the run ends.",
  parameters: z.object(uiRunWorkflowParams),
  async execute({ workflow_id, params, wait, timeout_seconds }, ctx) {
    const state = ctx.getState();
    const finish = async (jobId: string) => {
      if (!wait) {
        return { ok: true, workflow_id, job_id: jobId };
      }
      const nodes = (state.getNodeStore(workflow_id)?.getState().nodes ?? []).map(
        (node): RunReportNode => {
          const data: Record<string, unknown> = isRecord(node.data) ? node.data : {};
          return {
            id: node.id,
            type: node.type,
            title: isString(data.title) ? data.title : undefined,
            properties: isRecord(data.properties) ? data.properties : undefined
          };
        }
      );
      const report = await waitForRunReport(
        workflow_id,
        jobId,
        nodes,
        (timeout_seconds ?? DEFAULT_RUN_WAIT_SECONDS) * 1000,
        ctx.abortSignal
      );
      return { ok: true, workflow_id, ...report };
    };

    if (state.runWorkflow) {
      return finish(await state.runWorkflow(workflow_id, params, ctx.abortSignal));
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
    const jobId = await getWorkflowRunnerStore(workflow_id)
      .getState()
      .run(params ?? {}, workflow, nodes, edges, undefined, undefined, true);
    if (ctx.abortSignal.aborted) {
      await getWorkflowRunnerStore(workflow_id).getState().cancelJob(jobId);
    }

    return finish(jobId);
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
