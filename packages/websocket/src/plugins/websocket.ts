import type { FastifyPluginAsync } from "fastify";
import { createLogger } from "@nodetool-ai/config";
import { WsAdapter } from "../ws-adapter.js";
import { UnifiedWebSocketRunner } from "../unified-websocket-runner.js";
import { createGraphNodeTypeResolver, type NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonStdioBridge } from "@nodetool-ai/runtime";
import { PythonNodeExecutor, getProvider } from "@nodetool-ai/runtime";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";
import type { HttpApiOptions } from "../http-api.js";
import {
  extensionBridge,
  type ExtensionSocket
} from "../extension-cdp-bridge.js";
import { setExtensionChannelProvider } from "@nodetool-ai/automation-nodes/lib/extension-channel-provider";

const log = createLogger("nodetool.websocket.ws");

export interface WebSocketPluginOptions {
  registry: NodeRegistry;
  pythonBridge: PythonStdioBridge;
  getPythonBridgeReady: () => boolean;
  ensurePythonBridge: () => Promise<void>;
  /** Forwarded to the runner for read-only RPC commands (list_workflows, …). */
  apiOptions: HttpApiOptions;
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
  const tjs = await import("@nodetool-ai/transformers-js-nodes");
  const abort = new AbortController();
  aborts.set(repoId, abort);

  // Track total/loaded across all files the TJS runtime touches.
  const fileTotals = new Map<string, { loaded: number; total: number }>();
  const completedFiles = new Set<string>();

  const sendProgress = (status: string, error?: string) => {
    let downloadedBytes = 0;
    let totalBytes = 0;
    for (const { loaded, total } of fileTotals.values()) {
      downloadedBytes += loaded;
      totalBytes += total;
    }
    const payload: Record<string, unknown> = {
      status,
      repo_id: repoId,
      path: null,
      model_type: modelType,
      downloaded_bytes: downloadedBytes,
      total_bytes: totalBytes,
      downloaded_files: completedFiles.size,
      current_files: Array.from(fileTotals.keys()).filter(
        (f) => !completedFiles.has(f)
      ),
      total_files: fileTotals.size
    };
    if (error) payload["error"] = error;
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      /* socket gone */
    }
  };

  sendProgress("start");

  try {
    await tjs.downloadTransformersJsModel(repoId, {
      modelType,
      signal: abort.signal,
      onProgress: (info) => {
        if (!info.file) return;
        if (info.status === "initiate" || info.status === "download") {
          if (!fileTotals.has(info.file)) {
            fileTotals.set(info.file, { loaded: 0, total: info.total ?? 0 });
          }
        } else if (info.status === "progress") {
          const entry = fileTotals.get(info.file) ?? { loaded: 0, total: 0 };
          entry.loaded = info.loaded ?? entry.loaded;
          entry.total = info.total ?? entry.total;
          fileTotals.set(info.file, entry);
        } else if (info.status === "done") {
          const entry = fileTotals.get(info.file) ?? { loaded: 0, total: 0 };
          if (entry.total > 0 && entry.loaded < entry.total) {
            entry.loaded = entry.total;
          }
          fileTotals.set(info.file, entry);
          completedFiles.add(info.file);
        }
        sendProgress("progress");
      }
    });
    sendProgress("completed");
  } catch (err) {
    if (abort.signal.aborted) {
      sendProgress("cancelled");
    } else {
      const message = err instanceof Error ? err.message : String(err);
      sendProgress("error", message);
    }
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
    apiOptions
  } = opts;
  const graphNodeTypeResolver = createGraphNodeTypeResolver(registry);

  // Main workflow/chat WebSocket
  app.get("/ws", { websocket: true }, (socket, req) => {
    socket.on("error", (error: Error) => {
      log.error("WebSocket client error", error);
    });
    const runner = new UnifiedWebSocketRunner({
      userId: req.userId ?? "1",
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
        if (getPythonBridgeReady() && pythonBridge.hasNodeType(node.type)) {
          const meta = pythonBridge
            .getNodeMetadata()
            .find((n) => n.node_type === node.type);
          const nodeRec = node as Record<string, unknown>;
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
            meta?.required_settings ?? []
          );
        }
        if (registry.getMetadata(node.type) && !registry.has(node.type)) {
          const stderrSummary = (
            pythonBridge as { getRecentStderrSummary?: () => string | null }
          ).getRecentStderrSummary?.() ?? null;
          const loadErrors = (
            pythonBridge as {
              getLoadErrors?: () => Array<{ module: string; error: string }>;
            }
          ).getLoadErrors?.() ?? [];
          const matchingLoadError = loadErrors.find(
            (entry) =>
              entry.module.includes(node.type) ||
              node.type.startsWith(entry.module.split(".").slice(2).join("."))
          );
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
      getNodeMetadata: (nodeType) => registry.getMetadata(nodeType),
      validateNode: registry.createNodeValidator(),
      nodeRegistry: registry,
      pythonBridge,
      getPythonBridgeReady,
      apiOptions
    });
    log.info("WebSocket client connected");
    void runner.run(new WsAdapter(socket)).catch((error) => {
      log.error(
        "Runner crashed",
        error instanceof Error ? error : new Error(String(error))
      );
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
  setExtensionChannelProvider(() => extensionBridge.getChannel());

  app.get("/ws/extension", { websocket: true }, (socket, _req) => {
    // The @fastify/websocket socket satisfies the ExtensionSocket surface
    // (send(string) / close() / on("message"|"close"|"error")).
    const extSocket = socket as unknown as ExtensionSocket;
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

  // Download WebSocket endpoint — local development only
  if (!isProduction) {
    // Download WebSocket (HuggingFace model downloads)
    app.get("/ws/download", { websocket: true }, (socket, _req) => {
      socket.on("error", (error: Error) => {
        log.error("Download WebSocket error", error);
      });
      log.info("Download WebSocket client connected");

      import("@nodetool-ai/huggingface")
        .then(({ getDownloadManager }) => {
          // TJS downloads are bookkept here so cancel can abort them.
          const tjsAborts = new Map<string, AbortController>();

          socket.on("message", async (raw: Buffer | ArrayBuffer | Buffer[]) => {
            try {
              const msg = JSON.parse(raw.toString());
              if (msg.command === "start_download") {
                const repoId: string = msg.repo_id ?? "";
                const modelType: string | null = msg.model_type ?? null;
                if (modelType && modelType.startsWith("tjs.")) {
                  await handleTjsDownload(socket, repoId, modelType, tjsAborts);
                  return;
                }
                const manager = await getDownloadManager();
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
                const manager = await getDownloadManager();
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
