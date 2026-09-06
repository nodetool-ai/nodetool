import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
import { FileStorageAdapter } from "@nodetool-ai/storage";
import { createMcpServer, type McpServerOptions } from "../src/mcp-server.js";
import * as storage from "../src/lib/storage.js";

let root: string;
let png: Buffer;
let imagePath: string;
const connections: Array<{
  client: Client;
  server: ReturnType<typeof createMcpServer>;
}> = [];

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "nodetool-mcp-images-"));
  vi.stubEnv(process.platform === "win32" ? "APPDATA" : "XDG_DATA_HOME", root);
  const adapter = new FileStorageAdapter(join(root, "assets"));
  vi.spyOn(storage, "getAssetAdapter").mockReturnValue(adapter);
  png = await sharp({
    create: { width: 1024, height: 512, channels: 3, background: "#2575a0" }
  })
    .png()
    .toBuffer();
  imagePath = join(root, "image with spaces.png");
  await writeFile(imagePath, png);
  await adapter.store("1/test-image.png", png, "image/png");
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

async function connect(
  source: NonNullable<
    McpServerOptions["agentToolsScope"]
  >["source"] = "stdio-local"
): Promise<Client> {
  const server = createMcpServer({ agentToolsScope: { userId: "1", source } });
  const client = new Client({ name: "image-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  connections.push({ client, server });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);
  return client;
}

describe("MCP view_image pixel delivery", () => {
  it.each([
    "test-image",
    "asset://test-image.png",
    "/api/storage/1/test-image.png"
  ])(
    "delivers stored %s as an image block, not JSON metadata",
    async (imageId) => {
      const client = await connect();
      const result = await client.callTool({
        name: "view_image",
        arguments: { image_id: imageId }
      });
      expect(result.isError).not.toBe(true);
      expect(result.content).toContainEqual({
        type: "image",
        data: png.toString("base64"),
        mimeType: "image/png"
      });
      expect(JSON.stringify(result.structuredContent)).not.toContain(
        "image_content"
      );
    }
  );

  it("keeps inline image bytes out of text and structured content", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "view_image",
      arguments: {
        image_id: `data:image/png;base64,${png.toString("base64")}`,
        question: ""
      }
    });
    expect(result.content).toContainEqual({
      type: "image",
      data: png.toString("base64"),
      mimeType: "image/png"
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain(
      png.toString("base64")
    );
    const text = Array.isArray(result.content)
      ? result.content.filter((block) => block.type === "text")
      : [];
    expect(JSON.stringify(text)).not.toContain(png.toString("base64"));
  });

  it.each(["path", "file URI"])(
    "reads an image from a local disk %s",
    async (kind) => {
      const client = await connect();
      const imageId =
        kind === "path" ? imagePath : pathToFileURL(imagePath).href;
      const result = await client.callTool({
        name: "view_image",
        arguments: { image_id: imageId, question: "Inspect the blue image" }
      });
      expect(result.isError).not.toBe(true);
      expect(result.content).toContainEqual({
        type: "image",
        data: png.toString("base64"),
        mimeType: "image/png"
      });
      expect(result.structuredContent).toMatchObject({
        image_id: imageId,
        note: "Inspect the blue image"
      });
    }
  );

  it("delivers the cropped pixels", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "view_image",
      arguments: {
        image_id: "asset://test-image.png",
        region: { x: 10, y: 20, width: 160, height: 90 }
      }
    });
    const content = result.content;
    if (!Array.isArray(content)) {
      throw new Error("Missing MCP content");
    }
    const image = content.find((block) => block.type === "image");
    expect(image?.type).toBe("image");
    if (!image || typeof image.data !== "string") {
      throw new Error("Missing image bytes");
    }
    expect(
      await sharp(Buffer.from(image.data, "base64")).metadata()
    ).toMatchObject({ width: 160, height: 90 });
  });

  it("downsizes a local image for low detail", async () => {
    const client = await connect("local-dev-http");
    const result = await client.callTool({
      name: "view_image",
      arguments: { image_id: imagePath, detail: "low" }
    });
    if (!Array.isArray(result.content)) {
      throw new Error("Missing MCP content");
    }
    const image = result.content.find((block) => block.type === "image");
    if (!image || typeof image.data !== "string") {
      throw new Error("Missing image bytes");
    }
    expect(
      await sharp(Buffer.from(image.data, "base64")).metadata()
    ).toMatchObject({ width: 768, height: 384 });
  });

  it("reports a missing disk image as an MCP error", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "view_image",
      arguments: { image_id: join(root, "missing.png") }
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("ENOENT");
  });

  it.each(["path", "file URI"])(
    "refuses host disk %s access on a remote session",
    async (kind) => {
      const client = await connect("http-session");
      const imageId =
        kind === "path" ? imagePath : pathToFileURL(imagePath).href;
      const result = await client.callTool({
        name: "view_image",
        arguments: { image_id: imageId }
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("local MCP");
    }
  );
});
