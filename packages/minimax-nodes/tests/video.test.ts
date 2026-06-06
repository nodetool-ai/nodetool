import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MinimaxTextToVideoNode } from "../src/nodes/text-to-video.js";
import { MinimaxImageToVideoNode } from "../src/nodes/image-to-video.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const videoBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18]);
const videoB64 = Buffer.from(videoBytes).toString("base64");

/** Queue the submit → poll → retrieve → download responses for a video job. */
function queueVideoSuccess(): void {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ task_id: "task-1", base_resp: { status_code: 0 } })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "Success", file_id: "file-1" })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        file: { download_url: "https://cdn.minimax.io/video.mp4" },
        base_resp: { status_code: 0 }
      })
    })
    .mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () =>
        videoBytes.buffer.slice(
          videoBytes.byteOffset,
          videoBytes.byteOffset + videoBytes.byteLength
        )
    });
}

describe("MinimaxTextToVideoNode", () => {
  beforeEach(() => {
    process.env.MINIMAX_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.MINIMAX_API_KEY;
    mockFetch.mockReset();
  });

  it("submits, polls, downloads and returns a video ref", async () => {
    queueVideoSuccess();
    const node = new MinimaxTextToVideoNode({
      prompt: "a sunset",
      duration: 6,
      resolution: "768P"
    });
    const result = await node.process();

    const [submitUrl, submitOpts] = mockFetch.mock.calls[0] as [
      string,
      RequestInit
    ];
    expect(submitUrl).toContain("/v1/video_generation");
    const body = JSON.parse(submitOpts.body as string) as Record<
      string,
      unknown
    >;
    expect(body.prompt).toBe("a sunset");
    expect(body.model).toBe("MiniMax-Hailuo-02");

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(result.output).toMatchObject({ type: "video", data: videoB64 });
  });

  it("requires a prompt", async () => {
    await expect(
      new MinimaxTextToVideoNode({ prompt: "" }).process()
    ).rejects.toThrow("Prompt is required");
  });

  it("throws when the task fails", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ task_id: "task-1", base_resp: { status_code: 0 } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "Fail", base_resp: { status_msg: "nope" } })
      });
    await expect(
      new MinimaxTextToVideoNode({ prompt: "x" }).process()
    ).rejects.toThrow("video task failed");
  });
});

describe("MinimaxImageToVideoNode", () => {
  beforeEach(() => {
    process.env.MINIMAX_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.MINIMAX_API_KEY;
    mockFetch.mockReset();
  });

  it("sends the input image as the first frame", async () => {
    queueVideoSuccess();
    const imageB64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const node = new MinimaxImageToVideoNode({
      image: { type: "image", data: imageB64 },
      prompt: "[Push in] zoom"
    });
    const result = await node.process();

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    ) as Record<string, unknown>;
    expect(String(body.first_frame_image)).toContain("base64,");
    expect(body.prompt).toBe("[Push in] zoom");
    expect(result.output).toMatchObject({ type: "video", data: videoB64 });
  });

  it("throws when no input image is provided", async () => {
    const node = new MinimaxImageToVideoNode({
      image: { type: "image", data: null, uri: "" }
    });
    await expect(node.process()).rejects.toThrow("input image is required");
  });
});
