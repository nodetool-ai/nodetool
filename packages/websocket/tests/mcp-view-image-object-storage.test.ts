import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Asset, initTestDb } from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { createMcpServer } from "../src/mcp-server.js";
import * as storage from "../src/lib/storage.js";

// The hosted server stores assets in S3/Supabase, whose adapters accept only
// their own uri scheme, and signs the URLs a client loads them from. The
// in-memory adapter has the same property (`memory://` only), unlike the file
// adapter the other view_image suite uses.

const ASSET_ID = "4b7a61d898fe4056848c764299461d5c";
let root: string;
let jpeg: Buffer;
const connections: Array<{
  client: Client;
  server: ReturnType<typeof createMcpServer>;
}> = [];

beforeAll(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-mcp-object-images-"));
  vi.stubEnv(process.platform === "win32" ? "APPDATA" : "XDG_DATA_HOME", root);
  // Signs asset URLs the way the hosted server does. Presigning is local, so
  // no request leaves the test.
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "s3");
  vi.stubEnv("ASSET_BUCKET", "assets");
  vi.stubEnv("S3_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
  const adapter = new InMemoryStorageAdapter();
  vi.spyOn(storage, "getAssetAdapter").mockReturnValue(adapter);
  jpeg = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: "#4060a0" }
  })
    .jpeg()
    .toBuffer();
  await adapter.store(`1/${ASSET_ID}.jpg`, jpeg, "image/jpeg");
  await new Asset({
    id: ASSET_ID,
    user_id: "1",
    name: "comfy-output.jpg",
    content_type: "image/jpeg",
    size: jpeg.length,
    project_id: "default"
  }).save();
});

afterEach(async () => {
  for (const { client, server } of connections.splice(0)) {
    await client.close();
    await server.close();
  }
});

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

async function connect(): Promise<Client> {
  const server = createMcpServer({
    agentToolsScope: { userId: "1", source: "http-session" }
  });
  const client = new Client({ name: "object-image-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  connections.push({ client, server });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);
  return client;
}

async function view(
  args: Record<string, unknown>
): Promise<{
  width?: number;
  height?: number;
  structured: Record<string, unknown>;
}> {
  const client = await connect();
  const result = await client.callTool({ name: "view_image", arguments: args });
  expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
  if (!Array.isArray(result.content)) {
    throw new Error("Missing MCP content");
  }
  const image = result.content.find((block) => block.type === "image");
  if (!image || typeof image.data !== "string") {
    throw new Error("Missing image bytes");
  }
  const { width, height } = await sharp(
    Buffer.from(image.data, "base64")
  ).metadata();
  return {
    width,
    height,
    structured: (result.structuredContent ?? {}) as Record<string, unknown>
  };
}

describe("MCP view_image on object storage", () => {
  it("offers no crop or downscale arguments", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const viewImage = tools.find((tool) => tool.name === "view_image");
    expect(Object.keys(viewImage?.inputSchema.properties ?? {})).not.toContain(
      "region"
    );
    expect(Object.keys(viewImage?.inputSchema.properties ?? {})).not.toContain(
      "detail"
    );
  });

  it.each([ASSET_ID, `${ASSET_ID}.jpg`, `asset://${ASSET_ID}.jpg`])(
    "delivers %s at full size with a signed public url",
    async (imageId) => {
      const { width, height, structured } = await view({ image_id: imageId });
      expect({ width, height }).toEqual({ width: 1024, height: 1024 });
      expect(structured["asset_id"]).toBe(ASSET_ID);
      const url = new URL(String(structured["url"]));
      expect(url.protocol).toBe("https:");
      expect(url.pathname).toContain(`1/${ASSET_ID}.jpg`);
      expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    }
  );

  it("ignores a crop or downscale a client still sends", async () => {
    const { width, height, structured } = await view({
      image_id: `${ASSET_ID}.jpg`,
      detail: "low",
      region: { x: 0, y: 0, width: 200, height: 120 }
    });
    expect({ width, height }).toEqual({ width: 1024, height: 1024 });
    expect(structured["url"]).toMatch(/^https:/);
  });
});

describe("MCP download_asset on object storage", () => {
  it("returns a signed public url instead of the bytes", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "download_asset",
      arguments: { asset_id: ASSET_ID }
    });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    const structured = (result.structuredContent ?? {}) as Record<
      string,
      unknown
    >;
    expect(structured).not.toHaveProperty("content_base64");
    expect(String(structured["url"])).toMatch(/^https:/);
    expect(JSON.stringify(result.content)).not.toContain(
      jpeg.toString("base64").slice(0, 64)
    );
  });
});
