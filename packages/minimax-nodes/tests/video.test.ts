import { describe, expect, it } from "vitest";
import { MinimaxTextToVideoNode } from "../src/nodes/text-to-video.js";
import { MinimaxImageToVideoNode } from "../src/nodes/image-to-video.js";
import { predictions, scriptedMinimax } from "./scripted.js";

const VIDEO_URL = "https://cdn.minimax.io/video.mp4";
const videoBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18]);
const videoB64 = Buffer.from(videoBytes).toString("base64");
const imageB64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

/** The provider's video route answers with the files/retrieve reply. */
function scriptedVideo(): ReturnType<typeof scriptedMinimax> {
  return scriptedMinimax(
    {
      output: {
        file: { download_url: VIDEO_URL },
        base_resp: { status_code: 0 }
      },
      requestId: "task-1"
    },
    { [VIDEO_URL]: videoBytes }
  );
}

describe("MinimaxTextToVideoNode", () => {
  it("runs the video route, downloads the file and returns a video ref", async () => {
    const { provider, context } = scriptedVideo();
    const node = new MinimaxTextToVideoNode({
      prompt: "a sunset",
      duration: 6,
      resolution: "768P"
    });
    node.__node_id = "t2v-1";
    const result = await node.process(context);

    expect(provider.endpointCalls[0]).toMatchObject({
      model: "MiniMax-Hailuo-02",
      route: "video",
      input: {
        model: "MiniMax-Hailuo-02",
        prompt: "a sunset",
        duration: 6,
        resolution: "768P"
      }
    });
    expect(provider.downloadCalls.map((call) => call.url)).toEqual([VIDEO_URL]);
    expect(predictions(context).at(-1)).toMatchObject({
      status: "completed",
      provider: "minimax",
      capability: "text_to_video",
      model: "MiniMax-Hailuo-02",
      node_id: "t2v-1"
    });
    expect(result.output).toMatchObject({ type: "video", data: videoB64 });
  });

  it("stops a submitted job when the run is cancelled", async () => {
    const { provider, context } = scriptedVideo();
    const controller = new AbortController();
    context.signal = controller.signal;
    controller.abort(new Error("cancelled"));
    await expect(
      new MinimaxTextToVideoNode({ prompt: "a sunset" }).process(context)
    ).rejects.toThrow("cancelled");
    expect(provider.endpointCalls[0].signal?.aborted).toBe(true);
    expect(provider.downloadCalls).toEqual([]);
  });

  it("omits duration/resolution for the 01-series Director model", async () => {
    const { provider, context } = scriptedVideo();
    await new MinimaxTextToVideoNode({
      model: "T2V-01-Director",
      prompt: "[Pan left] a beach",
      duration: 10,
      resolution: "1080P"
    }).process(context);
    // T2V-01-Director is fixed at 6s/720P; the API rejects the parameters.
    const input = provider.endpointCalls[0].input;
    expect(input.duration).toBeUndefined();
    expect(input.resolution).toBeUndefined();
  });

  it("clamps invalid Hailuo duration/resolution combos to 768P", async () => {
    const { provider, context } = scriptedVideo();
    await new MinimaxTextToVideoNode({
      model: "MiniMax-Hailuo-2.3",
      prompt: "a beach",
      duration: 10,
      resolution: "1080P"
    }).process(context);
    const input = provider.endpointCalls[0].input;
    expect(input.duration).toBe(10);
    expect(input.resolution).toBe("768P");
  });

  it("surfaces a failed task from the provider", async () => {
    const { context } = scriptedMinimax(
      new Error('MiniMax video task failed: {"status_msg":"nope"}')
    );
    await expect(
      new MinimaxTextToVideoNode({ prompt: "x" }).process(context)
    ).rejects.toThrow("video task failed");
  });

  it("throws when the file record has no download URL", async () => {
    const { context } = scriptedMinimax({ output: { file: {} } });
    await expect(
      new MinimaxTextToVideoNode({ prompt: "x" }).process(context)
    ).rejects.toThrow("MiniMax files/retrieve returned no download_url");
  });

  it("requires a prompt", async () => {
    await expect(
      new MinimaxTextToVideoNode({ prompt: "" }).process()
    ).rejects.toThrow("Prompt is required");
  });
});

describe("MinimaxImageToVideoNode", () => {
  it("sends the input image as the first frame", async () => {
    const { provider, context } = scriptedVideo();
    const result = await new MinimaxImageToVideoNode({
      image: { type: "image", data: imageB64 },
      prompt: "[Push in] zoom"
    }).process(context);

    const input = provider.endpointCalls[0].input;
    expect(String(input.first_frame_image)).toContain("base64,");
    expect(input.prompt).toBe("[Push in] zoom");
    expect(predictions(context).at(-1)).toMatchObject({
      provider: "minimax",
      capability: "image_to_video",
      model: "MiniMax-Hailuo-02"
    });
    expect(result.output).toMatchObject({ type: "video", data: videoB64 });
  });

  it("sends a subject_reference instead of first_frame_image for S2V-01", async () => {
    const { provider, context } = scriptedVideo();
    await new MinimaxImageToVideoNode({
      model: "S2V-01",
      image: { type: "image", data: imageB64 },
      prompt: "wave",
      duration: 10,
      resolution: "1080P"
    }).process(context);

    const input = provider.endpointCalls[0].input;
    expect(provider.endpointCalls[0].model).toBe("S2V-01");
    expect(input.first_frame_image).toBeUndefined();
    expect(input.duration).toBeUndefined();
    expect(input.resolution).toBeUndefined();
    const ref = input.subject_reference as Array<Record<string, unknown>>;
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
