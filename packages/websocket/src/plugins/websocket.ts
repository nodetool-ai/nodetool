import type { FastifyPluginAsync } from "fastify";
import { createLogger } from "@nodetool-ai/config";
import { WsAdapter } from "../ws-adapter.js";
import { UnifiedWebSocketRunner } from "../unified-websocket-runner.js";
import { createGraphNodeTypeResolver, type NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonBridge } from "@nodetool-ai/runtime";
import { PythonNodeExecutor, getProvider } from "@nodetool-ai/runtime";
import type { WorkerManager } from "@nodetool-ai/compute";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";
import type { HttpApiOptions } from "../http-api.js";
import { resolveWorkflowWorkspace } from "../lib/workflow-workspace.js";
import {
  extensionBridge,
  type ExtensionSocket
} from "../extension-cdp-bridge.js";
import { setExtensionChannelProvider } from "@nodetool-ai/automation-nodes/lib/extension-channel-provider";
import { packWebSocketMessage } from "../messagepack.js";
import type { SdkLiveRunnerRegistry } from "../sdk/sdk-live-runner-registry.js";
import { runTransformersJsModelDownload } from "../model-download-runtime.js";
import type { FrontendRendererRegistry } from "../frontend-renderer-registry.js";

const log = createLogger("nodetool.websocket.ws");

export interface WebSocketPluginOptions {
  registry: NodeRegistry;
  /**
   * Stable Python bridge reference. A SwappableBridge whose target follows an
   * attached worker, so a worker attached mid-connection automatically reroutes
   * execution and downloads to it — no live re-read needed.
   */
  pythonBridge: PythonBridge;
  getPythonBridgeReady: () => boolean;
  ensurePythonBridge: () => Promise<void>;
  /** Forwarded to the runner for read-only RPC commands (list_workflows, …). */
  apiOptions: HttpApiOptions;
  sdkLiveRunnerRegistry?: SdkLiveRunnerRegistry;
  /** Registry of browser renderers attached to the normal /ws connection. */
  frontendRendererRegistry?: FrontendRendererRegistry;
  /**
   * Worker provisioning orchestrator. Present when the server is wired with a
   * worker subsystem; enables `scope: "worker"` model downloads on /ws/download.
   */
  workerManager?: WorkerManager;
}

async function resolveProvider(providerId: string, userId: string) {
  return getProvider(providerId.toLowerCase(), (key) =>
    getStoredSecret(key, userId).then((v) => v ?? undefined)
  );
}

const isProduction = process.env["NODETOOL_ENV"] === "production";

/**
 * Drive a Transformers.js download to completion, forwarding progress events
 * to the connected websocket in the same shape the HF download manager emits.
 *
 * The TJS runtime gives us per-file progress (file/loaded/total). We sum
 * loaded/total across files we've seen so the UI's aggregate bar tracks the
 * total bytes pulled from the Hub.
 */
interface WsSendable {
  send: (data: string) => void;
}

async function handleTjsDownload(
  socket: WsSendable,
  repoId: string,
  modelType: string,
  aborts: Map<string, AbortController>
): Promise<void> {
  const abort = new AbortController();
  aborts.set(repoId, abort);
  try {
    await runTransformersJsModelDownload(
      repoId,
      modelType,
      abort.signal,
      (update) => {
        try {
          socket.send(JSON.stringify(update));
        } catch {
          /* socket gone */
        }
      }
    );
  } finally {
    aborts.delete(repoId);
  }
}

const websocketPlugin: FastifyPluginAsync<WebSocketPluginOptions> = async (
  app,
  opts
) => {
  const {
    registry,
    pythonBridge,
    getPythonBridgeReady,
    ensurePythonBridge,
    apiOptions,
    sdkLiveRunnerRegistry,
    frontendRendererRegistry,
    workerManager
  } = opts;
  const graphNodeTypeResolver = createGraphNodeTypeResolver(registry);

  // Main workflow/chat WebSocket
  app.get("/ws", { websocket: true }, (socket, req) => {
    socket.on("error", (error: Error) => {
      log.error("WebSocket client error", error);
    });
    const runner = new UnifiedWebSocketRunner({
      userId: req.userId ?? "1",
      authToken: req.authToken ?? undefined,
      beforeRunJob: async (graph) => {
        if (getPythonBridgeReady()) return;
        const hasPythonNode = graph.nodes.some((n) => {
          const type = typeof n.type === "string" ? n.type : "";
          return registry.getMetadata(type) && !registry.has(type);
        });
        if (hasPythonNode) {
          await ensurePythonBridge();
        }
      },
      resolveExecutor: (node) => {
        if (registry.has(node.type)) {
          return registry.resolve(node);
        }
        // The bridge is the swappable reference: an attached worker becomes its
        // target, so Python nodes run on the worker even if this connection
        // predates the attach.
        if (getPythonBridgeReady() && pythonBridge.hasNodeType(node.type)) {
          const meta = pythonBridge
            .getNodeMetadata()
            .find((n) => n.node_type === node.type);
          const nodeRec = node;
          const props = (nodeRec.properties ?? nodeRec.data ?? {}) as Record<
            string,
            unknown
          >;
          return new PythonNodeExecutor(
            pythonBridge,
            node.type,
            props,
            Object.fromEntries(
              (meta?.outputs ?? []).map((o) => [o.name, o.type.type])
            ),
            meta?.required_settings ?? [],
            node.id,
            meta?.requires_vram_gb
          );
        }
        if (registry.getMetadata(node.type) && !registry.has(node.type)) {
          const stderrSummary = (
            pythonBridge
          ).getRecentStderrSummary?.() ?? null;
          const loadErrors = (
            pythonBridge
          ).getLoadErrors?.() ?? [];
          const matchingLoadError = loadErrors.find((entry) => {
            if (entry.module.includes(node.type)) return true;
            const suffix = entry.module.split(".").slice(2).join(".");
            // An empty suffix makes startsWith("") match every node type,
            // blaming an unrelated import failure. Require a non-empty prefix.
            return suffix.length > 0 && node.type.startsWith(suffix);
          });
          throw new Error(
            getPythonBridgeReady()
              ? `Python node "${node.type}" cannot execute: it is declared in metadata but was not loaded by the Python worker.${matchingLoadError ? ` Load error: ${matchingLoadError.module}: ${matchingLoadError.error}.` : stderrSummary ? ` Recent Python worker stderr: ${stderrSummary}` : " Check Python worker status/load errors for import failures."}`
              : `Python node "${node.type}" cannot execute: Python worker is not connected.${stderrSummary ? ` Recent Python worker stderr: ${stderrSummary}` : ""}`
          );
        }
        return registry.resolve(node);
      },
      resolveNodeType: graphNodeTypeResolver,
      resolveProvider,
      workspaceResolver: resolveWorkflowWorkspace,
      getNodeMetadata: (nodeType) => registry.getMetadata(nodeType),
      validateNode: registry.createNodeValidator(),
      nodeRegistry: registry,
      pythonBridge,
      getPythonBridgeReady,
      apiOptions,
      frontendRendererRegistry
    });
    const runnerTargetId = sdkLiveRunnerRegistry?.register(
      req.userId ?? "1",
      runner
    );
    if (runnerTargetId) {
      try {
        socket.send(
          packWebSocketMessage({
            type: "sdk_execution_target",
            runner_id: runnerTargetId
          })
        );
      } catch {
        sdkLiveRunnerRegistry?.unregister(runnerTargetId);
        return;
      }
    }
    log.info("WebSocket client connected");
    void runner
      .run(new WsAdapter(socket))
      .catch((error) => {
        log.error(
          "Runner crashed",
          error instanceof Error ? error : new Error(String(error))
        );
      })
      .finally(() => {
        if (runnerTargetId)
          sdkLiveRunnerRegistry?.unregister(runnerTargetId);
      });
  });

  // Chrome-extension CDP side channel.
  //
  // JSON text frames (NOT MsgPack — the main /ws stays MsgPack). The extension
  // connects here after the user clicks "Attach to this tab" in the popup; the
  // in-process action loop rides the channel via `extensionBridge.getChannel()`.
  // Auth/localhost-bypass is handled by the global onRequest hook in server.ts
  // (the /ws prefix is exempt from static-asset bypass and subject to the same
  // localhost rule as /ws).
  //
  // v1 is single-connection: a new socket replaces any existing one.
  //
  // Register the in-process channel factory so the browser action loop running
  // in this server rides the bridge instead of opening its own client WS. The
  // dependency points websocket → automation-nodes (no cycle).
  //
  // This is an unauthenticated, single-connection side channel: whoever connects
  // to /ws/extension becomes THE extension socket and can proxy CDP through this
  // server. It is disabled in production by default; set
  // NODETOOL_ENABLE_EXTENSION_BRIDGE=1 to opt back in for deployments that
  // actually use the browser extension.
  const extensionBridgeEnabled =
    !isProduction ||
    process.env["NODETOOL_ENABLE_EXTENSION_BRIDGE"] === "1";

  if (extensionBridgeEnabled) {
    setExtensionChannelProvider(() => extensionBridge.getChannel());

    app.get("/ws/extension", { websocket: true }, (socket, _req) => {
      // The @fastify/websocket socket satisfies the ExtensionSocket surface
      // (send(string) / close() / on("message"|"close"|"error")).
      // SAFETY: the @fastify/websocket socket satisfies the ExtensionSocket
      // surface — send(string) / close() / on("message"|"close"|"error").
      const extSocket = socket as ExtensionSocket;
      socket.on("error", (error: Error) => {
        log.error("Extension WebSocket error", error);
      });
      log.info("Extension WebSocket client connected");
      extensionBridge.registerSocket(extSocket);
      socket.on("close", () => {
        extensionBridge.clear(extSocket);
        log.info("Extension WebSocket client disconnected");
      });
    });
  } else {
    log.info(
      "Extension CDP bridge (/ws/extension) disabled in production; set NODETOOL_ENABLE_EXTENSION_BRIDGE=1 to enable"
    );
  }

  // Download WebSocket endpoint — local development only
  if (!isProduction) {
    // Download WebSocket (HuggingFace model downloads)
    app.get("/ws/download", { websocket: true }, (socket, req) => {
      socket.on("error", (error: Error) => {
        log.error("Download WebSocket error", error);
      });
      log.info("Download WebSocket client connected");

      import("@nodetool-ai/huggingface")
        .then(({ getDownloadManager }) => {
          // TJS downloads are bookkept here so cancel can abort them.
          const tjsAborts = new Map<string, AbortController>();
          // In-flight worker-scoped downloads, keyed by the same composite id
          // the web uses for cancel (`path ? repo/path : repo`), so a
          // cancel_download can be routed to the bridge instead of the local
          // download manager.
          const workerDownloads = new Set<string>();

          socket.on("message", async (raw: Buffer | ArrayBuffer | Buffer[]) => {
            try {
              const msg = JSON.parse(raw.toString());
              if (msg.command === "start_download") {
                const repoId: string = msg.repo_id ?? "";
                const modelType: string | null = msg.model_type ?? null;
                if (msg.scope === "worker") {
                  const { relayWorkerDownload } = await import(
                    "../models-api.js"
                  );
                  const downloadId = msg.path
                    ? `${repoId}/${msg.path}`
                    : repoId;
                  workerDownloads.add(downloadId);
                  try {
                    await relayWorkerDownload(
                      socket,
                      pythonBridge,
                      workerManager,
                      msg,
                      downloadId
                    );
                  } finally {
                    workerDownloads.delete(downloadId);
                  }
                  return;
                }
                if (modelType && modelType.startsWith("tjs.")) {
                  await handleTjsDownload(socket, repoId, modelType, tjsAborts);
                  return;
                }
                const manager = await getDownloadManager(req.userId ?? "1");
                await manager.startDownload(repoId, {
                  path: msg.path ?? null,
                  allowPatterns: msg.allow_patterns ?? null,
                  ignorePatterns: msg.ignore_patterns ?? null,
                  cacheDir: msg.cache_dir ?? null,
                  modelType,
                  onProgress: (update) => {
                    try {
                      socket.send(JSON.stringify(update));
                    } catch {
                      /* gone */
                    }
                  }
                });
              } else if (msg.command === "cancel_download") {
                const id: string = msg.repo_id ?? msg.id ?? "";
                const tjsAbort = tjsAborts.get(id);
                if (tjsAbort) {
                  tjsAbort.abort();
                  tjsAborts.delete(id);
                  return;
                }
                if (workerDownloads.has(id)) {
                  // Worker-scoped download: signal cancel over the bridge so the
                  // remote worker stops (the relay's downloadModel promise then
                  // settles with a cancelled terminal frame and is cleaned up).
                  pythonBridge?.cancelModelDownload(id);
                  return;
                }
                const manager = await getDownloadManager(req.userId ?? "1");
                manager.cancelDownload(id);
              }
            } catch (err) {
              const error = err instanceof Error ? err.message : String(err);
              try {
                socket.send(JSON.stringify({ status: "error", error }));
              } catch {
                /* gone */
              }
            }
          });
        })
        .catch((err: unknown) => {
          log.error(
            "Failed to load @nodetool-ai/huggingface",
            err instanceof Error ? err : new Error(String(err))
          );
          try {
            socket.send(
              JSON.stringify({
                status: "error",
                error: "Download module unavailable"
              })
            );
            socket.close();
          } catch {
            /* socket already gone */
          }
        });
    });
  }
};

export default websocketPlugin;
