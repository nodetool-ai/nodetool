/**
 * The chat turn's context carries the asset interface.
 *
 * Without it `persistOutput` falls back to a workspace file, and the CLI's
 * workspace is the current directory — a generated image landed in whatever
 * folder the chat was started in, with no `asset://` URI behind it.
 */

import { describe, expect, it, vi } from "vitest";

const createAssetModelInterface = vi.fn(async () => ({ id: "asset-1" }));
const updateAssetBytesModelInterface = vi.fn(async () => ({
  id: "asset-1",
  content_type: "image/png",
  name: "generated.png",
  metadata: null
}));

vi.mock("@nodetool-ai/websocket/assets", () => ({
  createAssetModelInterface,
  updateAssetBytesModelInterface
}));
vi.mock("@nodetool-ai/models", () => ({
  getSecret: vi.fn(async (key: string) =>
    key === "FAL_API_KEY" ? "fal-secret" : null
  )
}));

const { createChatContext } = await import("../src/chat-context.js");

describe("createChatContext", () => {
  it("wires asset persistence and the secret store", async () => {
    const context = await createChatContext({ workspaceDir: null });
    expect(context.hasModelInterface("createAsset")).toBe(true);
    await expect(context.getSecret("FAL_API_KEY")).resolves.toBe("fal-secret");
  });

  it("persists through the server's own implementation", async () => {
    const context = await createChatContext({ workspaceDir: null });
    const asset = await context.createAsset({
      name: "generated.png",
      contentType: "image/png",
      content: new Uint8Array([1, 2, 3])
    });
    expect(asset).toMatchObject({ id: "asset-1" });
    expect(createAssetModelInterface).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "1", name: "generated.png" })
    );
  });
});
