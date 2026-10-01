// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Run ComfyUI Workflow — lib.comfy.RunWorkflow
export type RunWorkflowInputs = {
  endpoint?: Connectable<string>;
  api?: Connectable<"native" | "v2">;
  workflow?: Connectable<string>;
  timeout?: Connectable<number>;
  [name: string]: unknown;
};

export interface RunWorkflowOutputs {
  output: Record<string, unknown>;
}

export function runWorkflow(inputs: RunWorkflowInputs, options?: NodeOptions): NodeWithOutputs<RunWorkflowOutputs, "output"> {
  return createNode("lib.comfy.RunWorkflow", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"dict[str, any]"}, defaultOutput: "output", streaming: true });
}

// Run ComfyUI Workflow (Worker) — lib.comfy.RunWorkflowOnWorker
export type RunWorkflowOnWorkerInputs = {
  worker_url?: Connectable<string>;
  worker_token?: Connectable<string>;
  workflow?: Connectable<string>;
  timeout?: Connectable<number>;
  previews?: Connectable<boolean>;
  [name: string]: unknown;
};

export interface RunWorkflowOnWorkerOutputs {
  output: Record<string, unknown>;
}

export function runWorkflowOnWorker(inputs: RunWorkflowOnWorkerInputs, options?: NodeOptions): NodeWithOutputs<RunWorkflowOnWorkerOutputs, "output"> {
  return createNode("lib.comfy.RunWorkflowOnWorker", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"dict[str, any]"}, defaultOutput: "output", streaming: true });
}

// Run ComfyUI Workflow (Comfy Cloud) — lib.comfy.RunWorkflowOnCloud
export type RunWorkflowOnCloudInputs = {
  workflow?: Connectable<string>;
  timeout?: Connectable<number>;
  previews?: Connectable<boolean>;
  [name: string]: unknown;
};

export interface RunWorkflowOnCloudOutputs {
  output: Record<string, unknown>;
}

export function runWorkflowOnCloud(inputs: RunWorkflowOnCloudInputs, options?: NodeOptions): NodeWithOutputs<RunWorkflowOnCloudOutputs, "output"> {
  return createNode("lib.comfy.RunWorkflowOnCloud", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"dict[str, any]"}, defaultOutput: "output", streaming: true });
}
