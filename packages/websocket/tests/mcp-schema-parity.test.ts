/**
 * The MCP `tools/list` schema of a direct tool and the signature an
 * `execute_code` action reads from `nodetool.searchTools()` come from one
 * capability spec. If a parameter reaches one surface and not the other, an
 * MCP client cannot pass what the sandbox accepts (end_frame_file on
 * animate_image was reported missing from the MCP schema while the sandbox
 * signature showed it).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { initTestDb } from "@nodetool-ai/models";
import { capabilityForName } from "@nodetool-ai/agents";
import { createMcpServer } from "../src/mcp-server.js";

/**
 * Parameters the MCP mount leaves out on purpose. view_image's region crop and
 * downscale are stored copies with no asset row, so the mount has no URL to
 * give for them.
 */
const MCP_OMITTED: Record<string, readonly string[]> = {
  view_image: ["region", "detail"]
};

let dataDir: string;
const dataDirEnv = process.platform === "win32" ? "APPDATA" : "XDG_DATA_HOME";
let previousDataDir: string | undefined;

beforeAll(() => {
  previousDataDir = process.env[dataDirEnv];
  dataDir = mkdtempSync(join(tmpdir(), "nodetool-mcp-parity-"));
  process.env[dataDirEnv] = dataDir;
});

afterAll(() => {
  if (previousDataDir === undefined) delete process.env[dataDirEnv];
  else process.env[dataDirEnv] = previousDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  initTestDb();
});

async function connect() {
  const server = createMcpServer({
    agentToolsScope: { userId: "1", source: "http-session" }
  });
  const client = new Client({ name: "parity-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);
  return { client, server };
}

function propertyNames(schema: unknown): string[] {
  const properties = (schema as { properties?: Record<string, unknown> })
    ?.properties;
  return Object.keys(properties ?? {}).sort();
}

function specFor(name: string) {
  try {
    return capabilityForName(name).spec;
  } catch {
    return null;
  }
}

describe("MCP tool schemas and sandbox signatures", () => {
  it("lists every spec parameter of each direct capability on MCP", async () => {
    const { client, server } = await connect();
    try {
      const { tools } = await client.listTools();
      let compared = 0;
      for (const tool of tools) {
        const spec = specFor(tool.name);
        if (!spec) continue;
        compared++;
        const omitted = new Set(MCP_OMITTED[tool.name] ?? []);
        const expected = propertyNames(spec.inputSchema).filter(
          (name) => !omitted.has(name)
        );
        expect(
          { tool: tool.name, properties: propertyNames(tool.inputSchema) },
          `${tool.name} on MCP`
        ).toEqual({ tool: tool.name, properties: expected });
      }
      // The audit must have looked at the generation tools, not an empty list.
      expect(compared).toBeGreaterThan(10);
      expect(tools.map((tool) => tool.name)).toContain("animate_image");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("shows the sandbox the same animate_image parameters as tools/list", async () => {
    const { client, server } = await connect();
    try {
      const { tools } = await client.listTools();
      const mcp = tools.find((tool) => tool.name === "animate_image");
      expect(mcp).toBeDefined();
      const result = await client.callTool({
        name: "execute_code",
        arguments: {
          code: `const hits = await nodetool.searchTools("animate image into a video", 10);
const hit = hits.find((h) => h.name === "animate_image");
return hit ? hit.signature : null;`
        }
      });
      const content = result.content as Array<{ text?: string }>;
      const observation = JSON.parse(content[0]?.text ?? "{}") as {
        result?: string | null;
      };
      const signature = observation.result ?? "";
      expect(signature).toContain("animate_image");
      for (const name of propertyNames(mcp?.inputSchema)) {
        expect(signature, `sandbox signature names ${name}`).toContain(name);
      }
      expect(propertyNames(mcp?.inputSchema)).toContain("end_frame_file");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
