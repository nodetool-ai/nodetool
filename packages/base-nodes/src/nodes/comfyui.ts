/**
 * ComfyUI Workflow Nodes
 *
 * Backend nodes for executing ComfyUI workflows via a local ComfyUI server
 * or a RunPod serverless ComfyUI endpoint.
 */

import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { RunPodComfyClient } from "@nodetool/runtime";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getComfyAddr(secrets: Record<string, string>): string {
  return (
    secrets.COMFYUI_ADDR ||
    process.env.COMFYUI_ADDR ||
    "127.0.0.1:8188"
  );
}

function getRunPodCredentials(
  secrets: Record<string, string>
): { apiKey: string; endpointId: string } | null {
  const apiKey = secrets.RUNPOD_API_KEY || process.env.RUNPOD_API_KEY || "";
  const endpointId =
    secrets.RUNPOD_COMFYUI_ENDPOINT_ID ||
    process.env.RUNPOD_COMFYUI_ENDPOINT_ID ||
    "";
  if (!apiKey || !endpointId) return null;
  return { apiKey, endpointId };
}

/** Build a base URL for a local ComfyUI server. */
function comfyBaseUrl(addr: string): string {
  const host = addr.startsWith("http") ? addr : `http://${addr}`;
  return host.replace(/\/+$/, "");
}

/** Wait for ms, respecting an AbortSignal. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Local ComfyUI client (minimal, just what the node needs)
// ---------------------------------------------------------------------------

interface ComfyPromptResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

interface ComfyHistoryOutput {
  images?: Array<{
    filename: string;
    subfolder: string;
    type: string;
  }>;
}

interface ComfyHistoryItem {
  outputs: Record<string, ComfyHistoryOutput>;
  status?: { status_str?: string; completed?: boolean };
}

interface ComfyHistoryResponse {
  [promptId: string]: ComfyHistoryItem;
}

async function submitComfyPrompt(
  base: string,
  workflow: Record<string, unknown>
): Promise<ComfyPromptResponse> {
  const response = await fetch(`${base}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ComfyUI /prompt failed (${response.status}): ${text}`);
  }
  return (await response.json()) as ComfyPromptResponse;
}

async function pollComfyHistory(
  base: string,
  promptId: string,
  maxAttempts = 600,
  intervalMs = 2000
): Promise<ComfyHistoryItem> {
  for (let i = 0; i < maxAttempts; i++) {
    await delay(intervalMs);
    const response = await fetch(`${base}/history/${promptId}`);
    if (!response.ok) continue;
    const history = (await response.json()) as ComfyHistoryResponse;
    const item = history[promptId];
    if (item) return item;
  }
  throw new Error(`ComfyUI prompt ${promptId} timed out`);
}

function buildComfyImageUrl(
  base: string,
  filename: string,
  subfolder: string,
  type: string
): string {
  const params = new URLSearchParams({ filename, subfolder, type });
  return `${base}/view?${params.toString()}`;
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

// ---------------------------------------------------------------------------
// 1. RunComfyUIWorkflow — local ComfyUI
// ---------------------------------------------------------------------------

export class RunComfyUIWorkflowNode extends BaseNode {
  static readonly nodeType = "comfyui.RunComfyUIWorkflow";
  static readonly title = "Run ComfyUI Workflow";
  static readonly description =
    "Execute a ComfyUI workflow on a local ComfyUI server.\n" +
    "Accepts a workflow in ComfyUI API format (exported via Workflow > Export API).\n" +
    "comfyui, workflow, image, generation, local";
  static readonly metadataOutputTypes = {
    images: "list[image]",
    raw_output: "dict[str, any]",
  };
  static readonly requiredSettings = ["COMFYUI_ADDR"];

  @prop({
    type: "dict[str, any]",
    default: null,
    title: "Workflow",
    description:
      "ComfyUI workflow in API format (JSON). Export from ComfyUI via Workflow > Export (API).",
    required: true,
  })
  declare workflow: Record<string, unknown>;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const workflow = this.workflow;
    if (!workflow || Object.keys(workflow).length === 0) {
      throw new Error("workflow is required");
    }

    const addr = getComfyAddr(this._secrets);
    const base = comfyBaseUrl(addr);

    // Submit
    const submitResult = await submitComfyPrompt(base, workflow);
    if (submitResult.node_errors && Object.keys(submitResult.node_errors).length > 0) {
      throw new Error(
        `ComfyUI node errors: ${JSON.stringify(submitResult.node_errors)}`
      );
    }

    // Poll for completion
    const historyItem = await pollComfyHistory(base, submitResult.prompt_id);

    // Collect images from all output nodes
    const images: Array<Record<string, unknown>> = [];
    const rawOutputs: Record<string, unknown> = {};

    for (const [nodeId, output] of Object.entries(historyItem.outputs)) {
      rawOutputs[nodeId] = output;
      if (output.images) {
        for (const img of output.images) {
          const url = buildComfyImageUrl(
            base,
            img.filename,
            img.subfolder,
            img.type
          );
          const dataUri = await fetchImageAsBase64(url);
          images.push({
            type: "image",
            filename: img.filename,
            data: dataUri,
            source_url: url,
          });
        }
      }
    }

    return { images, raw_output: rawOutputs };
  }
}

// ---------------------------------------------------------------------------
// 2. RunComfyUIWorkflowOnRunPod — RunPod serverless
// ---------------------------------------------------------------------------

export class RunComfyUIWorkflowOnRunPodNode extends BaseNode {
  static readonly nodeType = "comfyui.RunComfyUIWorkflowOnRunPod";
  static readonly title = "Run ComfyUI Workflow (RunPod)";
  static readonly description =
    "Execute a ComfyUI workflow on a RunPod serverless ComfyUI endpoint.\n" +
    "Accepts a workflow in ComfyUI API format. Images are returned as base64 or S3 URLs.\n" +
    "comfyui, workflow, image, generation, runpod, cloud, serverless";
  static readonly metadataOutputTypes = {
    images: "list[image]",
    raw_output: "dict[str, any]",
  };
  static readonly requiredSettings = [
    "RUNPOD_API_KEY",
    "RUNPOD_COMFYUI_ENDPOINT_ID",
  ];

  @prop({
    type: "dict[str, any]",
    default: null,
    title: "Workflow",
    description:
      "ComfyUI workflow in API format (JSON). Export from ComfyUI via Workflow > Export (API).",
    required: true,
  })
  declare workflow: Record<string, unknown>;

  async process(
    _context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const workflow = this.workflow;
    if (!workflow || Object.keys(workflow).length === 0) {
      throw new Error("workflow is required");
    }

    const creds = getRunPodCredentials(this._secrets);
    if (!creds) {
      throw new Error(
        "RunPod credentials not configured. Set RUNPOD_API_KEY and RUNPOD_COMFYUI_ENDPOINT_ID in settings."
      );
    }

    const client = new RunPodComfyClient(creds.apiKey, creds.endpointId);
    const result = await client.runWorkflow({ workflow });

    if (result.status !== "COMPLETED") {
      const errorMsg =
        result.error ||
        result.output?.errors?.join("; ") ||
        `RunPod job ${result.status}`;
      throw new Error(`RunPod ComfyUI job failed: ${errorMsg}`);
    }

    // Convert output images
    const images: Array<Record<string, unknown>> = [];
    if (result.output?.images) {
      for (const img of result.output.images) {
        if (img.type === "base64") {
          images.push({
            type: "image",
            filename: img.filename,
            data: `data:image/png;base64,${img.data}`,
          });
        } else {
          // s3_url
          images.push({
            type: "image",
            filename: img.filename,
            url: img.data,
          });
        }
      }
    }

    return {
      images,
      raw_output: result.output ?? {},
    };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const COMFYUI_NODES: readonly NodeClass[] = [
  RunComfyUIWorkflowNode,
  RunComfyUIWorkflowOnRunPodNode,
];
