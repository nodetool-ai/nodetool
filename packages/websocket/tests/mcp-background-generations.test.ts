/**
 * A generation an MCP tool call starts with `background: true` must be
 * collectable by its id: through a direct MCP tool, from an `execute_code`
 * action, and in `list_generations`.
 *
 * The receipt tells the client to "Call await_generation". The MCP mount used
 * to list no such tool, and the generation row was never written because the
 * mount's context had no generation tracker listening to its prediction
 * messages, so the sandbox's await answered "Generation <id> was not found".
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initTestDb } from "@nodetool-ai/models";
import {
  BaseProvider,
  generationRegistry,
  type Message,
  type ProviderStreamItem
} from "@nodetool-ai/runtime";
import { registerAgentMcpTools } from "../src/mcp-agent-tools.js";

type ToolResponse = {
  content: Array<{ type?: string; text?: string }>;
  isError?: boolean;
};

type RegisteredTools = Record<
  string,
  { handler: (args: Record<string, unknown>) => Promise<unknown> }
>;

function registeredTools(server: McpServer): RegisteredTools {
  // Safety: the SDK keeps registered tools on a private field; the shape is
  // the same one `mcp-agent-tools.test.ts` reads.
  return (server as unknown as { _registeredTools: RegisteredTools })
    ._registeredTools;
}

async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const tool = registeredTools(server)[name];
  if (!tool) throw new Error(`MCP tool ${name} is not registered`);
  const response = (await tool.handler(args)) as ToolResponse;
  return JSON.parse(response.content[0]?.text ?? "null") as Record<
    string,
    unknown
  >;
}

let png: Uint8Array;

/** Answers every text-to-image call with one small PNG. No network. */
class StillProvider extends BaseProvider {
  calls = 0;
  constructor() {
    super("still-test");
  }
  override async textToImage(): Promise<Uint8Array> {
    this.calls++;
    return png;
  }
  async generateMessage(): Promise<Message> {
    throw new Error("unused");
  }
  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("unused");
  }
}

let dataDir: string;
const dataDirEnv = process.platform === "win32" ? "APPDATA" : "XDG_DATA_HOME";
let previousDataDir: string | undefined;

beforeAll(async () => {
  previousDataDir = process.env[dataDirEnv];
  dataDir = mkdtempSync(join(tmpdir(), "nodetool-mcp-background-"));
  process.env[dataDirEnv] = dataDir;
  png = new Uint8Array(
    await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#336699" }
    })
      .png()
      .toBuffer()
  );
});

afterAll(() => {
  if (previousDataDir === undefined) delete process.env[dataDirEnv];
  else process.env[dataDirEnv] = previousDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  initTestDb();
  generationRegistry.reset();
});

function mount() {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  const run = registerAgentMcpTools(server, {
    agentToolsScope: { userId: "1", source: "http-session" }
  });
  const provider = new StillProvider();
  run.context.registerProvider("still-test", provider);
  return { server, run, provider };
}

async function startBackground(server: McpServer): Promise<string> {
  const receipt = await callTool(server, "generate_image", {
    provider: "still-test",
    model: "still-1",
    prompt: "a lighthouse at dusk",
    background: true
  });
  expect(receipt["background"]).toBe(true);
  const id = receipt["generation_id"];
  expect(typeof id).toBe("string");
  return id as string;
}

describe("background generations on the MCP mount", () => {
  it("lists every tool the background receipt tells the client to call", async () => {
    const { server } = mount();
    const receipt = await callTool(server, "generate_image", {
      provider: "still-test",
      model: "still-1",
      prompt: "a lighthouse at dusk",
      background: true
    });
    const hint = String(receipt["next"]);
    const named = [...hint.matchAll(/\b([a-z]+_generation)\b/g)].map(
      (match) => match[1]
    );
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) {
      expect(Object.keys(registeredTools(server))).toContain(name);
    }
  });

  it("awaits a background generation by id through the direct MCP tool", async () => {
    const { server, provider } = mount();
    const id = await startBackground(server);

    const record = await callTool(server, "await_generation", {
      generation_id: id,
      timeout_seconds: 10
    });

    expect(record["error"]).toBeUndefined();
    expect(record["status"]).toBe("completed");
    expect(record["asset_ids"]).toHaveLength(1);
    expect(provider.calls).toBe(1);

    const listed = await callTool(server, "list_generations", {});
    const rows = listed["generations"] as Array<Record<string, unknown>>;
    expect(rows.map((row) => row["generation_id"])).toContain(id);
  });

  it("awaits a background generation from an execute_code action", async () => {
    const { server } = mount();
    const id = await startBackground(server);

    const tool = registeredTools(server)["execute_code"];
    const response = (await tool.handler({
      code: `const g = await nodetool.generations.wait(${JSON.stringify(id)}, { timeout_seconds: 10 });
return { status: g.status, assets: g.asset_ids.length };`
    })) as ToolResponse;
    const observation = JSON.parse(response.content[0]?.text ?? "{}") as {
      ok?: boolean;
      result?: { status?: string; assets?: number };
      error?: unknown;
    };

    expect(observation.error).toBeUndefined();
    expect(observation.ok).toBe(true);
    expect(observation.result).toEqual({ status: "completed", assets: 1 });
  });
});
