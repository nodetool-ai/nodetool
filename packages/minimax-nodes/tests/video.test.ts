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

  it("omits duration/resolution for the 01-series Director model", async () => {
    queueVideoSuccess();
    const node = new MinimaxTextToVideoNode({
      model: "T2V-01-Director",
      prompt: "[Pan left] a beach",
      duration: 10,
      resolution: "1080P"
    });
    await node.process();
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    ) as Record<string, unknown>;
    // T2V-01-Director is fixed at 6s/720P; the API rejects the parameters.
    expect(body.duration).toBeUndefined();
    expect(body.resolution).toBeUndefined();
  });

  it("clamps invalid Hailuo duration/resolution combos to 768P", async () => {
    queueVideoSuccess();
    const node = new MinimaxTextToVideoNode({
      model: "MiniMax-Hailuo-2.3",
      prompt: "a beach",
      duration: 10,
      resolution: "1080P"
    });
    await node.process();
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    ) as Record<string, unknown>;
    expect(body.duration).toBe(10);
    expect(body.resolution).toBe("768P");
  });

  it("aborts polling when the status query reports a base_resp error", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ task_id: "task-1", base_resp: { status_code: 0 } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          base_resp: { status_code: 1004, status_msg: "auth failed" }
        })
      });
    await expect(
      new MinimaxTextToVideoNode({ prompt: "x" }).process()
    ).rejects.toThrow(/auth failed/);
    expect(mockFetch).toHaveBeenCalledTimes(2);
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

  it("sends a subject_reference instead of first_frame_image for S2V-01", async () => {
    queueVideoSuccess();
    const imageB64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const node = new MinimaxImageToVideoNode({
      model: "S2V-01",
      image: { type: "image", data: imageB64 },
      prompt: "wave",
      duration: 10,
      resolution: "1080P"
    });
    await node.process();

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    ) as Record<string, unknown>;
    expect(body.first_frame_image).toBeUndefined();
    expect(body.duration).toBeUndefined();
    expect(body.resolution).toBeUndefined();
    const ref = body.subject_reference as Array<Record<string, unknown>>;
    expect(ref).toHaveLength(1);
    expect(ref[0].type).toBe("character");
    expect(String((ref[0].image as string[])[0])).toContain("base64,");
  });

  it("throws when no input image is provided", async () => {
    const node = new MinimaxImageToVideoNode({
      image: { type: "image", data: null, uri: "" }
    });
    await expect(node.process()).rejects.toThrow("input image is required");
  });
});
