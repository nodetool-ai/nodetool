// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Run ComfyUI Workflow — lib.comfy.RunWorkflow
export type RunWorkflowInputs = {
  endpoint?: string;
  workflow?: string;
  timeout?: number;
};

export interface RunWorkflowOutputs {
  output: Record<string, unknown>;
}

export function runWorkflow(inputs: RunWorkflowInputs): Promise<RunWorkflowOutputs> {
  return callNode<RunWorkflowOutputs>("lib.comfy.RunWorkflow", inputs);
}

runWorkflow.stream = function (inputs: RunWorkflowInputs): AsyncIterable<Partial<RunWorkflowOutputs>> {
  return streamNode<Partial<RunWorkflowOutputs>>("lib.comfy.RunWorkflow", inputs);
};

// Run ComfyUI Workflow (Worker) — lib.comfy.RunWorkflowOnWorker
export type RunWorkflowOnWorkerInputs = {
  worker_url?: string;
  worker_token?: string;
  workflow?: string;
  timeout?: number;
  previews?: boolean;
};

export interface RunWorkflowOnWorkerOutputs {
  output: Record<string, unknown>;
}

export function runWorkflowOnWorker(inputs: RunWorkflowOnWorkerInputs): Promise<RunWorkflowOnWorkerOutputs> {
  return callNode<RunWorkflowOnWorkerOutputs>("lib.comfy.RunWorkflowOnWorker", inputs);
}
