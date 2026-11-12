/**
 * `download_file` promises a UI-fetchable `asset_url` and a `display_markdown`
 * that embeds it. A remote MCP client (a chat app) can only render a public
 * https URL. On the hosted server the MCP context stored the copy in the
 * object bucket and answered with the raw `supabase://…` / `s3://…` storage
 * uri, because it had no temp URL resolver to sign it.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Asset, initTestDb } from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { registerAgentMcpTools } from "../src/mcp-agent-tools.js";
import * as storage from "../src/lib/storage.js";

const ASSET_ID = "6b2f4e8a1c3d4f5e9a7b0c1d2e3f4a5b";
const BUCKET = "s3://nodetool-assets/";

/**
 * An object store in the shape the S3 adapter has: it answers `s3://` uris
 * and signs a GET URL for one. Signing is local, so no request leaves the
 * test.
 */
class SignedObjectStore extends InMemoryStorageAdapter {
  private toMemory(uri: string): string {
    return uri.startsWith(BUCKET)
      ? `memory://${uri.slice(BUCKET.length)}`
      : uri;
  }
  override uriForKey(key: string): string {
    return `${BUCKET}${super.uriForKey(key).slice("memory://".length)}`;
  }
  override async store(
    key: string,
    data: Uint8Array,
    contentType?: string
  ): Promise<string> {
    const uri = await super.store(key, data, contentType);
    return `${BUCKET}${uri.slice("memory://".length)}`;
  }
  override async retrieve(uri: string): Promise<Uint8Array | null> {
    return super.retrieve(this.toMemory(uri));
  }
  override async exists(uri: string): Promise<boolean> {
    return super.exists(this.toMemory(uri));
  }
  async createDownloadUrl(uri: string): Promise<string | null> {
    if (!uri.startsWith(BUCKET)) return null;
    return `https://objects.test/${uri.slice(BUCKET.length)}?signature=abc`;
  }
}

let root: string;

beforeAll(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-mcp-download-file-"));
  vi.stubEnv(process.platform === "win32" ? "APPDATA" : "XDG_DATA_HOME", root);
  const adapter = new SignedObjectStore();
  vi.spyOn(storage, "getAssetAdapter").mockReturnValue(adapter);
  const jpeg = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#a04060" }
  })
    .jpeg()
    .toBuffer();
  await adapter.store(`1/${ASSET_ID}.jpg`, jpeg, "image/jpeg");
  await new Asset({
    id: ASSET_ID,
    user_id: "1",
    name: "still.jpg",
    content_type: "image/jpeg",
    size: jpeg.length,
    project_id: "default"
  }).save();
});

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

type ToolResponse = { content: Array<{ text?: string }> };

describe("download_file on a remote MCP session", () => {
  it("answers with a signed https asset_url and embeds it in display_markdown", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerAgentMcpTools(server, {
      agentToolsScope: { userId: "1", source: "http-session" }
    });
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: Record<string, unknown>) => Promise<unknown> }
        >;
      }
    )._registeredTools;

    const response = (await tools["download_file"].handler({
      url: `asset://${ASSET_ID}.jpg`,
      output_file: "still.jpg"
    })) as ToolResponse;
    const result = JSON.parse(response.content[0]?.text ?? "{}") as {
      success?: boolean;
      asset_url?: string;
      display_markdown?: string;
    };

    expect(result.success).toBe(true);
    expect(result.asset_url).toMatch(
      /^https:\/\/objects\.test\/downloads\/[0-9a-f-]+\.jpg\?signature=abc$/
    );
    expect(result.display_markdown).toBe(`![still.jpg](${result.asset_url})`);
  });

  it("takes the 12-character id a sandbox result hands back", async () => {
    // Sandbox results shorten ids to their first 12 characters. A direct MCP
    // tool given one must find the same asset.
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerAgentMcpTools(server, {
      agentToolsScope: { userId: "1", source: "http-session" }
    });
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: Record<string, unknown>) => Promise<unknown> }
        >;
      }
    )._registeredTools;

    const response = (await tools["download_file"].handler({
      url: `asset://${ASSET_ID.slice(0, 12)}.jpg`,
      output_file: "short.jpg"
    })) as ToolResponse;
    const result = JSON.parse(response.content[0]?.text ?? "{}") as {
      success?: boolean;
      file_size_bytes?: number;
    };

    expect(result.success).toBe(true);
    expect(result.file_size_bytes).toBeGreaterThan(0);
  });
});
