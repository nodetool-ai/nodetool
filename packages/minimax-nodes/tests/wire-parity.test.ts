/**
 * Pins the HTTP requests each MiniMax node sends, in order. The fixtures were
 * recorded from the pack's own transport before the nodes moved onto the
 * runtime provider. The nodes now reach MiniMax through MinimaxProvider, with
 * its fetch stubbed, and must send the same endpoints, headers and body bytes.
 * Result downloads are pinned by URL.
 */
import { describe, expect, it, vi } from "vitest";
import { MinimaxProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type { BaseNode } from "@nodetool-ai/node-sdk";
import { MinimaxTextToSpeechNode } from "../src/nodes/text-to-speech.js";
import { MinimaxTextToImageNode } from "../src/nodes/text-to-image.js";
import { MinimaxImageToVideoNode } from "../src/nodes/image-to-video.js";

interface WireRequest {
  url: string;
  method: string | undefined;
  headers: unknown;
  body: string | undefined;
}

const HEADERS = {
  Authorization: "Bearer test-key",
  "Content-Type": "application/json"
};
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_B64 = PNG.toString("base64");

const download = (url: string): WireRequest => ({
  url,
  method: undefined,
  headers: undefined,
  body: undefined
});

const WIRE: Record<"tts" | "image" | "video", WireRequest[]> = {
  tts: [
    {
      url: "https://api.minimax.io/v1/t2a_v2",
      method: "POST",
      headers: HEADERS,
      body: '{"model":"speech-2.8-hd","text":"Hello there","stream":false,"voice_setting":{"voice_id":"English_CalmWoman","speed":1.5,"vol":2,"pitch":-3,"emotion":"happy"},"audio_setting":{"sample_rate":32000,"bitrate":128000,"format":"wav","channel":1},"language_boost":"English"}'
    },
    download("https://cdn.minimax.io/speech.wav")
  ],
  image: [
    {
      url: "https://api.minimax.io/v1/image_generation",
      method: "POST",
      headers: HEADERS,
      body: '{"model":"image-01","prompt":"a lighthouse\\n\\nDo not include: fog","aspect_ratio":"16:9","n":1,"response_format":"base64","prompt_optimizer":false}'
    },
    download("https://cdn.minimax.io/image.png")
  ],
  video: [
    {
      url: "https://api.minimax.io/v1/video_generation",
      method: "POST",
      headers: HEADERS,
      body: `{"model":"MiniMax-Hailuo-2.3","duration":10,"resolution":"768P","first_frame_image":"data:image/png;base64,${PNG_B64}","prompt":"[Push in] waves"}`
    },
    {
      url: "https://api.minimax.io/v1/query/video_generation?task_id=task-1",
      method: undefined,
      headers: HEADERS,
      body: undefined
    },
    {
      url: "https://api.minimax.io/v1/files/retrieve?file_id=file-1",
      method: undefined,
      headers: HEADERS,
      body: undefined
    },
    download("https://cdn.minimax.io/video.mp4")
  ]
};

/** Answers every MiniMax request the three nodes make. */
async function reply(url: string): Promise<Response> {
  if (url.endsWith("/v1/t2a_v2")) {
    return Response.json({
      data: { audio: "https://cdn.minimax.io/speech.wav" },
      base_resp: { status_code: 0 }
    });
  }
  if (url.endsWith("/v1/image_generation")) {
    return Response.json({
      data: { image_urls: ["https://cdn.minimax.io/image.png"] },
      base_resp: { status_code: 0 }
    });
  }
  if (url.endsWith("/v1/video_generation")) {
    return Response.json({ task_id: "task-1", base_resp: { status_code: 0 } });
  }
  if (url.includes("/v1/query/video_generation")) {
    return Response.json({ status: "Success", file_id: "file-1" });
  }
  if (url.includes("/v1/files/retrieve")) {
    return Response.json({
      file: { download_url: "https://cdn.minimax.io/video.mp4" },
      base_resp: { status_code: 0 }
    });
  }
  return new Response(PNG);
}

/** Run a node against a stubbed fetch and return every request it sent. */
async function wireRequests(node: BaseNode): Promise<WireRequest[]> {
  const fetchMock = vi.fn(async (url: string) => reply(url));
  const context = new ProcessingContext({ jobId: "job-1" });
  context.setProviderResolver(
    () =>
      new MinimaxProvider(
        { MINIMAX_API_KEY: "test-key" },
        // SAFETY: the mock answers every call these nodes make.
        { fetchFn: fetchMock as unknown as typeof fetch }
      )
  );
  await node.process(context);
  return fetchMock.mock.calls.map((call) => {
    const [url, init] = call as unknown as [string, RequestInit | undefined];
    return {
      url,
      method: init?.method,
      headers: init?.headers,
      body: init?.body === undefined ? undefined : String(init.body)
    };
  });
}

describe("MiniMax wire parity", () => {
  it("sends the recorded text-to-speech requests", async () => {
    const node = new MinimaxTextToSpeechNode({
      text: "Hello there",
      voice_id: "English_CalmWoman",
      model: "speech-2.8-hd",
      emotion: "happy",
      speed: 1.5,
      volume: 2,
      pitch: -3,
      language_boost: "English",
      format: "wav"
    });
    expect(await wireRequests(node)).toEqual(WIRE.tts);
  });

  it("sends the recorded text-to-image requests", async () => {
    const node = new MinimaxTextToImageNode({
      prompt: "a lighthouse",
      negative_prompt: "fog",
      aspect_ratio: "16:9",
      prompt_optimizer: false
    });
    expect(await wireRequests(node)).toEqual(WIRE.image);
  });

  it("sends the recorded image-to-video requests", async () => {
    const node = new MinimaxImageToVideoNode({
      model: "MiniMax-Hailuo-2.3",
      image: { type: "image", data: PNG_B64 },
      prompt: "[Push in] waves",
      duration: 10,
      resolution: "1080P"
    });
    expect(await wireRequests(node)).toEqual(WIRE.video);
  });
});
