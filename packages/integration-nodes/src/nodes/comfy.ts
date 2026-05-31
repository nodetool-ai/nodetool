import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import {
  executeComfy,
  uploadComfyFile,
  loadMediaRefBytes,
  type ProcessingContext,
  type MediaRefValue,
  type ComfyNodeOutputs,
  type ComfyFileOutput
} from "@nodetool-ai/runtime";

type ComfyPrompt = Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;

/** Media kind → default filename extension / mime for uploads. */
const UPLOAD_DEFAULTS: Record<string, { ext: string; mime: string }> = {
  image: { ext: "png", mime: "image/png" },
  audio: { ext: "wav", mime: "audio/wav" },
  video: { ext: "mp4", mime: "video/mp4" }
};

/** A connected media ref looks like an object carrying uri/data/asset_id. */
function isMediaRef(value: unknown): value is MediaRefValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    "uri" in v || "data" in v || "asset_id" in v || typeof v.type === "string"
  );
}

function extFromUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  const clean = uri.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop();
  return ext && ext.length <= 5 && /^[a-z0-9]+$/i.test(ext)
    ? ext.toLowerCase()
    : undefined;
}

/**
 * Run a ComfyUI workflow on any ComfyUI server, with typed inputs/outputs
 * derived from the workflow.
 *
 * The workflow is supplied in ComfyUI's API ("prompt") format — a map of
 * node id to `{ class_type, inputs }`. The web UI loads a workflow (paste or
 * drop a `.json`/`.png`) and exposes its `Load*` nodes as typed inputs and
 * `Save*` nodes as typed outputs. Each dynamic handle is keyed
 * `"<comfyNodeId>:<field>"`; connected values are injected into the prompt
 * before submission (assets are uploaded to the ComfyUI server first), and
 * output files are returned per output node as `"<comfyNodeId>:<kind>"`.
 */
export class ComfyWorkflowNode extends BaseNode {
  static readonly nodeType = "lib.comfy.RunWorkflow";
  static readonly title = "Run ComfyUI Workflow";
  static readonly description =
    "Run a ComfyUI workflow on a ComfyUI server.\n    comfy, comfyui, workflow, image, diffusion\n\n    Use cases:\n    - Generate images with an existing ComfyUI workflow\n    - Call a local or remote ComfyUI server (RunPod, etc.)\n    - Embed ComfyUI generation inside a NodeTool workflow";
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;
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

  /**
   * Inject a single dynamic input value into the prompt at
   * `prompt[nodeId].inputs[field]`, uploading media refs to the ComfyUI server
   * and substituting the stored filename.
   */
  private async injectInput(
    prompt: ComfyPrompt,
    endpoint: string,
    handle: string,
    value: unknown,
    context?: ProcessingContext
  ): Promise<void> {
    const sep = handle.indexOf(":");
    if (sep <= 0) return;
    const nodeId = handle.slice(0, sep);
    const field = handle.slice(sep + 1);
    const node = prompt[nodeId];
    if (!node || typeof node.inputs !== "object" || node.inputs === null) {
      return;
    }

    if (isMediaRef(value)) {
      const bytes = await loadMediaRefBytes(value as MediaRefValue, context);
      if (!bytes) return;
      const kind = (value as MediaRefValue).type ?? "image";
      const fallback = UPLOAD_DEFAULTS[kind] ?? UPLOAD_DEFAULTS.image;
      const ext = extFromUri((value as MediaRefValue).uri) ?? fallback.ext;
      const filename = `nodetool_${nodeId}_${field}.${ext}`;
      const stored = await uploadComfyFile(
        endpoint,
        bytes,
        filename,
        fallback.mime
      );
      node.inputs[field] = stored;
      return;
    }

    node.inputs[field] = value;
  }

  /** Convert downloaded ComfyUI output files into NodeTool media refs. */
  private filesToRefs(
    kind: "image" | "audio" | "video",
    files: ComfyFileOutput[]
  ): Array<Record<string, unknown>> {
    return files.map((f) => ({
      type: kind,
      uri: "",
      data: f.data,
      mimeType: f.mimeType
    }));
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const endpoint = String(this.endpoint ?? "").trim();
    if (!endpoint) {
      throw new Error("ComfyUI endpoint is required");
    }

    const source = this.workflow as ComfyPrompt | undefined;
    if (
      !source ||
      typeof source !== "object" ||
      Object.keys(source).length === 0
    ) {
      throw new Error(
        "ComfyUI workflow is required (API prompt format: { nodeId: { class_type, inputs } })"
      );
    }

    // Deep clone so injected inputs never mutate the stored workflow prop.
    const prompt = JSON.parse(JSON.stringify(source)) as ComfyPrompt;

    // Inject dynamic inputs (connected assets + exposed scalar params).
    for (const [handle, value] of this.dynamicProps) {
      if (value === undefined || value === null) continue;
      await this.injectInput(prompt, endpoint, handle, value, context);
    }

    const timeoutMs = Math.max(1, Number(this.timeout ?? 600)) * 1000;

    const { result } = executeComfy(prompt, endpoint, undefined, timeoutMs);
    const res = await result;

    if (res.status !== "completed") {
      throw new Error(res.error ?? "ComfyUI execution failed");
    }

    const output: Record<string, unknown> = {
      // Legacy convenience outputs (flat across all nodes + raw history).
      images: (res.images ?? []).map((img) => ({
        type: "image",
        uri: "",
        data: img.data,
        mimeType: "image/png"
      })),
      output: res.raw_output ?? {}
    };

    // Per-node typed outputs keyed "<comfyNodeId>:<kind>".
    const nodeOutputs: Record<string, ComfyNodeOutputs> =
      res.nodeOutputs ?? {};
    for (const [nodeId, outs] of Object.entries(nodeOutputs)) {
      if (outs.images?.length) {
        output[`${nodeId}:images`] = this.filesToRefs("image", outs.images);
      }
      if (outs.audio?.length) {
        const refs = this.filesToRefs("audio", outs.audio);
        output[`${nodeId}:audio`] = refs.length === 1 ? refs[0] : refs;
      }
      if (outs.video?.length) {
        const refs = this.filesToRefs("video", outs.video);
        output[`${nodeId}:video`] = refs.length === 1 ? refs[0] : refs;
      }
    }

    return output;
  }
}

export const COMFY_NODES = tagAsServer([ComfyWorkflowNode]);
