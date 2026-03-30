import type { FastifyPluginAsync } from "fastify";
import { createLogger } from "@nodetool/config";
import { WsAdapter } from "../ws-adapter.js";
import { UnifiedWebSocketRunner } from "../unified-websocket-runner.js";
import { handleTerminalConnection } from "../terminal.js";
import type { NodeRegistry } from "@nodetool/node-sdk";
import { createGraphNodeTypeResolver } from "@nodetool/node-sdk";
import type { PythonBridge } from "@nodetool/runtime";
import { PythonNodeExecutor, getProvider } from "@nodetool/runtime";
import type { Tool } from "@nodetool/agents";

const log = createLogger("nodetool.websocket.ws");

export interface WebSocketPluginOptions {
  registry: NodeRegistry;
  pythonBridge: PythonBridge;
  getPythonBridgeReady: () => boolean;
  toolClassMap: Map<string, new () => Tool>;
}

async function resolveProvider(providerId: string, userId: string) {
  return getProvider(providerId.toLowerCase(), userId);
}

const isProduction = process.env["NODETOOL_ENV"] === "production";

const websocketPlugin: FastifyPluginAsync<WebSocketPluginOptions> = async (app, opts) => {
  const { registry, pythonBridge, getPythonBridgeReady, toolClassMap } = opts;
  const graphNodeTypeResolver = createGraphNodeTypeResolver(registry);

  async function resolveTools(toolNames: string[]): Promise<Tool[]> {
    const tools: Tool[] = [];
    for (const name of toolNames) {
      const cls = toolClassMap.get(name);
      if (cls) tools.push(new cls());
    }
    return tools;
  }

  // Main workflow/chat WebSocket
  app.get("/ws", { websocket: true }, (socket, req) => {
    socket.on("error", (error: Error) => {
      log.error("WebSocket client error", error);
    });
    const runner = new UnifiedWebSocketRunner({
      userId: req.userId ?? "1",
      resolveExecutor: (node) => {
        if (registry.has(node.type)) {
          return registry.resolve(node);
        }
        if (getPythonBridgeReady() && pythonBridge.hasNodeType(node.type)) {
          const meta = pythonBridge.getNodeMetadata().find((n) => n.node_type === node.type);
          const nodeRec = node as Record<string, unknown>;
          const props = (nodeRec.properties ?? nodeRec.data ?? {}) as Record<string, unknown>;
          return new PythonNodeExecutor(
            pythonBridge,
            node.type,
            props,
            Object.fromEntries((meta?.outputs ?? []).map((o) => [o.name, o.type.type])),
            meta?.required_settings ?? [],
          );
        }
        if (registry.getMetadata(node.type) && !registry.has(node.type)) {
          throw new Error(
            `Python node "${node.type}" cannot execute: Python worker is not connected.`,
          );
        }
        return registry.resolve(node);
      },
      resolveNodeType: graphNodeTypeResolver,
      resolveProvider,
      resolveTools,
    });
    log.info("WebSocket client connected");
    void runner.run(new WsAdapter(socket)).catch((error) => {
      log.error("Runner crashed", error instanceof Error ? error : new Error(String(error)));
    });
  });

  // Terminal and Download WebSocket endpoints — local development only
  if (!isProduction) {
    // Terminal WebSocket — real PTY-backed shell
    app.get("/ws/terminal", { websocket: true }, (socket, _req) => {
      socket.on("error", (error: Error) => {
        log.error("Terminal WebSocket error", error);
      });
      log.info("Terminal WebSocket client connected");
      handleTerminalConnection(socket as any).catch((err) => {
        log.error(
          "Terminal handler failed",
          err instanceof Error ? err : new Error(String(err)),
        );
      });
    });

    // Download WebSocket (HuggingFace model downloads)
    app.get("/ws/download", { websocket: true }, (socket, _req) => {
      socket.on("error", (error: Error) => {
        log.error("Download WebSocket error", error);
      });
      log.info("Download WebSocket client connected");

      import("@nodetool/huggingface").then(({ getDownloadManager }) => {
        socket.on("message", async (raw: Buffer | ArrayBuffer | Buffer[]) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.command === "start_download") {
              const manager = await getDownloadManager();
              await manager.startDownload(msg.repo_id ?? "", {
                path: msg.path ?? null,
                allowPatterns: msg.allow_patterns ?? null,
                ignorePatterns: msg.ignore_patterns ?? null,
                cacheDir: msg.cache_dir ?? null,
                modelType: msg.model_type ?? null,
                onProgress: (update) => {
                  try { socket.send(JSON.stringify(update)); } catch { /* gone */ }
                },
              });
            } else if (msg.command === "cancel_download") {
              const manager = await getDownloadManager();
              manager.cancelDownload(msg.repo_id ?? msg.id ?? "");
            }
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            try { socket.send(JSON.stringify({ status: "error", error })); } catch { /* gone */ }
          }
        });
      }).catch((err: unknown) => {
        log.error("Failed to load @nodetool/huggingface", err instanceof Error ? err : new Error(String(err)));
        try {
          socket.send(JSON.stringify({ status: "error", error: "Download module unavailable" }));
          socket.close();
        } catch { /* socket already gone */ }
      });
    });
  }
};

export default websocketPlugin;
