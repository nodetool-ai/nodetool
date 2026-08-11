// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Run ComfyUI Workflow — lib.comfy.RunWorkflow
export type RunWorkflowInputs = {
  endpoint?: Connectable<string>;
  workflow?: Connectable<string>;
  timeout?: Connectable<number>;
};

export interface RunWorkflowOutputs {
  output: Record<string, unknown>;
}

export function runWorkflow(inputs: RunWorkflowInputs): DslNode<RunWorkflowOutputs, "output"> {
  return createNode("lib.comfy.RunWorkflow", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}

// Run ComfyUI Workflow (Worker) — lib.comfy.RunWorkflowOnWorker
export type RunWorkflowOnWorkerInputs = {
  worker_url?: Connectable<string>;
  worker_token?: Connectable<string>;
  workflow?: Connectable<string>;
  timeout?: Connectable<number>;
  previews?: Connectable<boolean>;
};

export interface RunWorkflowOnWorkerOutputs {
  output: Record<string, unknown>;
}

export function runWorkflowOnWorker(inputs: RunWorkflowOnWorkerInputs): DslNode<RunWorkflowOnWorkerOutputs, "output"> {
  return createNode("lib.comfy.RunWorkflowOnWorker", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
