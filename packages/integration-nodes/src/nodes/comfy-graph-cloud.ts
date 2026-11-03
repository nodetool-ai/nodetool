/**
 * Runner for Comfy workflows (`run_mode: "comfy"`).
 *
 * A Comfy workflow is a NodeTool graph of `comfy.<ClassName>` nodes. The
 * kernel never executes those nodes one by one: `collapseComfyGraph` in
 * `@nodetool-ai/protocol` swaps the whole graph for one
 * {@link ComfyCloudGraphNode}, which compiles it to ComfyUI's API format,
 * submits it to Comfy Cloud through the Comfy API v2 as a single job, and
 * relays the job's live SSE events back to the editor as `node_update` and
 * `node_progress` messages addressed to the original node ids. Those travel
 * over the editor's existing WebSocket, so a Comfy workflow lights up node by
 * node like any other run.
 */

import { Buffer } from "node:buffer";
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  COMFY_CLOUD_GRAPH_NODE_TYPE,
  buildComfyPrompt,
  comfyClassType,
  comfyOutputNames,
  isComfyNodeType,
  type ComfyGraph,
  type ComfyGraphEdge,
  type ComfyGraphNode,
  type ComfyObjectInfo
} from "@nodetool-ai/protocol";
import {
  cloudTransport,
  describeComfyError,
  jobFailure,
  outputFrame,
  type ComfyPrompt,
  type ComfyTransport
} from "./comfy-sdk.js";

/** Comfy Cloud origin. The v2 job API and the v1 node catalog share it. */
export const COMFY_CLOUD_ORIGIN = "https://cloud.comfy.org";

const OBJECT_INFO_TTL_MS = 30 * 60 * 1000;
const objectInfoCache = new Map<
  string,
  { at: number; info: Promise<ComfyObjectInfo> }
>();

/**
 * Comfy Cloud's node catalog (`GET /api/object_info`), cached per API key for
 * half an hour. The catalog is about 10 MB and changes when Comfy deploys.
 */
export function fetchComfyObjectInfo(
  apiKey: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}
): Promise<ComfyObjectInfo> {
  // In-memory only, so the key itself is the cache key; nothing is persisted.
  const key = apiKey;
  const cached = objectInfoCache.get(key);
  if (cached && Date.now() - cached.at < OBJECT_INFO_TTL_MS) {
    return cached.info;
  }
  const doFetch = options.fetchImpl ?? fetch;
  const info = (async () => {
    const res = await doFetch(`${COMFY_CLOUD_ORIGIN}/api/object_info`, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      signal: options.signal
    });
    if (!res.ok) {
      throw new Error(
        `Comfy Cloud node catalog request failed: HTTP ${res.status}`
      );
    }
    return (await res.json()) as ComfyObjectInfo;
  })();
  objectInfoCache.set(key, { at: Date.now(), info });
  info.catch(() => {
    if (objectInfoCache.get(key)?.info === info) objectInfoCache.delete(key);
  });
  return info;
}

/** Test hook: forget cached catalogs. */
export function clearComfyObjectInfoCache(): void {
  objectInfoCache.clear();
}

const TERMINAL = new Set(["succeeded", "canceled", "failed", "expired"]);

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export class ComfyCloudGraphNode extends BaseNode {
  static readonly nodeType = COMFY_CLOUD_GRAPH_NODE_TYPE;
  static readonly title = "Run Comfy Workflow (Comfy Cloud)";
  static readonly description =
    "Runs a whole Comfy workflow on Comfy Cloud as one job through the Comfy API v2.\n    comfy, comfyui, cloud, workflow";
  static readonly hidden = true;
  static readonly supportsDynamicOutputs = true;
  static readonly autoSaveAsset = true;
  static readonly requiredSettings = ["COMFY_API_KEY"];
  static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    title: "Nodes",
    description: "The Comfy workflow's `comfy.*` nodes."
  })
  declare nodes: ComfyGraphNode[];

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    title: "Edges",
    description: "The Comfy workflow's edges."
  })
  declare edges: ComfyGraphEdge[];

  @prop({
    type: "int",
    default: 1800,
    title: "Timeout",
    description: "Maximum seconds to wait for the job to finish.",
    min: 1
  })
  declare timeout: number;

  /** Split out so tests run without a Comfy Cloud account. */
  protected createTransport(apiKey: string): ComfyTransport {
    return cloudTransport(apiKey);
  }

  /** Split out so tests run without a Comfy Cloud account. */
  protected loadObjectInfo(
    apiKey: string,
    signal: AbortSignal
  ): Promise<ComfyObjectInfo> {
    return fetchComfyObjectInfo(apiKey, { signal });
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const merged: Record<string, unknown> = {};
    for await (const frame of this.genProcess(context)) {
      Object.assign(merged, frame);
    }
    return merged;
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const apiKey = this._secrets.COMFY_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "COMFY_API_KEY is required to run a Comfy workflow. Add it in Settings; get a key at https://platform.comfy.org."
      );
    }
    const graph: ComfyGraph = {
      nodes: (Array.isArray(this.nodes) ? this.nodes : []).filter((n) =>
        isComfyNodeType(n?.type)
      ),
      edges: Array.isArray(this.edges) ? this.edges : []
    };
    if (graph.nodes.length === 0) {
      throw new Error("The Comfy workflow has no ComfyUI nodes to run.");
    }

    const timeoutSeconds = Math.max(1, this.timeout);
    const timeoutSignal = AbortSignal.timeout(timeoutSeconds * 1000);
    const signal = context?.signal
      ? AbortSignal.any([context.signal, timeoutSignal])
      : timeoutSignal;

    const runnerId = this.__node_id;
    const runnerName = this.__node_name || ComfyCloudGraphNode.title;
    const log = (
      content: string,
      severity: "info" | "warning" | "error" = "info"
    ): void => {
      context?.postMessage({
        type: "log_update",
        node_id: runnerId,
        node_name: runnerName,
        content,
        severity
      });
    };

    const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
    const lastStatus = new Map<string, string>();
    const nameOf = (node: ComfyGraphNode): string => {
      const title = node.ui_properties?.title;
      return typeof title === "string" && title ? title : comfyClassType(node.type);
    };
    const nodeUpdate = (
      nodeId: string,
      status: string,
      extra: Record<string, unknown> = {}
    ): void => {
      const node = nodesById.get(nodeId);
      if (!node) return;
      // A repeat of the same status carries nothing new for the editor.
      if (lastStatus.get(nodeId) === status && Object.keys(extra).length === 0) return;
      lastStatus.set(nodeId, status);
      context?.postMessage({
        type: "node_update",
        node_id: nodeId,
        node_name: nameOf(node),
        node_type: node.type,
        status,
        ...extra
      });
    };

    let info: ComfyObjectInfo;
    try {
      info = await this.loadObjectInfo(apiKey, signal);
    } catch (err) {
      throw describeComfyError(err);
    }
    const unknown = graph.nodes
      .map((n) => comfyClassType(n.type))
      .filter((cls) => !(cls in info));
    if (unknown.length > 0) {
      throw new Error(
        `Comfy Cloud does not have these node classes: ${[...new Set(unknown)].join(", ")}`
      );
    }
    const prompt = buildComfyPrompt(graph, (cls) =>
      info[cls] ? comfyOutputNames(info[cls]) : undefined
    ) as ComfyPrompt;

    for (const node of graph.nodes) nodeUpdate(node.id, "queued");
    log(`Submitting Comfy workflow to Comfy Cloud (${graph.nodes.length} nodes)`);

    const transport = this.createTransport(apiKey);
    let job;
    try {
      job = await transport.submit(prompt, { signal, apiKey });
    } catch (err) {
      const error = describeComfyError(err);
      for (const node of graph.nodes) nodeUpdate(node.id, "error", { error: error.message });
      throw error;
    }
    log(`Comfy job ${job.id} submitted`);

    const onAbort = (): void => {
      void job.cancel().catch(() => {
        // A finished job stays terminal; nothing to undo.
      });
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });

    const done = new Set<string>();
    let active: string | null = null;
    const finish = (nodeId: string | null): void => {
      if (!nodeId || done.has(nodeId)) return;
      done.add(nodeId);
      nodeUpdate(nodeId, "completed");
    };
    const emitted = new Set<string>();
    let fileCount = 0;
    let terminal: string | null = null;
    let runningMarked = false;

    const emitOutput = async (
      output: Parameters<typeof outputFrame>[0]
    ): Promise<Record<string, unknown>> => {
      const frame = await outputFrame(output, signal);
      const value = Object.values(frame)[0] as
        | { type?: string; data?: string; mimeType?: string }
        | string
        | undefined;
      // The editor shows the file inline on the Comfy node that saved it.
      const shown =
        value && typeof value === "object" && value.data
          ? { type: value.type, uri: `data:${value.mimeType ?? "application/octet-stream"};base64,${value.data}` }
          : value;
      done.add(output.nodeId);
      nodeUpdate(output.nodeId, "completed", { result: { output: shown } });
      return frame;
    };

    try {
      for await (const event of job.events(signal)) {
        switch (event.kind) {
          case "statusChange":
            log(
              event.queuePosition === null
                ? `Status: ${event.status}`
                : `Status: ${event.status} (queue position ${event.queuePosition})`
            );
            if (TERMINAL.has(event.status)) terminal = event.status;
            // Comfy Cloud does not always name the node it is executing, so
            // once the job leaves the queue every pending node shows running
            // until progress names one or the job finishes.
            if (event.status === "running" && !runningMarked) {
              runningMarked = true;
              for (const node of graph.nodes) {
                if (!done.has(node.id)) nodeUpdate(node.id, "running");
              }
            }
            break;
          case "progress": {
            const current = event.currentNode;
            if (current && current !== active) {
              finish(active);
              active = current;
              nodeUpdate(current, "running");
            }
            if (active && event.step !== null && event.steps !== null && event.steps > 0) {
              context?.postMessage({
                type: "node_progress",
                node_id: active,
                progress: event.step,
                total: event.steps
              });
            }
            context?.postMessage({
              type: "node_progress",
              node_id: runnerId,
              progress: Math.round(event.value * 100),
              total: 100
            });
            break;
          }
          case "preview": {
            const uri = `data:${event.contentType};base64,${Buffer.from(event.data).toString("base64")}`;
            nodeUpdate(event.nodeId, "running", {
              result: { output: { type: "image", uri } }
            });
            break;
          }
          case "outputReady": {
            fileCount += 1;
            emitted.add(event.output.id);
            log(`Output from #${event.output.nodeId} (${event.output.name})`);
            yield await emitOutput(event.output);
            break;
          }
          case "log":
            log(event.message, event.level === "error" ? "error" : "info");
            break;
        }
      }
    } catch (err) {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) {
        if (timeoutSignal.aborted && !context?.signal?.aborted) {
          throw new Error(`Comfy Cloud job did not finish within ${timeoutSeconds}s`);
        }
        throw abortError(`Comfy job ${job.id} was canceled`);
      }
      throw describeComfyError(err);
    }
    signal.removeEventListener("abort", onAbort);

    await job.refresh(signal);
    const status = TERMINAL.has(job.status) ? job.status : (terminal ?? job.status);
    if (status === "canceled" || status === "canceling") {
      throw abortError(`Comfy job ${job.id} was canceled`);
    }
    if (status !== "succeeded") {
      const error =
        status === "failed" ? jobFailure(job) : new Error(`Comfy job ${job.id} ended ${status}`);
      const failedNode = job.error?.node_id ?? active;
      if (failedNode) nodeUpdate(String(failedNode), "error", { error: error.message });
      log(error.message, "error");
      throw error;
    }

    for (const output of job.outputs) {
      if (emitted.has(output.id)) continue;
      fileCount += 1;
      yield await emitOutput(output);
    }
    // Nodes Comfy served from cache never report progress; the job finished,
    // so every node did too.
    for (const node of graph.nodes) finish(node.id);
    log(`Comfy job ${job.id} completed (${fileCount} file${fileCount === 1 ? "" : "s"})`);

    yield {
      output: {
        job_id: job.id,
        status,
        outputs: job.outputs.map((o) => ({
          node_id: o.nodeId,
          name: o.name,
          type: o.type,
          content_type: o.contentType,
          asset_id: o.id
        }))
      }
    };
  }
}
