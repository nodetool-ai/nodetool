import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import {
  executeComfy,
  uploadComfyFile,
  loadMediaRefBytes,
  type ProcessingContext,
  type MediaRefValue,
  type ComfyNodeOutputs,
  type ComfyFileOutput,
  type ComfyProgressEvent
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
 * `Save*` nodes as streaming outputs. Dynamic input handles are keyed
 * `"<comfyNodeId>:<field>"`; connected values are injected into the prompt
 * before submission (assets are uploaded to the ComfyUI server first).
 *
 * Outputs stream: this is a streaming-output node, so each save node's media
 * is emitted on a per-node slot keyed `"<comfyNodeId>:image|audio|video"` the
 * moment that node finishes — one item per file, so batches naturally produce
 * multiple outputs. A final `output` slot carries the raw ComfyUI history.
 */
export class ComfyWorkflowNode extends BaseNode {
  static readonly nodeType = "lib.comfy.RunWorkflow";
  static readonly title = "Run ComfyUI Workflow";
  static readonly description =
    "Run a ComfyUI workflow on a ComfyUI server.\n    comfy, comfyui, workflow, image, diffusion\n\n    Use cases:\n    - Generate images with an existing ComfyUI workflow\n    - Call a local or remote ComfyUI server (RunPod, etc.)\n    - Embed ComfyUI generation inside a NodeTool workflow";
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = {
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
    description: "Maximum seconds to wait for the workflow to finish.",
    min: 1
  })
  declare timeout: any;

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

  /** Build a single NodeTool media ref from one downloaded ComfyUI file. */
  private fileToRef(
    kind: "image" | "audio" | "video",
    file: ComfyFileOutput
  ): Record<string, unknown> {
    return { type: kind, uri: "", data: file.data, mimeType: file.mimeType };
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
    const endpoint = String(this.endpoint ?? "").trim();
    if (!endpoint) {
      throw new Error("ComfyUI endpoint is required");
    }

    const source = this.parseWorkflow(this.workflow);
    if (Object.keys(source).length === 0) {
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

    const nodeCount = Object.keys(prompt).length;
    const self = this as unknown as Record<string, unknown>;
    const nodeId = String(self.__node_id ?? "");
    const nodeName = String(self.__node_name ?? "Run ComfyUI Workflow");
    const logLine = (
      content: string,
      severity: "info" | "warning" | "error" = "info"
    ): void => {
      context?.postMessage({
        type: "log_update",
        node_id: nodeId,
        node_name: nodeName,
        content,
        severity
      });
    };

    logLine(`Running ComfyUI workflow (${nodeCount} nodes) on ${endpoint}`);

    const onProgress = (event: ComfyProgressEvent): void => {
      switch (event.type) {
        case "execution_start":
          logLine("Execution started");
          break;
        case "execution_cached":
          if (event.cached_nodes?.length) {
            logLine(`Reused cache for ${event.cached_nodes.length} node(s)`);
          }
          break;
        case "executing":
          if (event.node) {
            const cls = prompt[event.node]?.class_type ?? event.node;
            logLine(`Executing ${cls} (#${event.node})`);
          }
          break;
        case "progress":
          if (
            typeof event.progress === "number" &&
            typeof event.total === "number" &&
            event.total > 0
          ) {
            context?.postMessage({
              type: "node_progress",
              node_id: nodeId,
              progress: event.progress,
              total: event.total
            });
          }
          break;
        case "execution_error":
          logLine(`ComfyUI error: ${event.error ?? "unknown"}`, "error");
          break;
        default:
          break;
      }
    };

    // Bridge the executor's onNodeOutput WS callback into this generator: each
    // downloaded file becomes one queued frame that we yield to its node slot.
    const queue: Array<Record<string, unknown>> = [];
    let notify: (() => void) | null = null;
    const wake = (): void => {
      const fn = notify;
      notify = null;
      fn?.();
    };

    let fileCount = 0;
    const onNodeOutput = (cnId: string, outs: ComfyNodeOutputs): void => {
      const groups: Array<["image" | "audio" | "video", ComfyFileOutput[]]> = [
        ["image", outs.images ?? []],
        ["audio", outs.audio ?? []],
        ["video", outs.video ?? []]
      ];
      for (const [kind, files] of groups) {
        for (const file of files) {
          fileCount += 1;
          queue.push({ [`${cnId}:${kind}`]: this.fileToRef(kind, file) });
        }
      }
      if (queue.length > 0) {
        logLine(`Output from #${cnId}`);
        wake();
      }
    };

    let settledResult: Awaited<typeof result> | null = null;
    const { result } = executeComfy(
      prompt,
      endpoint,
      onProgress,
      timeoutMs,
      onNodeOutput
    );
    const done = result.then((r) => {
      settledResult = r;
      wake();
    });

    // Drain streamed outputs as they arrive, until execution settles.
    while (settledResult === null || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
        continue;
      }
      yield queue.shift() as Record<string, unknown>;
    }
    await done;

    const res = settledResult as Awaited<typeof result>;
    if (res.status !== "completed") {
      logLine(res.error ?? "ComfyUI execution failed", "error");
      throw new Error(res.error ?? "ComfyUI execution failed");
    }

    logLine(
      `ComfyUI workflow completed (${fileCount} file${fileCount === 1 ? "" : "s"})`
    );

    // Final frame: raw ComfyUI history on the static `output` slot.
    yield { output: res.raw_output ?? {} };
  }
}

export const COMFY_NODES = tagAsServer([ComfyWorkflowNode]);
