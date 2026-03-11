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
import { Workflow, Job, Asset } from "@nodetool/models";
import { loadPythonPackageMetadata, type NodeMetadata } from "@nodetool/node-sdk";

export interface McpServerOptions {
  metadataRoots?: string[];
  metadataMaxDepth?: number;
}

let cachedMetadata: { nodesByType: Map<string, NodeMetadata> } | null = null;

function getNodeMetadata(options?: McpServerOptions): Map<string, NodeMetadata> {
  if (!cachedMetadata) {
    cachedMetadata = loadPythonPackageMetadata({
      roots: options?.metadataRoots,
      maxDepth: options?.metadataMaxDepth,
    });
  }
  return cachedMetadata.nodesByType;
}

/**
 * Create a configured MCP server with all NodeTool tools registered.
 */
export function createMcpServer(options?: McpServerOptions): McpServer {
  const server = new McpServer({
    name: "NodeTool API Server",
    version: "1.0.0",
  });

  // ── Workflow tools ──────────────────────────────────────────────

  server.tool(
    "list_workflows",
    "List workflows with flexible filtering.",
    {
      limit: z.number().optional().default(100).describe("Maximum number of workflows to return"),
      user_id: z.string().optional().default("1").describe("User ID"),
    },
    async ({ limit, user_id }) => {
      try {
        const [workflows] = await Workflow.paginate(user_id, { limit });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(workflows.map((w) => w.toDict())) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_workflow",
    "Get detailed information about a specific workflow.",
    {
      workflow_id: z.string().describe("The workflow ID"),
      user_id: z.string().optional().default("1").describe("User ID"),
    },
    async ({ workflow_id, user_id }) => {
      try {
        const workflow = await Workflow.find(user_id, workflow_id);
        if (!workflow) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Workflow not found" }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(workflow.toDict()) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  // ── Asset tools ─────────────────────────────────────────────────

  server.tool(
    "list_assets",
    "List or search assets with flexible filtering options.",
    {
      parent_id: z.string().optional().describe("Filter by parent asset ID"),
      content_type: z.string().optional().describe("Filter by content type"),
      limit: z.number().optional().default(100).describe("Maximum number of assets to return"),
      user_id: z.string().optional().default("1").describe("User ID"),
    },
    async ({ parent_id, content_type, limit, user_id }) => {
      try {
        const opts: Record<string, unknown> = { limit };
        if (parent_id) opts.parent_id = parent_id;
        if (content_type) opts.content_type = content_type;
        const [assets] = await Asset.paginate(user_id, opts);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(assets.map((a) => a.toDict())) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_asset",
    "Get detailed information about a specific asset.",
    {
      asset_id: z.string().describe("The asset ID"),
      user_id: z.string().optional().default("1").describe("User ID"),
    },
    async ({ asset_id, user_id }) => {
      try {
        const asset = await Asset.find(user_id, asset_id);
        if (!asset) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Asset not found" }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(asset.toDict()) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  // ── Node tools ──────────────────────────────────────────────────

  server.tool(
    "list_nodes",
    "List available nodes from installed packages.",
    {
      namespace: z.string().optional().describe("Filter by namespace prefix"),
      limit: z.number().optional().default(200).describe("Maximum number of nodes to return"),
    },
    async ({ namespace, limit }) => {
      try {
        const nodesByType = getNodeMetadata(options);
        let nodes = [...nodesByType.values()];
        if (namespace) {
          nodes = nodes.filter((n) => n.namespace.startsWith(namespace));
        }
        nodes.sort((a, b) => a.node_type.localeCompare(b.node_type));
        const result = nodes.slice(0, limit).map((n) => ({
          node_type: n.node_type,
          title: n.title,
          description: n.description,
          namespace: n.namespace,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "search_nodes",
    "Search for nodes by name, description, or tags.",
    {
      query: z.array(z.string()).describe("Search keywords"),
      n_results: z.number().optional().default(10).describe("Maximum results"),
    },
    async ({ query, n_results }) => {
      try {
        const nodesByType = getNodeMetadata(options);
        const nodes = [...nodesByType.values()];
        const lowerQuery = query.map((q) => q.toLowerCase());

        const scored = nodes.map((n) => {
          let score = 0;
          const searchable = `${n.title} ${n.description} ${n.node_type} ${n.namespace}`.toLowerCase();
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
            namespace: s.node.namespace,
          }));

        return {
          content: [{ type: "text" as const, text: JSON.stringify(matches) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_node_info",
    "Get detailed metadata for a node type.",
    {
      node_type: z.string().describe("The fully-qualified node type"),
    },
    async ({ node_type }) => {
      try {
        const nodesByType = getNodeMetadata(options);
        const node = nodesByType.get(node_type);
        if (!node) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Node type not found" }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(node) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  // ── Job tools ───────────────────────────────────────────────────

  server.tool(
    "list_jobs",
    "List jobs for user, optionally filtered by workflow.",
    {
      workflow_id: z.string().optional().describe("Filter by workflow ID"),
      limit: z.number().optional().default(100).describe("Maximum number of jobs to return"),
      user_id: z.string().optional().default("1").describe("User ID"),
    },
    async ({ workflow_id, limit, user_id }) => {
      try {
        const opts: Record<string, unknown> = { limit };
        if (workflow_id) opts.workflow_id = workflow_id;
        const [jobs] = await Job.paginate(user_id, opts);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(jobs.map((j) => j.toDict())) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_job",
    "Get a job by ID for user.",
    {
      job_id: z.string().describe("The job ID"),
      user_id: z.string().optional().default("1").describe("User ID"),
    },
    async ({ job_id, user_id }) => {
      try {
        const job = await Job.find(user_id, job_id);
        if (!job) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Job not found" }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(job.toDict()) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    },
  );

  // ── Collection tools (ChromaDB) ─────────────────────────────────

  server.tool(
    "list_collections",
    "List all vector database collections.",
    {
      limit: z.number().optional().default(50).describe("Maximum collections to return"),
    },
    async ({ limit }) => {
      try {
        const { ChromaClient } = await import("chromadb");
        const client = new ChromaClient();
        const collections = await client.listCollections();
        const result = collections.slice(0, limit);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ collections: result }) }],
        };
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "ChromaDB not available" }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_collection",
    "Get details about a specific collection.",
    {
      name: z.string().describe("Collection name"),
    },
    async ({ name }) => {
      try {
        const { ChromaClient } = await import("chromadb");
        const client = new ChromaClient();
        const collection = await client.getCollection({ name });
        const count = await collection.count();
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ name, count }) }],
        };
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "ChromaDB not available" }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "query_collection",
    "Query a collection for similar documents using semantic search.",
    {
      name: z.string().describe("Collection name"),
      query_texts: z.array(z.string()).describe("Query texts for semantic search"),
      n_results: z.number().optional().default(10).describe("Number of results"),
    },
    async ({ name, query_texts, n_results }) => {
      try {
        const { ChromaClient } = await import("chromadb");
        const client = new ChromaClient();
        const collection = await client.getCollection({ name });
        const results = await collection.query({ queryTexts: query_texts, nResults: n_results });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(results) }],
        };
      } catch {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "ChromaDB not available" }) }],
          isError: true,
        };
      }
    },
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
const sessionTransports = new Map<string, WebStandardStreamableHTTPServerTransport>();

/**
 * Handle an MCP HTTP request at the /mcp path.
 * Uses WebStandardStreamableHTTPServerTransport for stateful sessions.
 */
export async function handleMcpHttpRequest(
  request: Request,
  options?: McpServerOptions,
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
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessionTransports.set(id, transport);
      },
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
