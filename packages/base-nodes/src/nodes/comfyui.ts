/**
 * ComfyUI Workflow Nodes
 *
 * Backend nodes for executing ComfyUI workflows via a local ComfyUI server
 * or a RunPod serverless ComfyUI endpoint.
 *
 * Both nodes share the same inputs (workflow JSON) and outputs (images list +
 * raw_output dict). ComfyUI nodes do not support streaming — they submit the
 * whole workflow and poll for completion.
 */

import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { RunPodComfyClient } from "@nodetool/runtime";

// ---------------------------------------------------------------------------
// Shared types & helpers
// ---------------------------------------------------------------------------

/** Canonical image output — matches the format used by other image nodes. */
interface ImageOutput {
  type: "image";
  data: string; // base64 (no data-uri prefix)
  filename: string;
}

/** Validate the workflow prop and throw a clear error if it's empty. */
function requireWorkflow(
  workflow: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!workflow || Object.keys(workflow).length === 0) {
    throw new Error(
      "workflow is required — export from ComfyUI via Workflow > Export (API)"
    );
  }
  return workflow;
}

/** Read a secret/env var, with a fallback. */
function envOrSecret(
  secrets: Record<string, string>,
  name: string,
  fallback = ""
): string {
  return secrets[name] || process.env[name] || fallback;
}

// ---------------------------------------------------------------------------
// Local ComfyUI helpers
// ---------------------------------------------------------------------------

interface ComfyPromptResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

interface ComfyHistoryOutput {
  images?: Array<{ filename: string; subfolder: string; type: string }>;
}

interface ComfyHistoryItem {
  outputs: Record<string, ComfyHistoryOutput>;
}

interface ComfyHistoryResponse {
  [promptId: string]: ComfyHistoryItem;
}

function comfyBaseUrl(addr: string): string {
  const host = addr.startsWith("http") ? addr : `http://${addr}`;
  return host.replace(/\/+$/, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/** Collect images from a local ComfyUI history item. */
async function collectLocalImages(
  base: string,
  historyItem: ComfyHistoryItem
): Promise<{ images: ImageOutput[]; raw_output: Record<string, unknown> }> {
  const images: ImageOutput[] = [];
  const rawOutput: Record<string, unknown> = {};

  for (const [nodeId, output] of Object.entries(historyItem.outputs)) {
    rawOutput[nodeId] = output;
    if (output.images) {
      for (const img of output.images) {
        const params = new URLSearchParams({
          filename: img.filename,
          subfolder: img.subfolder,
          type: img.type,
        });
        const url = `${base}/view?${params.toString()}`;
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const buf = Buffer.from(await resp.arrayBuffer());
        images.push({
          type: "image",
          data: buf.toString("base64"),
          filename: img.filename,
        });
      }
    }
  }

  return { images, raw_output: rawOutput };
}

/** Strip the data-URI prefix (e.g. "data:image/png;base64,") if present. */
function stripDataUriPrefix(data: string): string {
  const idx = data.indexOf(",");
  if (idx !== -1 && data.startsWith("data:")) {
    return data.slice(idx + 1);
  }
  return data;
}

/** Collect images from a RunPod job response.
 *
 * The standard RunPod ComfyUI worker (per docs.runpod.io) returns a single
 * base64 data-URI in `output.message`. Custom workers may return an
 * `output.images[]` array instead. We handle both formats.
 */
function collectRunPodImages(
  output: {
    message?: string;
    images?: Array<{ filename: string; type: string; data: string }>;
    status?: string;
    errors?: string[];
  } | undefined
): { images: ImageOutput[]; raw_output: Record<string, unknown> } {
  const images: ImageOutput[] = [];

  // Standard RunPod ComfyUI worker format: output.message is a data-URI string
  if (output?.message && typeof output.message === "string") {
    images.push({
      type: "image",
      data: stripDataUriPrefix(output.message),
      filename: "output.png",
    });
  }

  // Custom worker format: output.images[] array
  if (output?.images) {
    for (const img of output.images) {
      images.push({
        type: "image",
        data: stripDataUriPrefix(img.data),
        filename: img.filename,
      });
    }
  }

  return { images, raw_output: output ?? {} };
}

// ---------------------------------------------------------------------------
// Shared static metadata — both nodes expose the same interface.
// ---------------------------------------------------------------------------

const COMFY_OUTPUT_TYPES = {
  images: "list[image]",
  raw_output: "dict[str, any]",
} as const;

// ---------------------------------------------------------------------------
// 1. RunComfyUIWorkflow — local ComfyUI server
// ---------------------------------------------------------------------------

export class RunComfyUIWorkflowNode extends BaseNode {
  static readonly nodeType = "comfyui.RunComfyUIWorkflow";
  static readonly title = "Run ComfyUI Workflow";
  static readonly description =
    "Execute a ComfyUI workflow on a local ComfyUI server.\n" +
    "Accepts a workflow in ComfyUI API format (exported via Workflow > Export API).\n" +
    "Returns generated images and raw node outputs.\n" +
    "comfyui, workflow, image, generation, local";
  static readonly metadataOutputTypes = COMFY_OUTPUT_TYPES;
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
    _context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const workflow = requireWorkflow(this.workflow);
    const base = comfyBaseUrl(envOrSecret(this._secrets, "COMFYUI_ADDR", "127.0.0.1:8188"));

    const submitResult = await submitComfyPrompt(base, workflow);
    if (
      submitResult.node_errors &&
      Object.keys(submitResult.node_errors).length > 0
    ) {
      throw new Error(
        `ComfyUI node errors: ${JSON.stringify(submitResult.node_errors)}`
      );
    }

    const historyItem = await pollComfyHistory(base, submitResult.prompt_id);
    return collectLocalImages(base, historyItem);
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
    "Accepts a workflow in ComfyUI API format. Returns generated images and raw output.\n" +
    "comfyui, workflow, image, generation, runpod, cloud, serverless";
  static readonly metadataOutputTypes = COMFY_OUTPUT_TYPES;
  static readonly requiredSettings = ["RUNPOD_API_KEY"];

  @prop({
    type: "str",
    default: "",
    title: "Endpoint ID",
    description:
      "RunPod serverless endpoint ID for the ComfyUI worker (e.g. abc123def456).",
    required: true,
  })
  declare endpoint_id: string;

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
    const workflow = requireWorkflow(this.workflow);
    const endpointId = String(this.endpoint_id ?? "").trim();
    if (!endpointId) {
      throw new Error("endpoint_id is required — set the RunPod serverless endpoint ID on this node.");
    }

    const apiKey = envOrSecret(this._secrets, "RUNPOD_API_KEY");
    if (!apiKey) {
      throw new Error(
        "RUNPOD_API_KEY not configured. Set it in Settings > Secrets."
      );
    }

    const client = new RunPodComfyClient(apiKey, endpointId);
    const result = await client.runWorkflow({ workflow });

    if (result.status !== "COMPLETED") {
      const errorMsg =
        result.error ||
        result.output?.errors?.join("; ") ||
        `RunPod job ${result.status}`;
      throw new Error(`RunPod ComfyUI job failed: ${errorMsg}`);
    }

    return collectRunPodImages(result.output);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const COMFYUI_NODES: readonly NodeClass[] = [
  RunComfyUIWorkflowNode,
  RunComfyUIWorkflowOnRunPodNode,
];
