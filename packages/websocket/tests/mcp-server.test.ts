import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb, Workflow, Job, Asset } from "@nodetool/models";
import { createMcpServer, createMcpStdioTransport } from "../src/mcp-server.js";

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

async function callTool(
  server: ReturnType<typeof createMcpServer>,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ text: string }>; isError?: boolean }> {
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: Record<string, unknown>) => Promise<unknown> }
      >;
    }
  )._registeredTools;
  return tools[name].handler(args) as Promise<{
    content: Array<{ text: string }>;
    isError?: boolean;
  }>;
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

  it("registers run_workflow tool", () => {
    const server = createMcpServer();
    const tools = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    expect(tools).toHaveProperty("run_workflow");
  });

  it("registers all expected tools", () => {
    const server = createMcpServer();
    const tools = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    const expectedTools = [
      "list_workflows",
      "get_workflow",
      "run_workflow",
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

  it("run_workflow tool has correct description", () => {
    const server = createMcpServer();
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, { description?: string }>;
      }
    )._registeredTools;
    expect(tools.run_workflow.description).toBe(
      "Run a workflow on the backend, optionally passing parameters."
    );
  });

  it("serializes workflow results without relying on toDict()", async () => {
    await Workflow.create({
      user_id: "u1",
      name: "Workflow MCP",
      graph: { nodes: [], edges: [] },
      access: "private"
    });

    const server = createMcpServer();
    const response = await callTool(server, "list_workflows", {
      user_id: "u1",
      limit: 10
    });

    expect(response.isError).not.toBe(true);
    const body = JSON.parse(response.content[0].text) as {
      workflows: Array<{ name: string }>;
      next: string | null;
    };
    expect(body.workflows).toHaveLength(1);
    expect(body.workflows[0]?.name).toBe("Workflow MCP");
    expect(body.next).toBeNull();
  });

  it("runs a simple workflow on the backend", async () => {
    const workflow = (await Workflow.create({
      user_id: "u1",
      name: "Workflow Runner",
      access: "private",
      graph: {
        nodes: [
          {
            id: "const-1",
            type: "nodetool.constant.Integer",
            data: { value: 7 }
          },
          {
            id: "out-1",
            type: "nodetool.output.Output",
            data: { name: "answer", description: "" }
          }
        ],
        edges: [
          {
            id: "edge-1",
            source: "const-1",
            sourceHandle: "output",
            target: "out-1",
            targetHandle: "value",
            edge_type: "data"
          }
        ]
      }
    })) as Workflow;

    const server = createMcpServer();
    const response = await callTool(server, "run_workflow", {
      user_id: "u1",
      workflow_id: workflow.id,
      params: {}
    });

    expect(response.isError).not.toBe(true);
    const body = JSON.parse(response.content[0].text) as {
      job_id: string;
      status: string;
      outputs: Record<string, unknown[]>;
    };
    expect(body.job_id).toBeTruthy();
    expect(body.status).toBe("completed");
    expect(Object.values(body.outputs).flat()).toContain(7);
  });

  it("maps MCP snake_case filters to model queries", async () => {
    const workflow = (await Workflow.create({
      user_id: "u1",
      name: "Workflow Filter Target",
      graph: { nodes: [], edges: [] },
      access: "private"
    })) as Workflow;

    await Asset.create({
      user_id: "u1",
      name: "keep.png",
      content_type: "image/png",
      parent_id: "folder-1"
    });
    await Asset.create({
      user_id: "u1",
      name: "match.png",
      content_type: "image/png",
      parent_id: "folder-2"
    });

    await Job.create({
      user_id: "u1",
      workflow_id: workflow.id,
      status: "running"
    });
    await Job.create({
      user_id: "u1",
      workflow_id: "other-workflow",
      status: "running"
    });

    const server = createMcpServer();

    const assetsResponse = await callTool(server, "list_assets", {
      user_id: "u1",
      parent_id: "folder-2",
      content_type: "image/png",
      limit: 10
    });
    const assets = JSON.parse(assetsResponse.content[0].text) as {
      assets: Array<{
        name: string;
        parent_id: string | null;
      }>;
      next: string | null;
    };
    expect(assets.assets).toHaveLength(1);
    expect(assets.assets[0]?.name).toBe("match.png");
    expect(assets.assets[0]?.parent_id).toBe("folder-2");

    const jobsResponse = await callTool(server, "list_jobs", {
      user_id: "u1",
      workflow_id: workflow.id,
      limit: 10
    });
    const jobs = JSON.parse(jobsResponse.content[0].text) as {
      jobs: Array<{
        workflow_id: string;
      }>;
      next_start_key: string | null;
    };
    expect(jobs.jobs).toHaveLength(1);
    expect(jobs.jobs[0]?.workflow_id).toBe(workflow.id);
  });
});
