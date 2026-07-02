import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import {
  executeComfy,
  uploadComfyFile,
  loadMediaRefBytes,
  WebsocketPythonBridge,
  type PythonBridge,
  type ComfyEvent,
  type ComfyExecuteResult,
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

/** Sniff a media kind + mime from the leading bytes of a ComfyUI output blob. */
function sniffMedia(bytes: Uint8Array): {
  kind: "image" | "audio" | "video";
  mime: string;
} {
  const b = bytes;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { kind: "image", mime: "image/png" };
  }
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { kind: "image", mime: "image/jpeg" };
  }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { kind: "image", mime: "image/gif" };
  }
  // RIFF container — disambiguate by the form type in bytes 8-11. RIFF is
  // generic (WEBP, WAVE, AVI, …), so only classify on an exact form match and
  // fall through otherwise rather than assuming WebP.
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    // "WEBP"
    if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
      return { kind: "image", mime: "image/webp" };
    }
    // "WAVE"
    if (b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45) {
      return { kind: "audio", mime: "audio/wav" };
    }
    // "AVI "
    if (b[8] === 0x41 && b[9] === 0x56 && b[10] === 0x49 && b[11] === 0x20) {
      return { kind: "video", mime: "video/x-msvideo" };
    }
  }
  // ftyp box → MP4/MOV
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return { kind: "video", mime: "video/mp4" };
  }
  // OGG
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) {
    return { kind: "audio", mime: "audio/ogg" };
  }
  // ID3 / MPEG audio
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    return { kind: "audio", mime: "audio/mpeg" };
  }
  return { kind: "image", mime: "image/png" };
}

/**
 * Run a ComfyUI workflow on a NodeTool worker that fronts a co-located,
 * loopback-only ComfyUI server (the `nodetool-worker-comfy` image), proxied
 * over the worker bridge as `comfy.*` messages.
 *
 * Unlike {@link ComfyWorkflowNode} — which talks to a ComfyUI HTTP endpoint
 * directly — this node connects to the worker's WebSocket bridge and calls
 * `comfy.execute`. ComfyUI itself is never exposed outside the worker. Input
 * media is sent as bridge blobs referenced from the workflow JSON via
 * `"blob:<key>"` placeholders; the worker uploads them to ComfyUI before
 * submitting. Generated files come back as output blobs and are emitted as
 * typed media refs (kind sniffed from the bytes), one dynamic slot per file,
 * plus a static `output` slot carrying the raw ComfyUI outputs.
 */
export class ComfyWorkerWorkflowNode extends BaseNode {
  static readonly nodeType = "lib.comfy.RunWorkflowOnWorker";
  static readonly title = "Run ComfyUI Workflow (Worker)";
  static readonly description =
    "Run a ComfyUI workflow on a NodeTool worker (nodetool-worker-comfy) over the worker bridge.\n    comfy, comfyui, workflow, worker, runpod, diffusion\n\n    Use cases:\n    - Run ComfyUI on a remote GPU worker without exposing ComfyUI directly\n    - Drive a RunPod ComfyUI worker from inside a NodeTool workflow";
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };

  @prop({
    type: "str",
    default: "ws://127.0.0.1:7777/ws",
    title: "Worker URL",
    description:
      "WebSocket URL of the NodeTool worker fronting ComfyUI, e.g. ws://host:7777/ws.",
    required: true
  })
  declare worker_url: any;

  @prop({
    type: "str",
    default: "",
    title: "Worker Token",
    description: "Bearer token for the worker, if it requires authentication."
  })
  declare worker_token: any;

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

  @prop({
    type: "bool",
    default: false,
    title: "Previews",
    description: "Stream ComfyUI preview images while the workflow runs."
  })
  declare previews: any;

  /**
   * Connect a bridge to the worker. Split out so tests can inject a fake
   * bridge without standing up a real WebSocket worker.
   */
  protected async connectBridge(): Promise<PythonBridge> {
    const url = String(this.worker_url ?? "").trim();
    const token = String(this.worker_token ?? "").trim();
    const bridge = new WebsocketPythonBridge({
      wsUrl: url,
      workerToken: token || undefined,
      // One-shot per node run — never keep reconnecting after we close.
      autoRestart: false
    });
    await bridge.connect();
    return bridge;
  }

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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const url = String(this.worker_url ?? "").trim();
    if (!url) {
      throw new Error("Worker URL is required");
    }

    const source = this.parseWorkflow(this.workflow);
    if (Object.keys(source).length === 0) {
      throw new Error(
        "ComfyUI workflow is required (API prompt format: { nodeId: { class_type, inputs } })"
      );
    }

    // Deep clone so injected inputs never mutate the stored workflow prop.
    const prompt = JSON.parse(JSON.stringify(source)) as ComfyPrompt;

    // Inject dynamic inputs. Media refs are sent as bridge blobs referenced
    // from the workflow via "blob:<key>" placeholders; scalars go in directly.
    const blobs: Record<string, Uint8Array> = {};
    for (const [handle, value] of this.dynamicProps) {
      if (value === undefined || value === null) continue;
      const sep = handle.indexOf(":");
      if (sep <= 0) continue;
      const nodeId = handle.slice(0, sep);
      const field = handle.slice(sep + 1);
      const node = prompt[nodeId];
      if (!node || typeof node.inputs !== "object" || node.inputs === null) {
        continue;
      }
      if (isMediaRef(value)) {
        const bytes = await loadMediaRefBytes(value as MediaRefValue, context);
        if (!bytes) continue;
        const key = `${nodeId}_${field}`;
        blobs[key] = bytes;
        node.inputs[field] = `blob:${key}`;
      } else {
        node.inputs[field] = value;
      }
    }

    const self = this as unknown as Record<string, unknown>;
    const nodeId = String(self.__node_id ?? "");
    const nodeName = String(self.__node_name ?? "Run ComfyUI Workflow (Worker)");
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

    const onEvent = (event: ComfyEvent): void => {
      switch (event.event) {
        case "started":
          logLine("Execution started");
          break;
        case "cached":
          if (event.nodes?.length) {
            logLine(`Reused cache for ${event.nodes.length} node(s)`);
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
            typeof event.value === "number" &&
            typeof event.max === "number" &&
            event.max > 0
          ) {
            context?.postMessage({
              type: "node_progress",
              node_id: nodeId,
              progress: event.value,
              total: event.max
            });
          }
          break;
        default:
          break;
      }
    };

    const bridge = await this.connectBridge();
    let result: ComfyExecuteResult;
    try {
      if (!bridge.supportsComfy()) {
        throw new Error(
          "The connected worker does not front a ComfyUI server " +
            "(worker.status.comfy.enabled is not set). Deploy the " +
            "nodetool-worker-comfy image."
        );
      }
      const nodeCount = Object.keys(prompt).length;
      logLine(`Running ComfyUI workflow (${nodeCount} nodes) on ${url}`);
      result = await bridge.comfyExecute(
        prompt as unknown as Record<string, unknown>,
        {
          blobs: Object.keys(blobs).length > 0 ? blobs : undefined,
          previews: Boolean(this.previews),
          timeout: Math.max(1, Number(this.timeout ?? 600))
        },
        onEvent
      );
    } finally {
      bridge.close();
    }

    const outputs: Record<string, unknown> = {};
    const resultBlobs = result.blobs ?? {};
    let fileCount = 0;
    for (const [key, bytes] of Object.entries(resultBlobs)) {
      if (!(bytes instanceof Uint8Array)) continue;
      const { kind, mime } = sniffMedia(bytes);
      fileCount += 1;
      outputs[key] = {
        type: kind,
        uri: "",
        data: Buffer.from(bytes).toString("base64"),
        mimeType: mime
      };
    }

    logLine(
      `ComfyUI workflow completed (${fileCount} file${fileCount === 1 ? "" : "s"})`
    );

    outputs.output = result.outputs ?? {};
    return outputs;
  }
}

export const COMFY_NODES = tagAsServer([
  ComfyWorkflowNode,
  ComfyWorkerWorkflowNode
]);
