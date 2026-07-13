/**
 * MCP (Model Context Protocol) server for NodeTool.
 *
 * Exposes NodeTool workflows, assets, nodes, jobs, and collections
 * as MCP tools using the official TypeScript MCP SDK.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { getListAssetsAppHtml } from "./mcp-apps/list-assets-app.js";
import { getAssetAdapter } from "./lib/storage.js";
import { thumbnailKey } from "./lib/thumbnail.js";
import { getListWorkflowsAppHtml } from "./mcp-apps/list-workflows-app.js";
import { getGetWorkflowAppHtml } from "./mcp-apps/get-workflow-app.js";
import { getListJobsAppHtml } from "./mcp-apps/list-jobs-app.js";
import { getNodesAppHtml } from "./mcp-apps/nodes-app.js";
import { getCollectionsAppHtml } from "./mcp-apps/collections-app.js";
import { createLogger } from "@nodetool-ai/config";
import { Workflow, Job, Asset } from "@nodetool-ai/models";
import {
  toAssetResponse,
  toJobResponse,
  toWorkflowResponse
} from "./http-api.js";

type JsonObject = Record<string, unknown>;
import { uiToolSchemas } from "@nodetool-ai/protocol";
import {
  hydrateGraphNodeFlags,
  NodeRegistry,
  rankNodeMetadata,
  type NodeMetadata
} from "@nodetool-ai/node-sdk";
import type { GraphData } from "@nodetool-ai/protocol";
import { bootstrapNodeRegistry } from "./node-registry-setup.js";
import {
  PythonNodeExecutor,
  createPythonBridge,
  logPythonWorkerStderr,
  type NodeExecutor,
  type PythonBridge
} from "@nodetool-ai/runtime";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import {
  resolveWorkflowWorkspace,
  buildWorkspaceExecutionContext
} from "./lib/workflow-workspace.js";
import type { AgentTransport } from "./agent/transport.js";

export interface McpServerOptions {
  metadataRoots?: string[];
  metadataMaxDepth?: number;
  registry?: NodeRegistry;
  /**
   * Public base URL (e.g. "http://127.0.0.1:7777") used to rewrite relative
   * asset URLs (`/api/storage/...`) into absolute ones. MCP gallery UIs run
   * inside iframes whose `srcdoc` origin cannot resolve relative paths.
   * Captured from the inbound MCP HTTP request when available.
   */
  publicBaseUrl?: string;
}

function absolutize(value: unknown, baseUrl?: string): unknown {
  if (typeof value !== "string" || !baseUrl) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return `${baseUrl}${value}`;
  return value;
}

const log = createLogger("nodetool.websocket.mcp-server");

/**
 * Renderer transports keyed by `transport.id`. Each connected NodeTool editor
 * registers here on connect (see the agent WebSocket route), so the shared
 * `/mcp` endpoint can route `ui_*` tool calls to a specific live editor.
 * `activeFrontendRendererId` tracks the most-recently-active renderer, used
 * when an MCP client doesn't name one.
 */
const frontendTransports = new Map<string, AgentTransport>();
let activeFrontendRendererId: string | null = null;

function resolveFrontendTransport(
  rendererId?: string | null
): AgentTransport | null {
  if (rendererId) {
    const target = frontendTransports.get(rendererId);
    return target && target.isAlive ? target : null;
  }
  if (activeFrontendRendererId) {
    const active = frontendTransports.get(activeFrontendRendererId);
    if (active && active.isAlive) return active;
  }
  // Fall back to any live renderer so single-editor setups need no id.
  const alive = [...frontendTransports.values()].filter((t) => t.isAlive);
  return alive[alive.length - 1] ?? null;
}

function listFrontendRenderers(): { renderer_id: string; active: boolean }[] {
  return [...frontendTransports.values()]
    .filter((t) => t.isAlive)
    .map((t) => ({ renderer_id: t.id, active: t.id === activeFrontendRendererId }));
}

let runtimeEnvironmentPromise: Promise<RuntimeEnvironment> | null = null;

async function getUnifiedNodeMetadata(
  options?: McpServerOptions
): Promise<NodeMetadata[]> {
  if (options?.registry) {
    return options.registry
      .listMetadata()
      .sort((a, b) => a.node_type.localeCompare(b.node_type));
  }
  const runtime = await getRuntimeEnvironment(options);
  return runtime.registry
    .listMetadata()
    .sort((a, b) => a.node_type.localeCompare(b.node_type));
}

type RuntimeEnvironment = {
  registry: NodeRegistry;
  pythonBridge: PythonBridge;
  ensurePythonBridge: () => Promise<void>;
  resolveExecutor: (node: {
    id: string;
    type: string;
    [key: string]: unknown;
  }) => NodeExecutor;
};

function getRuntimeEnvironment(
  options?: McpServerOptions
): Promise<RuntimeEnvironment> {
  if (!runtimeEnvironmentPromise) {
    runtimeEnvironmentPromise = (async () => {
      const registry = await bootstrapNodeRegistry({
        ...(options?.metadataRoots
          ? { metadataRoots: options.metadataRoots }
          : {}),
        metadataMaxDepth: options?.metadataMaxDepth ?? 8,
        log
      });

      const pythonBridge = createPythonBridge({
        workerArgs: process.env["NODETOOL_WORKER_NAMESPACES"]
          ? ["--namespaces", process.env["NODETOOL_WORKER_NAMESPACES"]]
          : []
      });

      const logPythonBridgeDiagnostics = (context: string): void => {
        const loadErrors = (
          pythonBridge as {
            getLoadErrors?: () => Array<{
              module: string;
              phase: string;
              error: string;
            }>;
          }
        ).getLoadErrors?.() ?? [];
        if (loadErrors.length === 0) return;
        log.warn(`MCP Python bridge ${context} with ${loadErrors.length} load error(s)`);
        for (const entry of loadErrors.slice(0, 10)) {
          log.warn(
            `[python-worker][load-error] ${entry.module} (${entry.phase}): ${entry.error}`
          );
        }
      };

      let pythonBridgeReady = false;
      pythonBridge.on("stderr", (msg: string) => {
        for (const line of msg.split("\n")) {
          logPythonWorkerStderr(line, log);
        }
      });
      pythonBridge.on("error", (err: Error) => {
        log.error(`MCP Python bridge protocol error: ${err.message}`);
        pythonBridgeReady = false;
      });
      pythonBridge.on("exit", (code: number) => {
        log.warn(`MCP Python worker exited with code ${code}`);
        pythonBridgeReady = false;
      });

      const ensurePythonBridge = async (): Promise<void> => {
        log.info("MCP lazily starting Python bridge");
        try {
          await pythonBridge.ensureConnected();
        } catch (err) {
          log.warn(
            "MCP Python bridge lazy start failed",
            err instanceof Error ? err : new Error(String(err))
          );
          throw err;
        }
        pythonBridgeReady = true;
        log.info("MCP Python bridge lazy start completed");
        const meta = pythonBridge.getNodeMetadata();
        log.info(`MCP Python bridge connected — ${meta.length} Python nodes`);
        (
          pythonBridge as {
            getWorkerStatus?: () => Promise<{
              protocol_version: number;
              node_count: number;
              provider_count: number;
              namespaces: string[];
              transport: string;
              max_frame_size: number;
              load_errors: Array<unknown>;
            }>;
          }
        )
          .getWorkerStatus?.()
          ?.then((status) => {
            log.info("MCP Python bridge status", {
              protocol_version: status.protocol_version,
              node_count: status.node_count,
              provider_count: status.provider_count,
              namespaces: status.namespaces,
              transport: status.transport,
              max_frame_size: status.max_frame_size,
              load_error_count: status.load_errors.length
            });
          })
          .catch((err: unknown) => {
            log.warn(
              "MCP failed to fetch Python bridge status",
              err instanceof Error ? err : new Error(String(err))
            );
          });
        logPythonBridgeDiagnostics("connected");
      };

      const resolveExecutor = (node: {
        id: string;
        type: string;
        [key: string]: unknown;
      }): NodeExecutor => {
        if (registry.has(node.type)) {
          return registry.resolve(node);
        }
        if (pythonBridgeReady && pythonBridge.hasNodeType(node.type)) {
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
            meta?.required_settings ?? [],
            node.id
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
          const matchingLoadError = loadErrors.find((entry) => {
            if (entry.module.includes(node.type)) return true;
            const suffix = entry.module.split(".").slice(2).join(".");
            // An empty suffix makes startsWith("") match every node type,
            // mis-attributing an unrelated import failure. Require a non-empty
            // prefix match.
            return suffix.length > 0 && node.type.startsWith(suffix);
          });
          throw new Error(
            pythonBridgeReady
              ? `Python node "${node.type}" cannot execute: it is declared in metadata but was not loaded by the Python worker.${matchingLoadError ? ` Load error: ${matchingLoadError.module}: ${matchingLoadError.error}.` : stderrSummary ? ` Recent Python worker stderr: ${stderrSummary}` : " Check Python worker status/load errors for import failures."}`
              : `Python node "${node.type}" cannot execute: Python worker is not connected.${stderrSummary ? ` Recent Python worker stderr: ${stderrSummary}` : ""}`
          );
        }
        return registry.resolve(node);
      };

      return {
        registry,
        pythonBridge,
        ensurePythonBridge,
        resolveExecutor
      };
    })().catch((err) => {
      // Don't cache a rejected promise — a single transient bootstrap failure
      // would otherwise poison every later run_workflow / node-metadata call for
      // the process lifetime. Clear the cache so the next call retries.
      runtimeEnvironmentPromise = null;
      throw err;
    });
  }

  return runtimeEnvironmentPromise;
}

/**
 * Create a configured MCP server with all NodeTool tools registered.
 */
export function createMcpServer(options?: McpServerOptions): McpServer {
  const server = new McpServer({
    name: "NodeTool API Server",
    version: "1.0.0"
  });

  const rendererIdParam = {
    renderer_id: z
      .string()
      .optional()
      .describe(
        "Target a specific connected NodeTool editor. Omit to use the most-recently-active one. List ids via `list_renderers`."
      )
  };

  for (const [toolName, schema] of Object.entries(uiToolSchemas)) {
    server.tool(
      toolName,
      schema.description,
      { ...schema.parameters, ...rendererIdParam },
      async (args) => {
        const { renderer_id, ...toolArgs } = args as Record<string, unknown>;
        const rendererId =
          typeof renderer_id === "string" ? renderer_id : undefined;
        const transport = resolveFrontendTransport(rendererId);
        if (!transport || !transport.isAlive) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: rendererId
                    ? `No connected NodeTool renderer with id "${rendererId}".`
                    : "No active NodeTool renderer is connected for frontend UI tools."
                })
              }
            ],
            isError: true
          };
        }

        try {
          const result = await transport.executeTool(
            transport.id,
            `mcp-ui-${toolName}-${crypto.randomUUID()}`,
            toolName,
            toolArgs
          );
          return {
            content: [
              {
                type: "text" as const,
                text:
                  typeof result === "string"
                    ? result
                    : JSON.stringify(result ?? null)
              }
            ]
          };
        } catch (err: unknown) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: String(err) })
              }
            ],
            isError: true
          };
        }
      }
    );
  }

  server.tool(
    "list_renderers",
    "List connected NodeTool editor renderers that can execute ui_* tools. Pass a returned renderer_id to a ui_* tool to target that editor; omit it to use the active one.",
    {},
    async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ renderers: listFrontendRenderers() })
        }
      ]
    })
  );

  // ── Workflow tools ──────────────────────────────────────────────

  registerListWorkflowsApp(server, options);
  registerGetWorkflowApp(server, options);

  server.tool(
    "run_workflow",
    "Run a workflow on the backend, optionally passing parameters.",
    {
      workflow_id: z.string().describe("Workflow id to target."),
      params: z
        .record(z.string(), z.unknown())
        .optional()
        .default({})
        .describe("Optional workflow run parameters."),
      user_id: z.string().optional().default("1").describe("User ID")
    },
    async ({ workflow_id, params, user_id }) => {
      try {
        const workflow = await Workflow.find(user_id, workflow_id);
        if (!workflow) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Workflow not found" })
              }
            ],
            isError: true
          };
        }

        const runMode = workflow.run_mode ?? "workflow";
        if (runMode !== "workflow") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Workflow run mode "${runMode}" is not supported by the backend MCP runner.`
                })
              }
            ],
            isError: true
          };
        }

        const graph = workflow.getGraph();
        const runnableGraph: {
          nodes: Array<{
            id: string;
            type: string;
            [key: string]: unknown;
          }>;
          edges: Array<{
            id?: string | null;
            source: string;
            target: string;
            sourceHandle: string;
            targetHandle: string;
            edge_type?: "data" | "control";
            [key: string]: unknown;
          }>;
        } = {
          nodes: graph.nodes.map((node) => {
            const record = node as Record<string, unknown>;
            return {
              ...record,
              id: String(record.id ?? ""),
              type: String(record.type ?? ""),
              properties: (record.properties ?? record.data ?? {}) as Record<
                string,
                unknown
              >
            };
          }),
          edges: graph.edges.map((edge) => {
            const record = edge as Record<string, unknown>;
            return {
              ...record,
              id:
                typeof record.id === "string" || record.id == null
                  ? (record.id as string | null | undefined)
                  : String(record.id),
              source: String(record.source ?? ""),
              target: String(record.target ?? ""),
              sourceHandle: String(record.sourceHandle ?? ""),
              targetHandle: String(record.targetHandle ?? ""),
              edge_type:
                record.edge_type === "control" ? "control" : "data"
            };
          })
        };
        const runtime = await getRuntimeEnvironment(options);
        const hasPythonNode = runnableGraph.nodes.some((node) => {
          const nodeType = typeof node.type === "string" ? node.type : "";
          return (
            nodeType !== "" &&
            Boolean(runtime.registry.getMetadata(nodeType)) &&
            !runtime.registry.has(nodeType)
          );
        });
        if (hasPythonNode) {
          await runtime.ensurePythonBridge();
        }

        const job = await Job.create({
          workflow_id,
          user_id,
          status: "running",
          params,
          graph: runnableGraph
        });

        const workspaceDir = await resolveWorkflowWorkspace(
          workflow_id,
          user_id
        );
        const runner = new WorkflowRunner(job.id, {
          resolveExecutor: (node) =>
            runtime.resolveExecutor(
              node as { id: string; type: string; [key: string]: unknown }
            ),
          executionContext: buildWorkspaceExecutionContext({
            jobId: job.id,
            workflowId: workflow_id,
            userId: user_id,
            workspaceDir
          })
        });
        const result = await runner.run(
          { job_id: job.id, workflow_id, params },
          hydrateGraphNodeFlags(
            runnableGraph as unknown as GraphData,
            runtime.registry
          )
        );

        if (result.status === "completed") {
          job.markCompleted();
        } else if (result.status === "cancelled") {
          job.markCancelled();
        } else {
          job.markFailed(result.error ?? "Workflow run failed");
        }
        await job.save();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                job_id: job.id,
                workflow_id,
                status: result.status,
                outputs: result.outputs,
                error: result.error ?? null,
                message_count: result.messages.length,
                background: false
              })
            }
          ]
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: String(err) })
            }
          ],
          isError: true
        };
      }
    }
  );

  // ── Asset tools ─────────────────────────────────────────────────

  registerListAssetsApp(server, options);

  server.tool(
    "get_asset",
    "Get detailed information about a specific asset. Returns the asset's thumbnail inline as an image block when available.",
    {
      asset_id: z.string().describe("The asset ID"),
      user_id: z.string().optional().default("1").describe("User ID")
    },
    async ({ asset_id, user_id }) => {
      try {
        const asset = await Asset.find(user_id, asset_id);
        if (!asset) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Asset not found" })
              }
            ],
            isError: true
          };
        }
        const payload = await toAssetResponse(asset);
        absolutizeUrls(payload, options?.publicBaseUrl);
        const thumb = await loadAssetThumb(asset);
        if (thumb) payload.thumb_data_url = thumb.dataUrl;
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(payload) },
            ...(thumb ? [thumb.block] : [])
          ],
          structuredContent: payload as Record<string, unknown>
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: String(err) })
            }
          ],
          isError: true
        };
      }
    }
  );

  // ── Node tools ──────────────────────────────────────────────────

  registerNodesApp(server, options);

  server.tool(
    "get_node_info",
    "Get detailed metadata for a node type.",
    {
      node_type: z.string().describe("The fully-qualified node type")
    },
    async ({ node_type }) => {
      try {
        const nodes = await getUnifiedNodeMetadata(options);
        const node = nodes.find((candidate) => candidate.node_type === node_type);
        if (!node) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Node type not found" })
              }
            ],
            isError: true
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(node) }]
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: String(err) })
            }
          ],
          isError: true
        };
      }
    }
  );

  // ── Job tools ───────────────────────────────────────────────────

  registerListJobsApp(server);

  server.tool(
    "get_job",
    "Get a job by ID for user. Returns inline thumbnails of any assets produced by the job.",
    {
      job_id: z.string().describe("The job ID"),
      user_id: z.string().optional().default("1").describe("User ID")
    },
    async ({ job_id, user_id }) => {
      try {
        const job = await Job.find(user_id, job_id);
        if (!job) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Job not found" })
              }
            ],
            isError: true
          };
        }
        const payload = toJobResponse(job);
        let assetThumbs: Map<string, LoadedThumb> = new Map();
        try {
          const [jobAssets] = await Asset.paginate(user_id, {
            jobId: job.id,
            limit: 20
          });
          assetThumbs = await loadAssetThumbs(jobAssets);
          if (assetThumbs.size > 0) {
            payload.output_assets = jobAssets.map((a) => {
              const t = assetThumbs.get(a.id);
              return {
                id: a.id,
                name: a.name,
                content_type: a.content_type,
                ...(t ? { thumb_data_url: t.dataUrl } : {})
              };
            });
          }
        } catch {
          // ignore — job lookup still succeeds without output assets
        }
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(payload) },
            ...thumbsToBlocks(assetThumbs)
          ],
          structuredContent: payload as Record<string, unknown>
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: String(err) })
            }
          ],
          isError: true
        };
      }
    }
  );

  // ── Collection tools (sqlite-vec) ───────────────────────────────

  registerCollectionsApp(server);

  server.tool(
    "get_collection",
    "Get details about a specific collection.",
    {
      name: z.string().describe("Collection name")
    },
    async ({ name }) => {
      try {
        const { getDefaultVectorProvider } = await import(
          "@nodetool-ai/vectorstore"
        );
        const provider = getDefaultVectorProvider();
        const collection = await provider.getCollection({ name });
        const count = await collection.count();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                name: collection.name,
                metadata: collection.metadata,
                count
              })
            }
          ]
        };
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Vector store not available" })
            }
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "query_collection",
    "Query a collection for similar documents using semantic search.",
    {
      name: z.string().describe("Collection name"),
      query_texts: z
        .array(z.string())
        .describe("Query texts for semantic search"),
      n_results: z.number().optional().default(10).describe("Number of results")
    },
    async ({ name, query_texts, n_results }) => {
      try {
        const { getDefaultVectorProvider } = await import(
          "@nodetool-ai/vectorstore"
        );
        const provider = getDefaultVectorProvider();
        const collection = await provider.getCollection({ name });

        const ids: string[][] = [];
        const documents: (string | null)[][] = [];
        const metadatas: (Record<string, unknown> | null)[][] = [];
        const distances: number[][] = [];
        for (const text of query_texts) {
          const matches = await collection.query({ text, topK: n_results });
          ids.push(matches.map((m) => m.id));
          documents.push(matches.map((m) => m.document));
          metadatas.push(matches.map((m) => m.metadata));
          distances.push(matches.map((m) => m.distance));
        }
        const results = { ids, documents, metadatas, distances };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(results) }]
        };
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Vector store not available" })
            }
          ],
          isError: true
        };
      }
    }
  );

  return server;
}

// ── MCP App registrations ─────────────────────────────────────────
//
// Each `register*App` helper attaches an HTML view (the MCP App
// extension) to a tool. Hosts that speak the extension render the
// view; hosts that don't still receive the original JSON payload.

const UI_URI = {
  listAssets: "ui://nodetool/list-assets.html",
  listWorkflows: "ui://nodetool/list-workflows.html",
  getWorkflow: "ui://nodetool/get-workflow.html",
  listJobs: "ui://nodetool/list-jobs.html",
  nodes: "ui://nodetool/nodes.html",
  collections: "ui://nodetool/collections.html"
} as const;

function appResource(
  server: McpServer,
  name: string,
  uri: string,
  description: string,
  loadHtml: () => Promise<string>
): void {
  registerAppResource(server, name, uri, { description }, async () => ({
    contents: [
      { uri, mimeType: RESOURCE_MIME_TYPE, text: await loadHtml() }
    ]
  }));
}

function jsonResult(payload: unknown, isError = false) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload) }
    ],
    ...(isError ? { isError: true as const } : {}),
    ...(isError ? {} : { structuredContent: payload as Record<string, unknown> })
  };
}

function errResult(err: unknown) {
  return jsonResult({ error: String(err instanceof Error ? err.message : err) }, true);
}

type ImageBlock = { type: "image"; data: string; mimeType: string };
type LoadedThumb = { block: ImageBlock; dataUrl: string };

function mimeFromKey(key: string): string {
  const ext = key.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "image/jpeg";
  }
}

async function loadStorageThumb(key: string): Promise<LoadedThumb | null> {
  try {
    const adapter = getAssetAdapter();
    const uri = adapter.uriForKey(key);
    const bytes = await adapter.retrieve(uri);
    if (!bytes || bytes.byteLength === 0) return null;
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = mimeFromKey(key);
    return {
      block: { type: "image" as const, data: base64, mimeType },
      dataUrl: `data:${mimeType};base64,${base64}`
    };
  } catch {
    return null;
  }
}

function assetHasThumb(asset: Asset): boolean {
  const t = asset.content_type;
  return (
    t.startsWith("image/") ||
    t.startsWith("video/") ||
    t.startsWith("audio/") ||
    t === "application/pdf"
  );
}

async function loadAssetThumb(asset: Asset): Promise<LoadedThumb | null> {
  if (!assetHasThumb(asset)) return null;
  return loadStorageThumb(thumbnailKey(asset.id));
}

async function loadAssetThumbs(
  assets: Asset[]
): Promise<Map<string, LoadedThumb>> {
  const entries = await Promise.all(
    assets.map(async (a) => [a.id, await loadAssetThumb(a)] as const)
  );
  const map = new Map<string, LoadedThumb>();
  for (const [id, thumb] of entries) {
    if (thumb) map.set(id, thumb);
  }
  return map;
}

async function loadWorkflowThumb(
  workflow: Workflow
): Promise<LoadedThumb | null> {
  const key = workflow.thumbnail;
  if (!key || typeof key !== "string") return null;
  if (key.startsWith("http://") || key.startsWith("https://")) return null;
  return loadStorageThumb(key);
}

async function loadWorkflowThumbs(
  workflows: Workflow[]
): Promise<Map<string, LoadedThumb>> {
  const entries = await Promise.all(
    workflows.map(async (w) => [w.id, await loadWorkflowThumb(w)] as const)
  );
  const map = new Map<string, LoadedThumb>();
  for (const [id, thumb] of entries) {
    if (thumb) map.set(id, thumb);
  }
  return map;
}

function attachThumbDataUrls(
  responses: JsonObject[],
  ids: string[],
  thumbs: Map<string, LoadedThumb>,
  field: string
): void {
  for (let i = 0; i < responses.length; i++) {
    const id = ids[i];
    if (id == null) continue;
    const loaded = thumbs.get(id);
    if (loaded) responses[i][field] = loaded.dataUrl;
  }
}

function thumbsToBlocks(thumbs: Map<string, LoadedThumb>): ImageBlock[] {
  return Array.from(thumbs.values()).map((t) => t.block);
}

const URL_FIELDS = ["get_url", "thumb_url", "thumbnail_url"] as const;

function absolutizeUrls(response: JsonObject, baseUrl?: string): JsonObject {
  if (!baseUrl) return response;
  for (const field of URL_FIELDS) {
    if (response[field] !== undefined) {
      response[field] = absolutize(response[field], baseUrl);
    }
  }
  return response;
}

function registerListAssetsApp(
  server: McpServer,
  options?: McpServerOptions
): void {
  registerAppTool(
    server,
    "list_assets",
    {
      description:
        "List or search assets with flexible filtering options. Returns inline base64 thumbnails for images, video, audio, and PDFs so hosts (e.g. Claude Desktop) render previews directly. Supports cursor pagination via start_key — pass the previous response's `next` value to fetch the next page.",
      inputSchema: {
        parent_id: z.string().optional().describe("Filter by parent asset ID"),
        content_type: z.string().optional().describe("Filter by content type"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of assets to return (default 10)"),
        start_key: z
          .string()
          .optional()
          .describe(
            "Pagination cursor — pass the `next` value from the previous response to fetch the next page"
          ),
        user_id: z.string().optional().default("1").describe("User ID")
      },
      _meta: { ui: { resourceUri: UI_URI.listAssets } }
    },
    async ({ parent_id, content_type, limit, start_key, user_id }) => {
      try {
        const opts: {
          limit: number;
          parentId?: string;
          contentType?: string;
          startKey?: string;
        } = { limit };
        if (parent_id) opts.parentId = parent_id;
        if (content_type) opts.contentType = content_type;
        if (start_key) opts.startKey = start_key;
        const [assets, next] = await Asset.paginate(user_id, opts);
        const responses = await Promise.all(assets.map(toAssetResponse));
        for (const r of responses) absolutizeUrls(r, options?.publicBaseUrl);
        const thumbs = await loadAssetThumbs(assets);
        attachThumbDataUrls(
          responses,
          assets.map((a) => a.id),
          thumbs,
          "thumb_data_url"
        );
        const payload = { assets: responses, next: next || null };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(payload) },
            ...thumbsToBlocks(thumbs)
          ],
          structuredContent: payload as Record<string, unknown>
        };
      } catch (err: unknown) {
        return errResult(err);
      }
    }
  );
  appResource(
    server,
    "NodeTool Asset Gallery",
    UI_URI.listAssets,
    "Interactive media gallery for NodeTool assets — images, video, audio and folders.",
    getListAssetsAppHtml
  );
}

function registerListWorkflowsApp(
  server: McpServer,
  options?: McpServerOptions
): void {
  registerAppTool(
    server,
    "list_workflows",
    {
      description:
        "List workflows. Returns inline base64 thumbnails for hosts that render images (e.g. Claude Desktop) and renders an interactive gallery in App-aware hosts. Supports cursor pagination via start_key — pass the previous response's `next` value to fetch the next page.",
      inputSchema: {
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum workflows to return (default 10)"),
        start_key: z
          .string()
          .optional()
          .describe(
            "Pagination cursor — pass the `next` value from the previous response to fetch the next page"
          ),
        user_id: z.string().optional().default("1").describe("User ID")
      },
      _meta: { ui: { resourceUri: UI_URI.listWorkflows } }
    },
    async ({ limit, start_key, user_id }) => {
      try {
        const opts: { limit: number; startKey?: string } = { limit };
        if (start_key) opts.startKey = start_key;
        const [workflows, next] = await Workflow.paginate(user_id, opts);
        const responses = workflows.map((w) => toWorkflowResponse(w));
        for (const r of responses) absolutizeUrls(r, options?.publicBaseUrl);
        const thumbs = await loadWorkflowThumbs(workflows);
        attachThumbDataUrls(
          responses,
          workflows.map((w) => w.id),
          thumbs,
          "thumbnail_data_url"
        );
        const payload = { workflows: responses, next: next || null };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(payload) },
            ...thumbsToBlocks(thumbs)
          ],
          structuredContent: payload as Record<string, unknown>
        };
      } catch (err: unknown) {
        return errResult(err);
      }
    }
  );
  appResource(
    server,
    "NodeTool Workflow Gallery",
    UI_URI.listWorkflows,
    "Visual gallery of NodeTool workflows.",
    getListWorkflowsAppHtml
  );
}

function registerGetWorkflowApp(
  server: McpServer,
  options?: McpServerOptions
): void {
  registerAppTool(
    server,
    "get_workflow",
    {
      description:
        "Get detailed information about a specific workflow. Returns the workflow's thumbnail inline as an image block when available, plus an interactive pan/zoom graph view in App-aware hosts.",
      inputSchema: {
        workflow_id: z.string().describe("The workflow ID"),
        user_id: z.string().optional().default("1").describe("User ID")
      },
      _meta: { ui: { resourceUri: UI_URI.getWorkflow } }
    },
    async ({ workflow_id, user_id }) => {
      try {
        const workflow = await Workflow.find(user_id, workflow_id);
        if (!workflow) return errResult("Workflow not found");
        const payload = toWorkflowResponse(workflow);
        absolutizeUrls(payload, options?.publicBaseUrl);
        const thumb = await loadWorkflowThumb(workflow);
        if (thumb) payload.thumbnail_data_url = thumb.dataUrl;
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(payload) },
            ...(thumb ? [thumb.block] : [])
          ],
          structuredContent: payload as Record<string, unknown>
        };
      } catch (err: unknown) {
        return errResult(err);
      }
    }
  );
  appResource(
    server,
    "NodeTool Workflow Graph Viewer",
    UI_URI.getWorkflow,
    "Interactive pan/zoom graph view of a NodeTool workflow.",
    getGetWorkflowAppHtml
  );
}

function registerListJobsApp(server: McpServer): void {
  registerAppTool(
    server,
    "list_jobs",
    {
      description:
        "List jobs for user, optionally filtered by workflow. Renders an inline jobs dashboard with status pills and durations in App-aware hosts. Supports cursor pagination via start_key.",
      inputSchema: {
        workflow_id: z.string().optional().describe("Filter by workflow ID"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum jobs to return (default 10)"),
        start_key: z
          .string()
          .optional()
          .describe(
            "Pagination cursor — pass the `next_start_key` value from the previous response to fetch the next page"
          ),
        user_id: z.string().optional().default("1").describe("User ID")
      },
      _meta: { ui: { resourceUri: UI_URI.listJobs } }
    },
    async ({ workflow_id, limit, start_key, user_id }) => {
      try {
        const opts: { limit: number; workflowId?: string; startKey?: string } = {
          limit
        };
        if (workflow_id) opts.workflowId = workflow_id;
        if (start_key) opts.startKey = start_key;
        const [jobs, nextStartKey] = await Job.paginate(user_id, opts);
        return jsonResult({
          jobs: jobs.map((job) => toJobResponse(job)),
          next_start_key: nextStartKey || null
        });
      } catch (err: unknown) {
        return errResult(err);
      }
    }
  );
  appResource(
    server,
    "NodeTool Jobs Dashboard",
    UI_URI.listJobs,
    "Dashboard view of NodeTool background jobs with status, duration and errors.",
    getListJobsAppHtml
  );
}

function registerNodesApp(server: McpServer, options?: McpServerOptions): void {
  registerAppTool(
    server,
    "list_nodes",
    {
      description:
        "List available nodes from installed packages. Renders an inline node catalog with namespace tree and search in App-aware hosts.",
      inputSchema: {
        namespace: z.string().optional().describe("Filter by namespace prefix"),
        limit: z.number().optional().default(200).describe("Maximum nodes to return")
      },
      _meta: { ui: { resourceUri: UI_URI.nodes } }
    },
    async ({ namespace, limit }) => {
      try {
        let nodes = await getUnifiedNodeMetadata(options);
        if (namespace) nodes = nodes.filter((n) => n.namespace.startsWith(namespace));
        nodes.sort((a, b) => a.node_type.localeCompare(b.node_type));
        const result = nodes.slice(0, limit).map((n) => ({
          node_type: n.node_type,
          title: n.title,
          description: n.description,
          namespace: n.namespace
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }]
        };
      } catch (err: unknown) {
        return errResult(err);
      }
    }
  );

  registerAppTool(
    server,
    "search_nodes",
    {
      description:
        "Search for nodes by name, description, or tags. Provider-specific nodes (openai.*, anthropic.*, etc.) are hidden by default; set include_provider_nodes:true to include them. Renders the same node catalog UI in App-aware hosts.",
      inputSchema: {
        query: z.array(z.string()).describe("Search keywords"),
        n_results: z.number().optional().default(10).describe("Maximum results"),
        namespace: z
          .string()
          .optional()
          .describe("Optional namespace prefix to scope the search (e.g. 'nodetool.control')."),
        include_provider_nodes: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include provider-specific nodes. Default false — set true only when the user named a provider.")
      },
      _meta: { ui: { resourceUri: UI_URI.nodes } }
    },
    async ({ query, n_results, namespace, include_provider_nodes }) => {
      try {
        const nodes = await getUnifiedNodeMetadata(options);
        const ranked = rankNodeMetadata(nodes, query, {
          includeProviderNodes: include_provider_nodes,
          namespacePrefix: namespace
        });
        const matches = ranked.slice(0, n_results).map(({ meta, score }) => ({
          node_type: meta.node_type,
          title: meta.title,
          description: meta.description,
          namespace: meta.namespace,
          score
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(matches) }]
        };
      } catch (err: unknown) {
        return errResult(err);
      }
    }
  );

  appResource(
    server,
    "NodeTool Node Catalog",
    UI_URI.nodes,
    "Browse and search NodeTool node types with namespace tree filtering.",
    getNodesAppHtml
  );
}

function registerCollectionsApp(server: McpServer): void {
  registerAppTool(
    server,
    "list_collections",
    {
      description:
        "List all vector database collections. Renders an inline collection browser with semantic search in App-aware hosts.",
      inputSchema: {
        limit: z.number().optional().default(50).describe("Maximum collections to return")
      },
      _meta: { ui: { resourceUri: UI_URI.collections } }
    },
    async ({ limit }) => {
      try {
        const { getDefaultVectorProvider } = await import(
          "@nodetool-ai/vectorstore"
        );
        const provider = getDefaultVectorProvider();
        const collections = await provider.listCollections();
        const result = await Promise.all(
          collections.slice(0, limit).map(async (info) => {
            const collection = await provider.getCollection({ name: info.name });
            const count = await collection.count();
            const metadata = info.metadata ?? {};
            let workflowName: string | null = null;
            const workflowId = metadata.workflow as string | undefined;
            if (workflowId) {
              const workflow = (await Workflow.get(workflowId)) as Workflow | null;
              if (workflow) workflowName = workflow.name;
            }
            return { name: info.name, count, metadata, workflow_name: workflowName };
          })
        );
        return jsonResult({ collections: result, count: result.length });
      } catch {
        return errResult("Vector store not available");
      }
    }
  );
  appResource(
    server,
    "NodeTool Collections",
    UI_URI.collections,
    "Browse NodeTool vector collections and run semantic queries inline.",
    getCollectionsAppHtml
  );
}

/**
 * Create a stdio transport for CLI mode.
 */
export function createMcpStdioTransport(): StdioServerTransport {
  return new StdioServerTransport();
}

// Per-session transport map for stateful HTTP MCP
const sessionTransports = new Map<
  string,
  WebStandardStreamableHTTPServerTransport
>();

/**
 * Register a renderer as available for `ui_*` tool routing and mark it active.
 * Called when an editor's agent WebSocket connects, so frontend UI tools work
 * over the shared `/mcp` endpoint without first priming an in-app agent turn.
 */
export function registerMcpFrontendTransport(transport: AgentTransport): void {
  frontendTransports.set(transport.id, transport);
  activeFrontendRendererId = transport.id;
}

/** Promote an already-registered renderer to be the active default. */
export function setActiveMcpFrontendRenderer(transport: AgentTransport): void {
  if (frontendTransports.has(transport.id)) {
    activeFrontendRendererId = transport.id;
  }
}

/** Drop a renderer on disconnect, promoting another if it was the active one. */
export function unregisterMcpFrontendTransport(transport: AgentTransport): void {
  frontendTransports.delete(transport.id);
  if (activeFrontendRendererId === transport.id) {
    const remaining = [...frontendTransports.keys()];
    activeFrontendRendererId = remaining[remaining.length - 1] ?? null;
  }
}

export function getLocalMcpServerUrl(): string {
  const port = Number(process.env["PORT"] ?? 7777);
  const tlsEnabled = Boolean(
    process.env["TLS_CERT"] && process.env["TLS_KEY"]
  );
  const protocol = tlsEnabled ? "https" : "http";
  return `${protocol}://127.0.0.1:${port}/mcp`;
}

/**
 * Handle an MCP HTTP request at the /mcp path.
 * Uses WebStandardStreamableHTTPServerTransport for stateful sessions.
 */
export async function handleMcpHttpRequest(
  request: Request,
  options?: McpServerOptions
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/mcp")) return null;

  const method = request.method;

  if (method === "POST") {
    // Check for existing session
    const sessionId = request.headers.get("mcp-session-id");
    if (sessionId && sessionTransports.has(sessionId)) {
      const transport = sessionTransports.get(sessionId)!;
      return transport.handleRequest(request);
    }
    // A session id that is present but unknown must NOT fall through to the
    // new-session path: that constructed a fresh transport + server per stale
    // request (leaking both). Reject it — only an initialize request without a
    // session id creates a new session.
    if (sessionId) {
      return new Response("Session not found", { status: 404 });
    }

    // New session — create transport and server
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessionTransports.set(id, transport);
      }
    });
    // Evict the session when the transport closes (client disconnect without an
    // explicit DELETE) so sessionTransports — and the McpServer each entry keeps
    // alive — does not grow unbounded over the process lifetime.
    transport.onclose = () => {
      if (transport.sessionId) sessionTransports.delete(transport.sessionId);
    };

    const publicBaseUrl =
      options?.publicBaseUrl ?? `${url.protocol}//${url.host}`;
    const server = createMcpServer({ ...options, publicBaseUrl });
    await server.connect(transport);
    return transport.handleRequest(request);
  }

  if (method === "GET") {
    const sessionId = request.headers.get("mcp-session-id");
    if (sessionId && sessionTransports.has(sessionId)) {
      const transport = sessionTransports.get(sessionId)!;
      return transport.handleRequest(request);
    }
    return new Response("Session not found", { status: 404 });
  }

  if (method === "DELETE") {
    const sessionId = request.headers.get("mcp-session-id");
    if (sessionId && sessionTransports.has(sessionId)) {
      const transport = sessionTransports.get(sessionId)!;
      const response = await transport.handleRequest(request);
      sessionTransports.delete(sessionId);
      return response;
    }
    return new Response("Session not found", { status: 404 });
  }

  return new Response("Method not allowed", { status: 405 });
}
