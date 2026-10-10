import type { FastifyPluginAsync } from "fastify";
import { createLogger } from "@nodetool-ai/config";
import { WsAdapter } from "../ws-adapter.js";
import { WebSocketClientSession } from "../websocket-client-session.js";
import { createGraphNodeTypeResolver, type NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonBridge } from "@nodetool-ai/runtime";
import {
  PythonNodeExecutor,
  getProvider,
  listRegisteredProviderIds,
  recordRunTraceSecret
} from "@nodetool-ai/runtime";
import type { WorkerManager } from "@nodetool-ai/compute";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";
import type { HttpApiOptions } from "../http-api.js";
import { resolveWorkflowWorkspace } from "../lib/workflow-workspace.js";
import { packWebSocketMessage } from "../messagepack.js";
import type { SdkLiveRunnerRegistry } from "../sdk/sdk-live-runner-registry.js";
import { runTransformersJsModelDownload } from "../model-download-runtime.js";
import type { FrontendRendererRegistry } from "../frontend-renderer-registry.js";
import { runNeedsPythonBridge } from "../python-bridge-gate.js";

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
  return getProvider(providerId.toLowerCase(), async (key) => {
    const value = await getStoredSecret(key, userId);
    recordRunTraceSecret(value);
    return value ?? undefined;
  });
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
    const runner = new WebSocketClientSession({
      userId: req.userId ?? "1",
      authToken: req.authToken ?? undefined,
      // Set only for a visitor to a deployed app's hidden URL. `userId` above
      // is the app's owner in that case, so this is the only thing telling
      // the runner it is not talking to them.
      appSession: req.appSession,
      beforeRunJob: async (graph) => {
        const needsBridge = runNeedsPythonBridge(graph.nodes, {
          bridgeReady: getPythonBridgeReady(),
          bridgeAvailable: pythonBridge.isAvailable(),
          isPythonNodeType: (type) =>
            !!registry.getMetadata(type) && !registry.has(type),
          providerIds: listRegisteredProviderIds
        });
        if (needsBridge) {
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
    // An app visitor's socket is not an SDK execution target for its owner.
    const runnerTargetId = req.appSession
      ? undefined
      : sdkLiveRunnerRegistry?.register(req.userId ?? "1", runner.jobs);
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

  // Download WebSocket endpoint — local development only
  if (!isProduction) {
    // Download WebSocket (HuggingFace model downloads)
    app.get("/ws/download", { websocket: true }, (socket, req) => {
      socket.on("error", (error: Error) => {
        log.error("Download WebSocket error", error);
      });
      log.info("Download WebSocket client connected");

      import("@nodetool-ai/huggingface")
        .then(({ getDownloadManager, resolveWorkerHfToken }) => {
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
                      downloadId,
                      req.userId ?? "1"
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
                const userId = req.userId ?? "1";
                const manager = await getDownloadManager(userId);
                // The token pasted in Settings lives in the secret store, not
                // in this process's environment, so resolve it per user.
                const token = await resolveWorkerHfToken((key) =>
                  getStoredSecret(key, userId)
                );
                await manager.startDownload(repoId, {
                  path: msg.path ?? null,
                  token: token ?? null,
                  allowPatterns: msg.allow_patterns ?? null,
                  ignorePatterns: msg.ignore_patterns ?? null,
                  // No client-chosen cache_dir: the Model Manager, the
                  // download badges and every loader read only the shared
                  // hub cache, so a download elsewhere was invisible.
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
