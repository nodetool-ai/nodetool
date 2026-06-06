import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MinimaxTextToImageNode } from "../src/nodes/text-to-image.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// 1x1 PNG so inferImageMime resolves to image/png.
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);
const pngB64 = Buffer.from(pngBytes).toString("base64");

function makeNode(
  props: Record<string, unknown> = {}
): MinimaxTextToImageNode {
  return new MinimaxTextToImageNode(props);
}

describe("MinimaxTextToImageNode", () => {
  beforeEach(() => {
    process.env.MINIMAX_API_KEY = "test-key";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { image_base64: [pngB64] },
        base_resp: { status_code: 0, status_msg: "success" }
      })
    });
  });

  afterEach(() => {
    delete process.env.MINIMAX_API_KEY;
    mockFetch.mockReset();
  });

  it("posts to image_generation and returns a base64 image ref", async () => {
    const node = makeNode({ prompt: "a fox", aspect_ratio: "16:9" });
    const result = await node.process();

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/image_generation");
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.model).toBe("image-01");
    expect(body.prompt).toBe("a fox");
    expect(body.aspect_ratio).toBe("16:9");

    expect(result.output).toMatchObject({
      type: "image",
      mimeType: "image/png",
      data: pngB64
    });
  });

  it("appends the negative prompt into the prompt text", async () => {
    await makeNode({ prompt: "a fox", negative_prompt: "blurry" }).process();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(String(body.prompt)).toContain("Do not include: blurry");
  });

  it("requires a prompt", async () => {
    await expect(makeNode({ prompt: "" }).process()).rejects.toThrow(
      "Prompt is required"
    );
  });

  it("downloads from image_urls when no base64 is returned", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { image_urls: ["https://cdn.minimax.io/img.png"] },
          base_resp: { status_code: 0 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () =>
          pngBytes.buffer.slice(
            pngBytes.byteOffset,
            pngBytes.byteOffset + pngBytes.byteLength
          )
      });

    const result = await makeNode({ prompt: "a fox" }).process();
    expect(mockFetch.mock.calls[1][0]).toBe("https://cdn.minimax.io/img.png");
    expect(result.output).toMatchObject({ type: "image", data: pngB64 });
  });
});
