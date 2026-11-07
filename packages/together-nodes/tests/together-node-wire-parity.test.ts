/**
 * Pins the HTTP requests each kind of Together node sends, in order. The
 * fixtures were recorded from the pack's own transport before the nodes moved
 * onto the runtime provider. The nodes now reach Together through
 * TogetherProvider, with its fetch stubbed, and must send the same endpoints,
 * headers, JSON bytes and multipart fields. Result downloads are pinned by URL.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessingContext, TogetherProvider } from "@nodetool-ai/runtime";
import {
  createTogetherNodeClass,
  type TogetherManifestEntry
} from "../src/together-factory.js";
import manifest from "../src/together-manifest.json" with { type: "json" };

interface WireRequest {
  url: string;
  method: string | undefined;
  headers: unknown;
  body: unknown;
}

type TestNode = {
  setDynamic: (key: string, value: unknown) => void;
  process: (context: ProcessingContext) => Promise<unknown>;
} & Record<string, unknown>;

const AUTH = { Authorization: "Bearer tk" };
const JSON_HEADERS = { ...AUTH, "Content-Type": "application/json" };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_B64 = PNG.toString("base64");
const WAV = Uint8Array.from([0x52, 0x49, 0x46, 0x46]);

const download = (url: string): WireRequest => ({
  url,
  method: undefined,
  headers: undefined,
  body: undefined
});

const WIRE: Record<"image" | "video" | "speech" | "transcribe", WireRequest[]> =
  {
    image: [
      {
        url: "https://api.together.xyz/v1/images/generations",
        method: "POST",
        headers: JSON_HEADERS,
        body: '{"model":"black-forest-labs/FLUX.1-schnell","prompt":"a fox","n":1,"response_format":"b64_json","width":512,"height":1024,"steps":4,"seed":0,"negative_prompt":"blur"}'
      },
      download("https://cdn.together.ai/image.png")
    ],
    video: [
      {
        url: "https://api.together.xyz/v2/videos",
        method: "POST",
        headers: JSON_HEADERS,
        body: `{"model":"minimax/hailuo-02","prompt":"waves","width":720,"height":1280,"seconds":"6","seed":3,"frame_images":[{"input_image":"data:image/jpeg;base64,${PNG_B64}","frame":"first"}]}`
      },
      {
        url: "https://api.together.xyz/v2/videos/job-1",
        method: undefined,
        headers: AUTH,
        body: undefined
      },
      download("https://cdn.together.ai/video.mp4")
    ],
    speech: [
      {
        url: "https://api.together.xyz/v1/audio/speech",
        method: "POST",
        headers: JSON_HEADERS,
        body: '{"model":"canopylabs/orpheus-3b-0.1-ft","input":"hello","voice":"leo","response_format":"wav","speed":0}'
      }
    ],
    transcribe: [
      {
        url: "https://api.together.xyz/v1/audio/transcriptions",
        method: "POST",
        headers: AUTH,
        body: [
          [
            "file",
            {
              filename: "audio.wav",
              type: "application/octet-stream",
              bytes: [...WAV]
            }
          ],
          ["model", "openai/whisper-large-v3"],
          ["response_format", "json"],
          ["language", "de"]
        ]
      }
    ]
  };

/** Answers every Together request the four nodes make. */
async function reply(url: string): Promise<Response> {
  if (url.endsWith("/v1/images/generations")) {
    return Response.json({
      data: [{ url: "https://cdn.together.ai/image.png" }]
    });
  }
  if (url.endsWith("/v2/videos")) {
    return Response.json({ id: "job-1", status: "queued" });
  }
  if (url.includes("/v2/videos/")) {
    return Response.json({
      status: "completed",
      outputs: { video_url: "https://cdn.together.ai/video.mp4" }
    });
  }
  if (url.endsWith("/v1/audio/speech")) {
    return new Response(WAV);
  }
  if (url.endsWith("/v1/audio/transcriptions")) {
    return Response.json({ text: "hallo" });
  }
  return new Response(PNG);
}

/** FormData bodies become their entries, with file parts read to bytes. */
async function bodyOf(body: BodyInit | null | undefined): Promise<unknown> {
  if (body === undefined || body === null) return undefined;
  if (!(body instanceof FormData)) return String(body);
  const entries: unknown[] = [];
  for (const [name, value] of body.entries()) {
    entries.push([
      name,
      value instanceof File
        ? {
            filename: value.name,
            type: value.type,
            bytes: [...new Uint8Array(await value.arrayBuffer())]
          }
        : value
    ]);
  }
  return entries;
}

function node(className: string, props: Record<string, unknown>): TestNode {
  const spec = (manifest as TogetherManifestEntry[]).find(
    (entry) => entry.className === className
  );
  if (!spec) throw new Error(`No manifest entry ${className}`);
  const Cls = createTogetherNodeClass(spec) as unknown as new () => TestNode;
  const instance = new Cls();
  for (const [key, value] of Object.entries(props)) instance[key] = value;
  return instance;
}

const realSetTimeout = globalThis.setTimeout;
afterEach(() => {
  globalThis.setTimeout = realSetTimeout;
});

/** Run a node against a stubbed fetch and return every request it sent. */
async function wireRequests(instance: TestNode): Promise<WireRequest[]> {
  // The video poll sleeps 5 s between status checks.
  globalThis.setTimeout = ((fn: () => void) =>
    realSetTimeout(fn, 0)) as typeof setTimeout;
  const fetchMock = vi.fn(async (url: string) => reply(url));
  const context = new ProcessingContext({ jobId: "job-1" });
  context.setProviderResolver(
    () =>
      new TogetherProvider(
        { TOGETHER_API_KEY: "tk" },
        // SAFETY: the mock answers every call these nodes make.
        { fetchFn: fetchMock as unknown as typeof fetch }
      )
  );
  await instance.process(context);
  const requests: WireRequest[] = [];
  for (const call of fetchMock.mock.calls) {
    const [url, init] = call as unknown as [string, RequestInit | undefined];
    requests.push({
      url,
      method: init?.method,
      headers: init?.headers,
      body: await bodyOf(init?.body)
    });
  }
  return requests;
}

describe("Together node wire parity", () => {
  it("sends the recorded text-to-image requests", async () => {
    const instance = node("FLUX1SchnellTextToImage", {
      prompt: "a fox",
      width: 512,
      steps: 4,
      seed: 0,
      negative_prompt: "blur"
    });
    expect(await wireRequests(instance)).toEqual(WIRE.image);
  });

  it("sends the recorded image-to-video requests", async () => {
    const instance = node("MiniMaxHailuo02ImageToVideo", {
      image: { type: "image", data: PNG_B64 },
      prompt: "waves",
      aspect_ratio: "9:16",
      seed: 3
    });
    expect(await wireRequests(instance)).toEqual(WIRE.video);
  });

  it("sends the recorded text-to-speech request", async () => {
    const instance = node("Orpheus3BTextToSpeech", {
      text: "hello",
      voice: "leo",
      speed: 0,
      format: "wav"
    });
    expect(await wireRequests(instance)).toEqual(WIRE.speech);
  });

  it("sends the recorded transcription request", async () => {
    const instance = node("WhisperLargeV3Transcribe", {
      audio: { type: "audio", data: Buffer.from(WAV).toString("base64") },
      language: "de"
    });
    expect(await wireRequests(instance)).toEqual(WIRE.transcribe);
  });
});
