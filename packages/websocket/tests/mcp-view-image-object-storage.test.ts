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
// their own uri scheme. A crop or downscale is answered as
// `/api/storage/<key>`, which such an adapter cannot read back by that route.
// The in-memory adapter has the same property (`memory://` only), unlike the
// file adapter the other view_image suite uses.

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

async function imageSize(
  args: Record<string, unknown>
): Promise<{ width?: number; height?: number }> {
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
  return { width, height };
}

describe("MCP view_image on object storage", () => {
  it.each([ASSET_ID, `${ASSET_ID}.jpg`, `asset://${ASSET_ID}.jpg`])(
    "delivers a low-detail view of %s",
    async (imageId) => {
      expect(await imageSize({ image_id: imageId, detail: "low" })).toEqual({
        width: 768,
        height: 768
      });
    }
  );

  it("delivers a cropped region", async () => {
    expect(
      await imageSize({
        image_id: `${ASSET_ID}.jpg`,
        region: { x: 0, y: 0, width: 200, height: 120 }
      })
    ).toEqual({ width: 200, height: 120 });
  });

  it("delivers the full image unchanged", async () => {
    expect(await imageSize({ image_id: `asset://${ASSET_ID}.jpg` })).toEqual({
      width: 1024,
      height: 1024
    });
  });
});
