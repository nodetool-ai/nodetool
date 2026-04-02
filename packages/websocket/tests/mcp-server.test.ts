import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb, Workflow, Job, Asset } from "@nodetool/models";
import { createMcpServer, createMcpStdioTransport } from "../src/mcp-server.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function makeMetadataRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-"));
  const metadataDir = path.join(
    root,
    "pkg",
    "src",
    "nodetool",
    "package_metadata"
  );
  fs.mkdirSync(metadataDir, { recursive: true });
  fs.writeFileSync(
    path.join(metadataDir, "pkg.json"),
    JSON.stringify({
      name: "pkg",
      nodes: [
        {
          title: "Test Node",
          description: "A test node for searching",
          namespace: "test",
          node_type: "test.TestNode",
          layout: "default",
          properties: [],
          outputs: []
        },
        {
          title: "Image Resize",
          description: "Resizes images",
          namespace: "image",
          node_type: "image.Resize",
          layout: "default",
          properties: [],
          outputs: []
        }
      ]
    }),
    "utf8"
  );
  return root;
}

describe("MCP Server", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("creates a server instance", () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
    expect(server).toBeInstanceOf(Object);
  });

  it("creates a stdio transport", () => {
    const transport = createMcpStdioTransport();
    expect(transport).toBeDefined();
  });

  it("registers list_workflows tool", () => {
    const server = createMcpServer();
    // Access internal registered tools via the underlying server
    const tools = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    expect(tools).toHaveProperty("list_workflows");
  });

  it("registers get_workflow tool", () => {
    const server = createMcpServer();
    const tools = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    expect(tools).toHaveProperty("get_workflow");
  });

  it("registers all expected tools", () => {
    const server = createMcpServer();
    const tools = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    const expectedTools = [
      "list_workflows",
      "get_workflow",
      "list_assets",
      "get_asset",
      "list_nodes",
      "search_nodes",
      "get_node_info",
      "list_jobs",
      "get_job",
      "list_collections",
      "get_collection",
      "query_collection"
    ];
    for (const name of expectedTools) {
      expect(tools).toHaveProperty(name);
    }
  });

  it("list_workflows tool has correct description", () => {
    const server = createMcpServer();
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, { description?: string }>;
      }
    )._registeredTools;
    expect(tools.list_workflows.description).toBe(
      "List workflows with flexible filtering."
    );
  });

  it("get_workflow tool has correct description", () => {
    const server = createMcpServer();
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, { description?: string }>;
      }
    )._registeredTools;
    expect(tools.get_workflow.description).toBe(
      "Get detailed information about a specific workflow."
    );
  });
});
