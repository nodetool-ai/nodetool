import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MinimaxMusicNode } from "../src/nodes/music.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const audioHex = Buffer.from("fake-song").toString("hex");

function makeNode(props: Record<string, unknown> = {}): MinimaxMusicNode {
  return new MinimaxMusicNode(props);
}

describe("MinimaxMusicNode", () => {
  beforeEach(() => {
    process.env.MINIMAX_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { audio: audioHex },
        base_resp: { status_code: 0, status_msg: "success" }
      })
    });
  });

  afterEach(() => {
    delete process.env.MINIMAX_API_KEY;
    mockFetch.mockReset();
  });

  it("posts prompt and lyrics to the music_generation endpoint", async () => {
    const node = makeNode({ prompt: "lo-fi beat", lyrics: "[Verse]\nhello" });
    const result = await node.process();

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/music_generation");
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.prompt).toBe("lo-fi beat");
    expect(body.lyrics).toBe("[Verse]\nhello");
    expect(body.model).toBe("music-2.6");

    expect(result.output).toMatchObject({
      type: "audio",
      content_type: "audio/mpeg",
      data: Buffer.from("fake-song").toString("base64")
    });
    expect(
      String((result.output as Record<string, unknown>).data)
    ).not.toMatch(/^data:/);
  });

  it("requires a prompt", async () => {
    await expect(
      makeNode({ prompt: "", lyrics: "x" }).process()
    ).rejects.toThrow("Prompt is required");
  });

  it("requires lyrics", async () => {
    await expect(
      makeNode({ prompt: "x", lyrics: "" }).process()
    ).rejects.toThrow("Lyrics are required");
  });

  it("surfaces MiniMax base_resp errors", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        base_resp: { status_code: 2013, status_msg: "invalid params" }
      })
    });
    await expect(
      makeNode({ prompt: "x", lyrics: "y" }).process()
    ).rejects.toThrow("invalid params");
  });
});
