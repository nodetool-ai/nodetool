/**
 * Runner for Comfy workflows (`run_mode: "comfy"`).
 *
 * A Comfy workflow is a NodeTool graph of `comfy.<ClassName>` nodes. The
 * kernel never executes those nodes one by one: `collapseComfyGraph` in
 * `@nodetool-ai/protocol` swaps the whole graph for one
 * {@link ComfyCloudGraphNode}, which compiles it to ComfyUI's API format,
 * submits it to Comfy Cloud through the Comfy API v2 as a single job, and
 * relays the job's live events back to the editor as `node_update` and
 * `node_progress` messages addressed to the original node ids. Those travel
 * over the editor's existing WebSocket, so a Comfy workflow lights up node by
 * node like any other run.
 *
 * The v2 SSE stream carries job status and outputs, but Comfy Cloud leaves its
 * `current_node` empty. Per-node state comes from the Cloud WebSocket, which
 * reports every job of the account, so its frames are filtered by prompt id.
 * That socket only adds detail: a run without it still finishes and saves.
 *
 * `resolveComfyTarget` selects Comfy Cloud, a self-hosted ComfyUI or a NodeTool
 * ComfyUI worker. The target only changes the transport and the node catalog.
 */

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
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
  applyComfyInputs,
  cloudTransport,
  describeComfyError,
  jobFailure,
  extFromUri,
  outputFrame,
  type ComfyOutput,
  type ComfyPrompt,
  type ComfyTransport
} from "./comfy-sdk.js";
import { serverTransport } from "./comfy-server-transport.js";
import {
  describeComfyTarget,
  normalizeComfyServerUrl,
  resolveComfyTarget,
  type ComfyTarget
} from "./comfy-target.js";
import {
  fetchComfyWorkerObjectInfo,
  workerTransport
} from "./comfy-worker-transport.js";

export {
  describeComfyTarget,
  normalizeComfyServerUrl,
  resolveComfyTarget,
  type ComfyTarget
} from "./comfy-target.js";

/** Comfy Cloud origin. The v2 job API and the v1 node catalog share it. */
export const COMFY_CLOUD_ORIGIN = "https://cloud.comfy.org";

const OBJECT_INFO_TTL_MS = 30 * 60 * 1000;
const SERVER_OBJECT_INFO_TTL_MS = 30 * 1000;
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
  const doFetch = options.fetchImpl ?? fetch;
  return cachedObjectInfo(apiKey, OBJECT_INFO_TTL_MS, async () => {
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
  });
}

function cachedObjectInfo(
  key: string,
  ttlMs: number,
  load: () => Promise<ComfyObjectInfo>
): Promise<ComfyObjectInfo> {
  const cached = objectInfoCache.get(key);
  if (cached && Date.now() - cached.at < ttlMs) {
    return cached.info;
  }
  const info = load();
  objectInfoCache.set(key, { at: Date.now(), info });
  info.catch(() => {
    if (objectInfoCache.get(key)?.info === info) objectInfoCache.delete(key);
  });
  return info;
}

/**
 * A self-hosted ComfyUI's node catalog. It is cached briefly, because a restart
 * of the server can add custom nodes and models.
 */
export function fetchComfyServerObjectInfo(
  serverUrl: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}
): Promise<ComfyObjectInfo> {
  const url = normalizeComfyServerUrl(serverUrl);
  const doFetch = options.fetchImpl ?? fetch;
  return cachedObjectInfo(url, SERVER_OBJECT_INFO_TTL_MS, async () => {
    let res: Response;
    try {
      res = await doFetch(`${url}/object_info`, {
        headers: { Accept: "application/json" },
        signal: options.signal
      });
    } catch (err) {
      throw new Error(
        `Could not reach the ComfyUI server at ${url}. Start it or correct COMFY_SERVER_URL in Settings. (${err instanceof Error ? err.message : String(err)})`
      );
    }
    if (!res.ok) {
      const hint =
        res.status === 404
          ? " ComfyUI may still be starting, or this URL may not be a ComfyUI server."
          : "";
      throw new Error(`The ComfyUI server at ${url} returned HTTP ${res.status} for its node catalog.${hint}`);
    }
    return (await res.json()) as ComfyObjectInfo;
  });
}

/** A ComfyUI worker's node catalog, cached briefly like a server's. */
export function fetchComfyWorkerCatalog(
  url: string,
  token?: string
): Promise<ComfyObjectInfo> {
  return cachedObjectInfo(
    `worker:${url}`,
    SERVER_OBJECT_INFO_TTL_MS,
    async () => (await fetchComfyWorkerObjectInfo(url, token)) as ComfyObjectInfo
  );
}

/** The node catalog of the selected target. */
export function fetchComfyTargetCatalog(
  target: ComfyTarget,
  options: { signal?: AbortSignal } = {}
): Promise<ComfyObjectInfo> {
  switch (target.kind) {
    case "cloud":
      return fetchComfyObjectInfo(target.apiKey, options);
    case "server":
      return fetchComfyServerObjectInfo(target.url, options);
    case "worker":
      return fetchComfyWorkerCatalog(target.url, target.token);
  }
}

/** Test hook: forget cached catalogs. */
export function clearComfyObjectInfoCache(): void {
  objectInfoCache.clear();
}

/** A JSON frame of Comfy Cloud's account WebSocket. Only the fields read here. */
export interface ComfyLiveFrame {
  type?: string;
  data?: {
    prompt_id?: string;
    nodes?:
      | string[]
      | Record<
          string,
          {
            node_id?: string;
            display_node_id?: string;
            state?: string;
            value?: number;
            max?: number;
          }
        >;
  };
}

const TERMINAL = new Set(["succeeded", "canceled", "failed", "expired"]);

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export class ComfyCloudGraphNode extends BaseNode {
  static readonly nodeType = COMFY_CLOUD_GRAPH_NODE_TYPE;
  static readonly title = "Run Comfy Workflow";
  static readonly description =
    "Runs a whole Comfy workflow as one job on the target in COMFY_TARGET: Comfy Cloud, a ComfyUI server or a ComfyUI worker.\n    comfy, comfyui, cloud, workflow";
  static readonly hidden = true;
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;
  static readonly autoSaveAsset = true;
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
    type: "list[str]",
    default: [],
    title: "Output Slots",
    description: "The `<comfyNodeId>:<handle>` slots that workflow Output nodes read."
  })
  declare output_slots: string[];

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

  /** Split out so tests can reach a local server through a real executor. */
  protected createServerTransport(url: string, timeoutMs: number): ComfyTransport {
    return serverTransport(url, timeoutMs);
  }

  /** Split out so tests run without a ComfyUI server. */
  protected loadServerObjectInfo(
    url: string,
    signal: AbortSignal
  ): Promise<ComfyObjectInfo> {
    return fetchComfyServerObjectInfo(url, { signal });
  }

  /** Split out so tests run without a worker. */
  protected openWorkerTransport(
    url: string,
    token: string | undefined,
    timeoutSeconds: number
  ): Promise<ComfyTransport> {
    return workerTransport(url, token, timeoutSeconds);
  }

  /** Split out so tests run without a worker. */
  protected loadWorkerObjectInfo(
    url: string,
    token: string | undefined
  ): Promise<ComfyObjectInfo> {
    return fetchComfyWorkerCatalog(url, token);
  }

  /**
   * Open the account WebSocket and hand each JSON frame to `onFrame`. Returns
   * the function that closes it. Split out so tests run without a socket. The
   * URL holds the API key, so it never goes into a log line.
   */
  protected openLiveFrames(
    apiKey: string,
    onFrame: (frame: ComfyLiveFrame) => void,
    onUnavailable: () => void
  ): () => void {
    const url = new URL("/ws", COMFY_CLOUD_ORIGIN);
    url.protocol = "wss:";
    url.searchParams.set("clientId", randomUUID());
    url.searchParams.set("token", apiKey);
    const socket = new WebSocket(url);
    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      // Binary frames are preview bitmaps, which the SSE stream also carries.
      if (typeof event.data !== "string") return;
      try {
        onFrame(JSON.parse(event.data) as ComfyLiveFrame);
      } catch {
        // A malformed status frame costs one update, not the run.
      }
    });
    socket.addEventListener("error", onUnavailable);
    return () => socket.close();
  }

  /**
   * Save one output file as an asset of the Comfy node that produced it, so it
   * appears in the assets panel and in that node's history. A failed save keeps
   * the bytes on the frame: the job has already been paid for.
   */
  private async saveOutput(
    output: ComfyOutput,
    frame: Record<string, unknown>,
    context: ProcessingContext | undefined,
    warn: (content: string) => void
  ): Promise<Record<string, unknown>> {
    const [slot, value] = Object.entries(frame)[0] ?? [];
    const ref = value as { type?: string; data?: string; mimeType?: string } | undefined;
    if (!slot || !ref?.data || !context?.hasModelInterface?.("createAsset")) {
      return frame;
    }
    try {
      const created = (await context.createAsset({
        name: output.name,
        contentType: output.contentType,
        content: Buffer.from(ref.data, "base64"),
        nodeId: output.nodeId,
        metadata: { output_name: "output" }
      })) as { id?: unknown };
      if (typeof created?.id !== "string") return frame;
      const ext = extFromUri(output.name);
      return {
        [slot]: {
          type: ref.type,
          uri: `asset://${created.id}${ext ? `.${ext}` : ""}`,
          asset_id: created.id,
          mimeType: ref.mimeType
        }
      };
    } catch (err) {
      warn(
        `Could not save ${output.name} as an asset: ${err instanceof Error ? err.message : String(err)}`
      );
      return frame;
    }
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
    const live = { close: (): void => {} };
    try {
      yield* this.runJob(context, live);
    } finally {
      live.close();
    }
  }

  private async *runJob(
    context: ProcessingContext | undefined,
    live: { close: () => void }
  ): AsyncGenerator<Record<string, unknown>> {
    const target = await resolveComfyTarget(async (key) =>
      key === "COMFY_API_KEY"
        ? this._secrets.COMFY_API_KEY?.trim() || context?.getSecret(key)
        : context?.getSecret(key)
    );
    const where = describeComfyTarget(target);
    const apiKey = target.kind === "cloud" ? target.apiKey : undefined;
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
      info =
        target.kind === "server"
          ? await this.loadServerObjectInfo(target.url, signal)
          : target.kind === "worker"
            ? await this.loadWorkerObjectInfo(target.url, target.token)
            : await this.loadObjectInfo(target.apiKey, signal);
    } catch (err) {
      throw describeComfyError(err);
    }
    const unknown = graph.nodes
      .map((n) => comfyClassType(n.type))
      .filter((cls) => !(cls in info));
    if (unknown.length > 0) {
      throw new Error(
        `${where} does not have these node classes: ${[...new Set(unknown)].join(", ")}`
      );
    }
    // A Comfy job returns files only for its output nodes, so a socket wired to
    // an Output would stay empty for the whole run.
    for (const slot of Array.isArray(this.output_slots) ? this.output_slots : []) {
      const sep = slot.indexOf(":");
      const source = nodesById.get(slot.slice(0, sep));
      const entry = source ? info[comfyClassType(source.type)] : undefined;
      if (slot.slice(sep + 1) !== "output" || entry?.output_node !== true) {
        throw new Error(
          `A workflow Output reads ${slot}, which Comfy does not return. Connect the Output to a Save node.`
        );
      }
    }
    const prompt = buildComfyPrompt(graph, (cls) =>
      info[cls] ? comfyOutputNames(info[cls]) : undefined
    ) as ComfyPrompt;

    const transport =
      target.kind === "server"
        ? this.createServerTransport(target.url, timeoutSeconds * 1000)
        : target.kind === "worker"
          ? await this.openWorkerTransport(target.url, target.token, timeoutSeconds)
          : this.createTransport(target.apiKey);
    await applyComfyInputs(prompt, this.dynamicProps, transport, context);

    for (const node of graph.nodes) nodeUpdate(node.id, "queued");
    log(`Submitting Comfy workflow to ${where} (${graph.nodes.length} nodes)`);

    const done = new Set<string>();
    const finish = (nodeId: string | null): void => {
      if (!nodeId || done.has(nodeId)) return;
      done.add(nodeId);
      nodeUpdate(nodeId, "completed");
    };

    // Frames can beat the submit response, so they wait for the job id.
    let liveJobId: string | null = null;
    let liveSeen = false;
    const earlyFrames: ComfyLiveFrame[] = [];
    const lastNodeProgress = new Map<string, number>();
    const applyLiveFrame = (frame: ComfyLiveFrame): void => {
      const nodes = frame.data?.nodes;
      if (frame.type === "execution_cached" && Array.isArray(nodes)) {
        liveSeen = true;
        for (const id of nodes) finish(String(id));
      }
      if (frame.type !== "progress_state" || !nodes || Array.isArray(nodes)) return;
      liveSeen = true;
      for (const [key, state] of Object.entries(nodes)) {
        const id = state.display_node_id ?? state.node_id ?? key;
        if (state.state === "finished") {
          finish(id);
        } else if (state.state === "running" && !done.has(id)) {
          nodeUpdate(id, "running");
          const { value, max } = state;
          if (
            typeof value === "number" &&
            typeof max === "number" &&
            max > 1 &&
            lastNodeProgress.get(id) !== value
          ) {
            lastNodeProgress.set(id, value);
            context?.postMessage({
              type: "node_progress",
              node_id: id,
              progress: value,
              total: max
            });
          }
        }
      }
    };
    // A self-hosted or worker job reports its nodes through its own events.
    if (apiKey) try {
      live.close = this.openLiveFrames(
        apiKey,
        (frame) => {
          const promptId = frame.data?.prompt_id;
          if (!promptId) return;
          if (liveJobId === null) earlyFrames.push(frame);
          else if (promptId === liveJobId) applyLiveFrame(frame);
        },
        () => log("Live node status is unavailable for this run", "warning")
      );
    } catch {
      log("Live node status is unavailable for this run", "warning");
    }

    let job;
    try {
      job = await transport.submit(prompt, { signal, apiKey });
    } catch (err) {
      const error = describeComfyError(err);
      for (const node of graph.nodes) nodeUpdate(node.id, "error", { error: error.message });
      throw error;
    }
    log(`Comfy job ${job.id} submitted`);
    liveJobId = job.id;
    for (const frame of earlyFrames.splice(0)) {
      if (frame.data?.prompt_id === liveJobId) applyLiveFrame(frame);
    }

    const onAbort = (): void => {
      void job.cancel().catch(() => {
        // A finished job stays terminal; nothing to undo.
      });
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });

    let active: string | null = null;
    const emitted = new Set<string>();
    let fileCount = 0;
    let terminal: string | null = null;
    let runningMarked = false;

    const emitOutput = async (
      output: ComfyOutput
    ): Promise<Record<string, unknown>> => {
      const frame = await this.saveOutput(
        output,
        await outputFrame(output, signal),
        context,
        (content) => log(content, "warning")
      );
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
      // A workflow Output reads the node's `output` handle.
      return { ...frame, [`${output.nodeId}:output`]: Object.values(frame)[0] };
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
            // Without the live socket nothing names the executing node, so once
            // the job leaves the queue every pending node shows running until
            // progress names one or the job finishes.
            if (event.status === "running" && !runningMarked && !liveSeen) {
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
          throw new Error(`Comfy job did not finish within ${timeoutSeconds}s`);
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
