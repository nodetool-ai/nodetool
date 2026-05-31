import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { executeComfy } from "@nodetool-ai/runtime";

type ComfyPrompt = Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;

/**
 * Run a ComfyUI workflow on any ComfyUI server.
 *
 * The workflow is supplied in ComfyUI's API ("prompt") format — a map of
 * node id to `{ class_type, inputs }`. Connect the workflow input to a JSON
 * constant or load it from a file, and point `endpoint` at the ComfyUI
 * server (local, RunPod, etc.).
 */
export class ComfyWorkflowNode extends BaseNode {
  static readonly nodeType = "lib.comfy.RunWorkflow";
  static readonly title = "Run ComfyUI Workflow";
  static readonly description =
    "Run a ComfyUI workflow on a ComfyUI server.\n    comfy, comfyui, workflow, image, diffusion\n\n    Use cases:\n    - Generate images with an existing ComfyUI workflow\n    - Call a local or remote ComfyUI server (RunPod, etc.)\n    - Embed ComfyUI generation inside a NodeTool workflow";
  static readonly metadataOutputTypes = {
    images: "list[image]",
    output: "dict[str, any]"
  };

  @prop({
    type: "str",
    default: "127.0.0.1:8188",
    title: "Endpoint",
    description:
      "ComfyUI server address, e.g. 127.0.0.1:8188 or http://host:8188.",
    required: true
  })
  declare endpoint: any;

  @prop({
    type: "dict[str, any]",
    default: {},
    title: "Workflow",
    description:
      "ComfyUI workflow in API (prompt) format: a map of node id to { class_type, inputs }.",
    required: true
  })
  declare workflow: any;

  @prop({
    type: "int",
    default: 600,
    title: "Timeout",
    description: "Maximum seconds to wait for the workflow to finish.",
    min: 1
  })
  declare timeout: any;

  async process(): Promise<Record<string, unknown>> {
    const endpoint = String(this.endpoint ?? "").trim();
    if (!endpoint) {
      throw new Error("ComfyUI endpoint is required");
    }

    const workflow = this.workflow as ComfyPrompt | undefined;
    if (
      !workflow ||
      typeof workflow !== "object" ||
      Object.keys(workflow).length === 0
    ) {
      throw new Error(
        "ComfyUI workflow is required (API prompt format: { nodeId: { class_type, inputs } })"
      );
    }

    const timeoutMs = Math.max(1, Number(this.timeout ?? 600)) * 1000;

    const { result } = executeComfy(workflow, endpoint, undefined, timeoutMs);
    const res = await result;

    if (res.status !== "completed") {
      throw new Error(res.error ?? "ComfyUI execution failed");
    }

    const images = (res.images ?? []).map((img) => ({
      type: "image",
      uri: "",
      data: img.data,
      mimeType: "image/png"
    }));

    return { images, output: res.raw_output ?? {} };
  }
}

export const COMFY_NODES = tagAsServer([ComfyWorkflowNode]);
