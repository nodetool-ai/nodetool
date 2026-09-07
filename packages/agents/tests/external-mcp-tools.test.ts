/**
 * External MCP servers on the belt: a real MCP server over an in-memory
 * transport, discovered and called through `McpClientPool`, and the guest
 * namespace their names graft onto.
 */

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  mcpCredentialSecretName,
  mcpToolName,
  resolveSecretReferences,
  type McpServerConfig
} from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ExternalMcpTool,
  McpClientPool,
  getCachedExternalMcpTools,
  getExternalMcpTools,
  normalizeCallResult,
  type McpClientPoolOptions
} from "../src/tools/external-mcp-tools.js";
import { graftedModuleFor } from "../src/codeact/capability-modules.js";
import { IMAGE_CONTENTS_FIELD } from "../src/tools/image-injection.js";

const PNG_BYTE = "iVBORw0KGgo=";

function fakeServer(): { server: McpServer; calls: unknown[] } {
  const calls: unknown[] = [];
  const server = new McpServer({ name: "fake", version: "0.0.1" });
  server.registerTool(
    "render.scene",
    {
      description: "Render the current scene",
      inputSchema: { samples: z.number().int().optional() }
    },
    async (args) => {
      calls.push(args);
      return {
        content: [
          { type: "text", text: `rendered ${args.samples ?? 0}` },
          { type: "image", data: PNG_BYTE, mimeType: "image/png" }
        ]
      };
    }
  );
  server.registerTool(
    "fail",
    { description: "Always fails", inputSchema: {} },
    async () => ({ isError: true, content: [{ type: "text", text: "boom" }] })
  );
  return { server, calls };
}

const config: McpServerConfig = {
  id: "blender",
  name: "Blender",
  enabled: true,
  transport: { type: "stdio", command: "unused", args: [], env: {} }
};

let opened: McpServer[] = [];

function poolOver(server: McpServer): McpClientPool {
  return new McpClientPool({
    connect: async () => {
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test", version: "0" });
      await Promise.all([
        client.connect(clientSide),
        server.connect(serverSide)
      ]);
      opened.push(server);
      return client;
    }
  });
}

/**
 * A pool whose connection never opens: the server accepted the socket and
 * went quiet, the way an HTTP server does when it refuses the Streamable POST
 * and then opens an SSE stream with no `endpoint` event. Only cancellation
 * settles it — which is what a real transport's `close()` does.
 */
function hangingPool(overrides: Partial<McpClientPoolOptions> = {}): {
  pool: McpClientPool;
  cancelled: () => number;
} {
  let cancels = 0;
  const pool = new McpClientPool({
    ...overrides,
    connect: (_config, _secrets, signal) =>
      new Promise<Client>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            cancels += 1;
            reject(
              signal.reason instanceof Error
                ? signal.reason
                : new Error("cancelled")
            );
          },
          { once: true }
        );
      })
  });
  return { pool, cancelled: () => cancels };
}

afterEach(async () => {
  await Promise.all(opened.map((s) => s.close()));
  opened = [];
});

describe("mcpToolName", () => {
  it("prefixes, normalizes to an identifier, and keeps the server on truncation", () => {
    expect(mcpToolName("blender", "render.scene")).toBe(
      "mcp_blender_render_scene"
    );
    expect(mcpToolName("hf", "__weird--name__")).toBe("mcp_hf_weird_name");
    const long = mcpToolName("hf", "a".repeat(100));
    expect(long).toHaveLength(64);
    expect(long.startsWith("mcp_hf_")).toBe(true);
    expect(/^[a-z][a-z0-9_]*$/.test(long)).toBe(true);
  });
});

describe("mcpCredentialSecretName", () => {
  it("keeps distinct (server, key) pairs apart", () => {
    const names = [
      mcpCredentialSecretName("a_b", "c"),
      mcpCredentialSecretName("a", "b_c"),
      mcpCredentialSecretName("a", "B_C"),
      mcpCredentialSecretName("a", "b-c")
    ];
    expect(new Set(names).size).toBe(names.length);
    expect(names[2]).toBe("MCP_A_0042005F0043");
    expect(mcpCredentialSecretName("a", "\ud800")).not.toBe(
      mcpCredentialSecretName("a", "\ud801")
    );
  });
});

describe("graftedModuleFor", () => {
  it("routes MCP names to the mcp namespace", () => {
    expect(graftedModuleFor("mcp_blender_render_scene")).toBe("mcp");
    expect(graftedModuleFor("ui_add_node")).toBe("ui");
    expect(graftedModuleFor("run_node")).toBe("session");
  });
});

describe("resolveSecretReferences", () => {
  it("replaces ${NAME} references inline and blanks unknown ones", async () => {
    const out = await resolveSecretReferences(
      {
        A: "${HF_TOKEN}",
        B: "literal",
        C: "${MISSING}",
        D: "Bearer ${HF_TOKEN}"
      },
      async (name) => (name === "HF_TOKEN" ? "tok" : null)
    );
    expect(out).toEqual({ A: "tok", B: "literal", C: "", D: "Bearer tok" });
  });

  it("resolves a reference whose secret is itself a template", async () => {
    const out = await resolveSecretReferences(
      { Authorization: "${MCP_HF_AUTH}" },
      async (name) =>
        name === "MCP_HF_AUTH" ? "Bearer ${HF_TOKEN}" : name === "HF_TOKEN" ? "tok" : null
    );
    expect(out).toEqual({ Authorization: "Bearer tok" });
  });

  it("reports every value an expansion produced, not just the finished one", async () => {
    const seen: string[] = [];
    await resolveSecretReferences(
      { Authorization: "${MCP_HF_AUTH}" },
      async (name) =>
        name === "MCP_HF_AUTH"
          ? "Bearer ${HF_TOKEN}"
          : name === "HF_TOKEN"
            ? "hf_secret_value"
            : null,
      (value) => seen.push(value)
    );
    expect(seen).toEqual(["hf_secret_value", "Bearer hf_secret_value"]);
  });
});

describe("normalizeCallResult", () => {
  it("flattens text, images and resources", () => {
    const out = normalizeCallResult({
      content: [
        { type: "text", text: "a" },
        { type: "image", data: PNG_BYTE, mimeType: "image/jpeg" },
        { type: "resource", resource: { uri: "file:///x", text: "b" } }
      ],
      structuredContent: { n: 1 }
    });
    expect(out.text).toBe("a\nb");
    expect(out.images).toEqual([{ data: PNG_BYTE, mimeType: "image/jpeg" }]);
    expect(out.structured).toEqual({ n: 1 });
    expect(out.isError).toBe(false);
    expect(out.links).toEqual([]);
  });

  it("keeps a resource_link, the only thing a file-producing tool returned", () => {
    const out = normalizeCallResult({
      content: [
        {
          type: "resource_link",
          uri: "https://example.com/render.glb",
          name: "render.glb",
          mimeType: "model/gltf-binary",
          description: "The finished render"
        }
      ]
    });
    expect(out.links).toEqual([
      {
        uri: "https://example.com/render.glb",
        name: "render.glb",
        mimeType: "model/gltf-binary",
        description: "The finished render"
      }
    ]);
    expect(out.text).toBe("[resource render.glb: https://example.com/render.glb]");
  });
});

describe("McpClientPool", () => {
  it("discovers tools, calls them, and reports images", async () => {
    const { server, calls } = fakeServer();
    const pool = poolOver(server);
    await pool.sync([config]);
    const tools = await getExternalMcpTools(pool);
    expect(tools.map((t) => t.name).sort()).toEqual([
      "mcp_blender_fail",
      "mcp_blender_render_scene"
    ]);
    const render = tools.find(
      (t) => t.name === "mcp_blender_render_scene"
    ) as ExternalMcpTool;
    expect(render.inputSchema).toMatchObject({ type: "object" });

    const result = (await render.process({} as ProcessingContext, {
      samples: 4
    })) as Record<string, unknown>;
    expect(calls).toEqual([{ samples: 4 }]);
    expect(result.text).toBe("rendered 4");
    expect(result[IMAGE_CONTENTS_FIELD]).toEqual([
      { data: PNG_BYTE, mimeType: "image/png" }
    ]);

    const failed = tools.find((t) => t.name === "mcp_blender_fail")!;
    expect(await failed.process({} as ProcessingContext, {})).toEqual({
      error: "mcp_tool_error",
      message: "boom"
    });

    // The cached belt matches the discovered one without I/O.
    expect(getCachedExternalMcpTools(pool).map((t) => t.name).sort()).toEqual(
      tools.map((t) => t.name).sort()
    );
    await pool.close();
  });

  it("skips a server that refuses to connect and retries on next sync", async () => {
    let attempts = 0;
    const pool = new McpClientPool({
      connect: async () => {
        attempts += 1;
        throw new Error("refused");
      }
    });
    await pool.sync([config]);
    const errors: string[] = [];
    const tools = await getExternalMcpTools(pool, (id, err) =>
      errors.push(`${id}:${err.message}`)
    );
    expect(tools).toEqual([]);
    expect(errors).toEqual(["blender:refused"]);
    expect(pool.serverIds()).toEqual([]);
    await pool.sync([config]);
    expect(pool.serverIds()).toEqual(["blender"]);
    expect(attempts).toBe(2);
    await pool.close();
  });

  it("numbers tools whose remote names normalize to one belt name", async () => {
    const server = new McpServer({ name: "dup", version: "0" });
    server.registerTool("render.scene", { inputSchema: {} }, async () => ({
      content: [{ type: "text", text: "dot" }]
    }));
    server.registerTool("render_scene", { inputSchema: {} }, async () => ({
      content: [{ type: "text", text: "underscore" }]
    }));
    const pool = poolOver(server);
    await pool.sync([config]);
    const tools = await getExternalMcpTools(pool);
    expect(tools.map((t) => t.name).sort()).toEqual([
      "mcp_blender_render_scene",
      "mcp_blender_render_scene_2"
    ]);
    // Names follow sorted remote names, so the mapping is the same every turn.
    const byRemote = new Map(
      tools.map((t) => [(t as ExternalMcpTool).remote.name, t.name])
    );
    expect(byRemote.get("render_scene")).toBe("mcp_blender_render_scene");
    expect(byRemote.get("render.scene")).toBe("mcp_blender_render_scene_2");
    const second = tools.find((t) => t.name.endsWith("_2"))!;
    expect(await second.process({} as ProcessingContext, {})).toEqual({
      text: "dot"
    });
    await pool.close();
  });

  it("redacts a resolved secret from the error it reports", async () => {
    const pool = new McpClientPool({
      connect: async (_config, secrets) => {
        secrets.add("s3cret-token");
        return {
          listTools: async () => {
            throw new Error("401 for s3cret-token from upstream");
          },
          close: async () => undefined
        } as unknown as Client;
      }
    });
    await pool.sync([config]);
    const errors: string[] = [];
    await getExternalMcpTools(pool, (_id, err) => errors.push(err.message));
    expect(errors).toEqual(["401 for [redacted] from upstream"]);
  });

  it("closes a client whose discovery failed", async () => {
    let closed = 0;
    const pool = new McpClientPool({
      connect: async () =>
        ({
          listTools: async () => {
            throw new Error("list failed");
          },
          close: async () => {
            closed += 1;
          }
        }) as unknown as Client
    });
    await pool.sync([config]);
    expect(await getExternalMcpTools(pool)).toEqual([]);
    expect(closed).toBe(1);
  });

  it("hands back a resource link as the tool's answer", async () => {
    const server = new McpServer({ name: "links", version: "0" });
    server.registerTool("export", { inputSchema: {} }, async () => ({
      content: [
        {
          type: "resource_link",
          uri: "https://example.com/render.glb",
          name: "render.glb",
          mimeType: "model/gltf-binary"
        }
      ]
    }));
    const pool = poolOver(server);
    await pool.sync([config]);
    const [tool] = await getExternalMcpTools(pool);
    const out = (await tool.process({} as ProcessingContext, {})) as Record<
      string,
      unknown
    >;
    expect(out.resource_links).toEqual([
      {
        uri: "https://example.com/render.glb",
        name: "render.glb",
        mimeType: "model/gltf-binary"
      }
    ]);
    await pool.close();
  });

  it("gives up on a server that accepts the connection and never answers", async () => {
    const { pool } = hangingPool({ connectTimeoutMs: 50 });
    await pool.sync([config]);
    const errors: string[] = [];
    const tools = await getExternalMcpTools(pool, (id, err) =>
      errors.push(`${id}:${err.message}`)
    );
    expect(tools).toEqual([]);
    expect(errors[0]).toContain("did not answer within 50ms");
    expect(pool.serverIds()).toEqual([]);
    await pool.close();
  });

  it("lets a removal cancel a connection discovery is still waiting on", async () => {
    const { pool, cancelled } = hangingPool({ connectTimeoutMs: 60_000 });
    await pool.sync([config]);
    // The turn's belt is blocked on the server that never answers.
    const discovery = getExternalMcpTools(pool);
    // The user disables it in Settings. Without cancellation this waits out
    // the full deadline behind the discovery holding the pool's queue.
    await pool.sync([{ ...config, enabled: false }]);
    expect(pool.serverIds()).toEqual([]);
    expect(await discovery).toEqual([]);
    expect(cancelled()).toBe(1);
    await pool.close();
  });

  it("drops disabled and removed servers, reconnects on a changed config", async () => {
    const { server } = fakeServer();
    let connects = 0;
    const pool = new McpClientPool({
      connect: async () => {
        connects += 1;
        const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "test", version: "0" });
        await Promise.all([
          client.connect(clientSide),
          server.connect(serverSide)
        ]);
        opened.push(server);
        return client;
      }
    });
    await pool.sync([config]);
    await pool.sync([config]);
    expect(connects).toBe(1);
    await pool.sync([{ ...config, name: "Blender 4" }]);
    expect(connects).toBe(2);
    await pool.sync([{ ...config, enabled: false }]);
    expect(pool.serverIds()).toEqual([]);
    await pool.close();
  });
});
