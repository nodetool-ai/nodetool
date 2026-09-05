import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  cloudTransport,
  runComfyWorkflow,
  type ComfyPrompt,
  type ComfyTransport
} from "./comfy-sdk.js";

/**
 * Run a ComfyUI workflow on Comfy Cloud through the Comfy API v2.
 *
 * The workflow is supplied in ComfyUI's API ("prompt") format — a map of node
 * id to `{ class_type, inputs }`. Dynamic input handles are keyed
 * `"<comfyNodeId>:<field>"`; connected values are injected into the prompt
 * before submission, and connected media is uploaded to Comfy Cloud as an
 * asset first.
 *
 * Outputs stream: each file is emitted on a per-node slot keyed
 * `"<comfyNodeId>:image|audio|video|text|file"` the moment that node's output
 * lands, so a batch naturally produces several outputs. A final `output` slot
 * carries the finished job's id, status and output manifest.
 *
 * Comfy Cloud bills per GPU second by plan and reports no per-job cost, so
 * this node records the job id and no charge amount.
 */
export class ComfyCloudWorkflowNode extends BaseNode {
  static readonly nodeType = "lib.comfy.RunWorkflowOnCloud";
  static readonly title = "Run ComfyUI Workflow (Comfy Cloud)";
  static readonly description =
    "Run a ComfyUI workflow on Comfy Cloud via the Comfy API v2.\n    comfy, comfyui, cloud, workflow, image, diffusion\n\n    Use cases:\n    - Run a ComfyUI workflow without hosting a GPU\n    - Generate images or video from an exported API-format workflow\n    - Embed Comfy Cloud generation inside a NodeTool workflow";
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;
  static readonly autoSaveAsset = true;
  static readonly requiredSettings = ["COMFY_API_KEY"];
  static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };

  @prop({
    type: "str",
    default: "",
    title: "Workflow",
    description:
      "ComfyUI workflow in API (prompt) format, as a JSON string: a map of node id to { class_type, inputs }.",
    required: true
  })
  declare workflow: any;

  @prop({
    type: "int",
    default: 600,
    title: "Timeout",
    description: "Maximum seconds to wait for the job to finish.",
    min: 1
  })
  declare timeout: any;

  @prop({
    type: "bool",
    default: false,
    title: "Previews",
    description: "Log ComfyUI preview frames while the job runs."
  })
  declare previews: any;

  /**
   * Build the transport. Split out so tests can inject a fake without a real
   * Comfy Cloud account, the way {@link ComfyWorkerWorkflowNode} splits out
   * `connectBridge`.
   */
  protected createTransport(apiKey: string): ComfyTransport {
    return cloudTransport(apiKey);
  }

  /**
   * Parse the `workflow` prop into a ComfyUI prompt object. The prop holds a
   * JSON string (API prompt format); a raw object is also accepted for
   * backward compatibility with previously-saved graphs.
   */
  private parseWorkflow(value: unknown): ComfyPrompt {
    let parsed: unknown = value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return {};
      try {
        parsed = JSON.parse(trimmed);
      } catch (err) {
        throw new Error(
          `ComfyUI workflow is not valid JSON: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as ComfyPrompt;
  }

  /**
   * Buffered fallback for non-streaming consumers: drain the streaming output
   * and merge frames into a single record (slots with multiple files collapse
   * to an array).
   */
  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const merged: Record<string, unknown> = {};
    for await (const frame of this.genProcess(context)) {
      for (const [key, value] of Object.entries(frame)) {
        if (key in merged) {
          const prev = merged[key];
          merged[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
        } else {
          merged[key] = value;
        }
      }
    }
    return merged;
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const apiKey = this._secrets.COMFY_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "COMFY_API_KEY is required to run a workflow on Comfy Cloud. " +
          "Add it in Settings; get a key at https://platform.comfy.org."
      );
    }

    const source = this.parseWorkflow(this.workflow);
    if (Object.keys(source).length === 0) {
      throw new Error(
        "ComfyUI workflow is required (API prompt format: { nodeId: { class_type, inputs } })"
      );
    }

    const timeoutSeconds = Math.max(1, Number(this.timeout ?? 600));
    const timeoutSignal = AbortSignal.timeout(timeoutSeconds * 1000);
    const signal = context?.signal
      ? AbortSignal.any([context.signal, timeoutSignal])
      : timeoutSignal;

    try {
      yield* runComfyWorkflow(
        this.createTransport(apiKey),
        source,
        this.dynamicProps,
        {
          signal,
          context,
          apiKey,
          nodeId: this.__node_id,
          nodeName: this.__node_name ?? "Run ComfyUI Workflow (Comfy Cloud)",
          previews: Boolean(this.previews)
        }
      );
    } catch (err) {
      if (timeoutSignal.aborted) {
        throw new Error(
          `Comfy Cloud job did not finish within ${timeoutSeconds}s`
        );
      }
      throw err;
    }
  }
}
