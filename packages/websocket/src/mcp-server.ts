/**
 * MCP (Model Context Protocol) server for NodeTool.
 *
 * Exposes NodeTool workflows, assets, nodes, jobs, and collections
 * as MCP tools using the official TypeScript MCP SDK.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { createLogger } from "@nodetool/config";
import { Workflow, Job, Asset } from "@nodetool/models";
import {
  toAssetResponse,
  toJobResponse,
  toWorkflowResponse
} from "./http-api.js";
import { uiToolSchemas } from "@nodetool/protocol";
import { NodeRegistry, type NodeMetadata } from "@nodetool/node-sdk";
import { registerBaseNodes } from "@nodetool/base-nodes";
import { registerElevenLabsNodes } from "@nodetool/elevenlabs-nodes";
import { registerFalNodes } from "@nodetool/fal-nodes";
import { registerKieNodes } from "@nodetool/kie-nodes";
import { registerReplicateNodes } from "@nodetool/replicate-nodes";
import {
  PythonNodeExecutor,
  PythonStdioBridge,
  type NodeExecutor
} from "@nodetool/runtime";
import { WorkflowRunner } from "@nodetool/kernel";
import type { AgentTransport } from "./agent/transport.js";

export interface McpServerOptions {
  metadataRoots?: string[];
  metadataMaxDepth?: number;
  registry?: NodeRegistry;
}

const log = createLogger("nodetool.websocket.mcp-server");

const GLOBAL_FRONTEND_SESSION_ID = "global-mcp";
let activeFrontendTransport: AgentTransport | null = null;

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
  pythonBridge: PythonStdioBridge;
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
      const registry = new NodeRegistry();
      registry.loadPythonMetadata({
        roots: options?.metadataRoots,
        maxDepth: options?.metadataMaxDepth ?? 8
      });
      registerBaseNodes(registry);
      registerElevenLabsNodes(registry);
      registerFalNodes(registry);
      registerKieNodes(registry);
      registerReplicateNodes(registry);

      const pythonBridge = new PythonStdioBridge({
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
          if (line.trim()) log.debug(`[python-worker] ${line}`);
        }
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
    })();
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

  for (const [toolName, schema] of Object.entries(uiToolSchemas)) {
    server.tool(toolName, schema.description, schema.parameters, async (args) => {
      const transport = activeFrontendTransport;
      if (!transport || !transport.isAlive) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error:
                  "No active NodeTool renderer is connected for frontend UI tools."
              })
            }
          ],
          isError: true
        };
      }

      try {
        const result = await transport.executeTool(
          GLOBAL_FRONTEND_SESSION_ID,
          `mcp-ui-${toolName}-${crypto.randomUUID()}`,
          toolName,
          args
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
    });
  }

  // ── Workflow tools ──────────────────────────────────────────────

  server.tool(
    "list_workflows",
    "List workflows with flexible filtering.",
    {
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum number of workflows to return"),
      user_id: z.string().optional().default("1").describe("User ID")
    },
    async ({ limit, user_id }) => {
      try {
        const [workflows, next] = await Workflow.paginate(user_id, { limit });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                workflows: workflows.map((workflow) => toWorkflowResponse(workflow)),
                next: next || null
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

  server.tool(
    "get_workflow",
    "Get detailed information about a specific workflow.",
    {
      workflow_id: z.string().describe("The workflow ID"),
      user_id: z.string().optional().default("1").describe("User ID")
    },
    async ({ workflow_id, user_id }) => {
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
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(toWorkflowResponse(workflow))
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

        const runner = new WorkflowRunner(job.id, {
          resolveExecutor: (node) =>
            runtime.resolveExecutor(
              node as { id: string; type: string; [key: string]: unknown }
            )
        });
        const result = await runner.run(
          { job_id: job.id, workflow_id, params },
          runnableGraph
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

  server.tool(
    "list_assets",
    "List or search assets with flexible filtering options.",
    {
      parent_id: z.string().optional().describe("Filter by parent asset ID"),
      content_type: z.string().optional().describe("Filter by content type"),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum number of assets to return"),
      user_id: z.string().optional().default("1").describe("User ID")
    },
    async ({ parent_id, content_type, limit, user_id }) => {
      try {
        const opts: {
          limit: number;
          parentId?: string;
          contentType?: string;
        } = { limit };
        if (parent_id) opts.parentId = parent_id;
        if (content_type) opts.contentType = content_type;
        const [assets, next] = await Asset.paginate(user_id, opts);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                assets: assets.map((asset) => toAssetResponse(asset)),
                next: next || null
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

  server.tool(
    "get_asset",
    "Get detailed information about a specific asset.",
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
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(toAssetResponse(asset))
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

  // ── Node tools ──────────────────────────────────────────────────

  server.tool(
    "list_nodes",
    "List available nodes from installed packages.",
    {
      namespace: z.string().optional().describe("Filter by namespace prefix"),
      limit: z
        .number()
        .optional()
        .default(200)
        .describe("Maximum number of nodes to return")
    },
    async ({ namespace, limit }) => {
      try {
        let nodes = await getUnifiedNodeMetadata(options);
        if (namespace) {
          nodes = nodes.filter((n) => n.namespace.startsWith(namespace));
        }
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

  server.tool(
    "search_nodes",
    "Search for nodes by name, description, or tags.",
    {
      query: z.array(z.string()).describe("Search keywords"),
      n_results: z.number().optional().default(10).describe("Maximum results")
    },
    async ({ query, n_results }) => {
      try {
        const nodes = await getUnifiedNodeMetadata(options);
        const lowerQuery = query.map((q) => q.toLowerCase());

        const scored = nodes.map((n) => {
          let score = 0;
          const searchable =
            `${n.title} ${n.description} ${n.node_type} ${n.namespace}`.toLowerCase();
          for (const q of lowerQuery) {
            if (searchable.includes(q)) score++;
          }
          return { node: n, score };
        });

        const matches = scored
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, n_results)
          .map((s) => ({
            node_type: s.node.node_type,
            title: s.node.title,
            description: s.node.description,
            namespace: s.node.namespace
          }));

        return {
          content: [{ type: "text" as const, text: JSON.stringify(matches) }]
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

  server.tool(
    "list_jobs",
    "List jobs for user, optionally filtered by workflow.",
    {
      workflow_id: z.string().optional().describe("Filter by workflow ID"),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum number of jobs to return"),
      user_id: z.string().optional().default("1").describe("User ID")
    },
    async ({ workflow_id, limit, user_id }) => {
      try {
        const opts: {
          limit: number;
          workflowId?: string;
        } = { limit };
        if (workflow_id) opts.workflowId = workflow_id;
        const [jobs, nextStartKey] = await Job.paginate(user_id, opts);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                jobs: jobs.map((job) => toJobResponse(job)),
                next_start_key: nextStartKey || null
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

  server.tool(
    "get_job",
    "Get a job by ID for user.",
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
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(toJobResponse(job))
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

  // ── Collection tools (sqlite-vec) ───────────────────────────────

  server.tool(
    "list_collections",
    "List all vector database collections.",
    {
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum collections to return")
    },
    async ({ limit }) => {
      try {
        const { getVecStore } = await import("@nodetool/vectorstore");
        const store = await getVecStore();
        const collections = await store.listCollections();
        const result = await Promise.all(
          collections.slice(0, limit).map(async (c) => {
            const count = await c.count();
            const metadata = c.metadata ?? {};
            let workflowName: string | null = null;
            const workflowId = metadata.workflow as string | undefined;
            if (workflowId) {
              const workflow = (await Workflow.get(workflowId)) as Workflow | null;
              if (workflow) workflowName = workflow.name;
            }
            return {
              name: c.name,
              count,
              metadata,
              workflow_name: workflowName
            };
          })
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ collections: result, count: result.length })
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
    "get_collection",
    "Get details about a specific collection.",
    {
      name: z.string().describe("Collection name")
    },
    async ({ name }) => {
      try {
        const { getVecStore } = await import("@nodetool/vectorstore");
        const store = await getVecStore();
        const collection = await store.getCollection({ name });
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
        const { getVecStore } = await import("@nodetool/vectorstore");
        const store = await getVecStore();
        const collection = await store.getCollection({ name });
        const results = await collection.query({
          queryTexts: query_texts,
          nResults: n_results
        });
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

export function setMcpFrontendTransport(transport: AgentTransport): void {
  activeFrontendTransport = transport;
}

export function clearMcpFrontendTransport(transport: AgentTransport): void {
  if (activeFrontendTransport === transport) {
    activeFrontendTransport = null;
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

    // New session — create transport and server
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessionTransports.set(id, transport);
      }
    });

    const server = createMcpServer(options);
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
