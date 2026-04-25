import type { FastifyPluginAsync } from "fastify";
import { createLogger } from "@nodetool/config";
import { WsAdapter } from "../ws-adapter.js";
import { UnifiedWebSocketRunner } from "../unified-websocket-runner.js";
import { createGraphNodeTypeResolver, type NodeRegistry } from "@nodetool/node-sdk";
import type { PythonStdioBridge } from "@nodetool/runtime";
import { PythonNodeExecutor, getProvider } from "@nodetool/runtime";
import { Tool } from "@nodetool/agents";
import type { NodeMetadata, PropertyMetadata } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { randomUUID } from "node:crypto";
import { Workflow } from "@nodetool/models";
import { WorkflowRunner } from "@nodetool/kernel";
import type { NodeUpdate } from "@nodetool/protocol";

const log = createLogger("nodetool.websocket.ws");

/** Sanitize a name to match OpenAI's tool name pattern: ^[a-zA-Z0-9_-]+$ */
function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Wraps a NodeTool node type (with expose_as_tool) as an agent Tool.
 * Builds inputSchema from the node's properties and executes via the registry.
 */
class NodeTypeTool extends Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;

  constructor(
    private readonly meta: NodeMetadata,
    private readonly registry: NodeRegistry
  ) {
    super();
    this.name = sanitizeToolName(meta.node_type);
    this.description = meta.description || meta.title;
    this.inputSchema = NodeTypeTool.buildSchema(meta.properties);
  }

  private static typeToJsonSchema(
    prop: PropertyMetadata
  ): Record<string, unknown> {
    const t = prop.type.type;
    if (prop.values && prop.values.length > 0) {
      return { type: "string", enum: prop.values };
    }
    switch (t) {
      case "str":
      case "string":
        return { type: "string" };
      case "int":
      case "integer":
        return { type: "integer" };
      case "float":
      case "number":
        return { type: "number" };
      case "bool":
      case "boolean":
        return { type: "boolean" };
      default:
        return { type: "string" };
    }
  }

  private static buildSchema(
    properties: PropertyMetadata[]
  ): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    for (const p of properties) {
      const schema: Record<string, unknown> = NodeTypeTool.typeToJsonSchema(p);
      if (p.description) schema.description = p.description;
      if (p.default !== undefined) schema.default = p.default;
      props[p.name] = schema;
      if (p.required && p.default === undefined) {
        required.push(p.name);
      }
    }
    return {
      type: "object",
      properties: props,
      ...(required.length > 0 ? { required } : {})
    };
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const executor = this.registry.resolve({
      id: randomUUID(),
      type: this.meta.node_type,
      properties: params
    });
    return executor.process(params, context);
  }
}

/**
 * Wraps a workflow (run_mode="tool") as an agent Tool.
 * Input nodes become tool parameters; output nodes become the result.
 */
class WorkflowTool extends Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;

  constructor(
    private readonly workflow: Workflow,
    private readonly resolveExecutor: (node: {
      id: string;
      type: string;
      data?: Record<string, unknown>;
    }) => import("@nodetool/kernel").NodeExecutor
  ) {
    super();
    this.name = sanitizeToolName(`workflow_${workflow.tool_name}`);
    this.description = workflow.description || workflow.name;
    this.inputSchema = WorkflowTool.buildSchema(workflow);
  }

  private static buildSchema(workflow: Workflow): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    const graph = workflow.getGraph();
    for (const node of graph.nodes) {
      const nodeType = (node.type as string) ?? "";
      if (!nodeType.includes("input.")) continue;
      const name = (node.data as Record<string, unknown>)?.name as string;
      if (!name) continue;
      // Map input node types to JSON schema types
      let type = "string";
      if (nodeType.includes("IntegerInput")) type = "integer";
      else if (
        nodeType.includes("FloatInput") ||
        nodeType.includes("NumberInput")
      )
        type = "number";
      else if (nodeType.includes("BooleanInput")) type = "boolean";
      props[name] = { type, description: name };
      required.push(name);
    }
    return {
      type: "object",
      properties: props,
      ...(required.length > 0 ? { required } : {})
    };
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const graph = this.workflow.getGraph();
    const nodes = graph.nodes.map((n) => ({
      id: n.id as string,
      type: n.type as string,
      properties: (n.data ?? n.properties ?? {}) as Record<string, unknown>
    }));
    const edges = graph.edges.map((e) => ({
      source: e.source as string,
      sourceHandle: e.sourceHandle as string,
      target: e.target as string,
      targetHandle: e.targetHandle as string
    }));

    // Inject input values into input nodes
    for (const node of nodes) {
      if (!node.type.includes("input.")) continue;
      const name =
        (node.properties as Record<string, unknown>)?.name as string;
      if (name && name in params) {
        (node.properties as Record<string, unknown>).value = params[name];
      }
    }

    const runner = new WorkflowRunner(`workflow-tool-${Date.now()}`, {
      resolveExecutor: this.resolveExecutor
    });
    const result = await runner.run(
      { job_id: `workflow-tool-${Date.now()}`, params },
      { nodes, edges }
    );
    const outputs: Record<string, unknown> = {};

    for (const msg of result.messages) {
      if (msg.type === "node_update") {
        const nu = msg as NodeUpdate;
        if (nu.status !== "completed") continue;
        const node = nodes.find((n) => n.id === nu.node_id);
        if (node?.type.includes("output.")) {
          const r = nu.result;
          const outputName =
            ((node.properties as Record<string, unknown>)?.name as string) ??
            nu.node_id;
          outputs[outputName] = r;
        }
      }
    }

    const keys = Object.keys(outputs);
    if (keys.length === 1) return outputs[keys[0]];
    return outputs;
  }
}

export interface WebSocketPluginOptions {
  registry: NodeRegistry;
  pythonBridge: PythonStdioBridge;
  getPythonBridgeReady: () => boolean;
  ensurePythonBridge: () => Promise<void>;
  toolClassMap: Map<string, new () => Tool>;
}

async function resolveProvider(providerId: string, userId: string) {
  return getProvider(providerId.toLowerCase(), userId);
}

const isProduction = process.env["NODETOOL_ENV"] === "production";

const websocketPlugin: FastifyPluginAsync<WebSocketPluginOptions> = async (
  app,
  opts
) => {
  const {
    registry,
    pythonBridge,
    getPythonBridgeReady,
    ensurePythonBridge,
    toolClassMap
  } = opts;
  const graphNodeTypeResolver = createGraphNodeTypeResolver(registry);

  async function resolveTools(
    toolNames: string[],
    userId: string
  ): Promise<Tool[]> {
    const tools: Tool[] = [];
    for (const name of toolNames) {
      // Agent tool classes (e.g. "google_search")
      const cls = toolClassMap.get(name);
      if (cls) {
        tools.push(new cls());
        continue;
      }
      // Workflow tools (e.g. "workflow_my_tool")
      if (name.startsWith("workflow_")) {
        const toolName = name.slice("workflow_".length);
        const wf = await Workflow.findByToolName(userId, toolName);
        if (wf) {
          const resolveExecutor = (node: {
            id: string;
            type: string;
            data?: Record<string, unknown>;
          }) => {
            return registry.resolve({
              id: node.id,
              type: node.type,
              properties: node.data
            });
          };
          tools.push(new WorkflowTool(wf, resolveExecutor));
          log.info("Resolved workflow as tool", { toolName, workflowId: wf.id });
          continue;
        }
      }
      // Node types with expose_as_tool (e.g. "search.google.GoogleImages")
      const meta = registry.getMetadata(name);
      if (meta && meta.expose_as_tool) {
        tools.push(new NodeTypeTool(meta, registry));
        log.info("Resolved node type as tool", { nodeType: name });
      }
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
      resolveTools,
      getNodeMetadata: (nodeType) => registry.getMetadata(nodeType),
      validateNode: registry.createNodeValidator(),
      nodeRegistry: registry
    });
    log.info("WebSocket client connected");
    void runner.run(new WsAdapter(socket)).catch((error) => {
      log.error(
        "Runner crashed",
        error instanceof Error ? error : new Error(String(error))
      );
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

      import("@nodetool/huggingface")
        .then(({ getDownloadManager }) => {
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
                    try {
                      socket.send(JSON.stringify(update));
                    } catch {
                      /* gone */
                    }
                  }
                });
              } else if (msg.command === "cancel_download") {
                const manager = await getDownloadManager();
                manager.cancelDownload(msg.repo_id ?? msg.id ?? "");
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
            "Failed to load @nodetool/huggingface",
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
