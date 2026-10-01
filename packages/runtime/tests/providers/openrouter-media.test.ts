import { describe, it, expect, vi } from "vitest";
import { OpenRouterProvider } from "../../src/providers/openrouter-provider.js";
import { BaseProvider } from "../../src/providers/base-provider.js";
import type { VideoModel } from "../../src/providers/types.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 9]);
const MP4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);

const VIDEO_MODEL: VideoModel = {
  id: "google/veo-3.1",
  name: "Veo 3.1",
  provider: "openrouter"
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/** Routes each OpenRouter URL to a canned response and records every call. */
function routedFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route();
  });
}

function makeProvider(fetchFn: ReturnType<typeof routedFetch>) {
  return new OpenRouterProvider(
    { OPENROUTER_API_KEY: "or-key" },
    { client: {} as never, fetchFn: fetchFn as unknown as typeof fetch }
  );
}

function bodyOf(fetchFn: ReturnType<typeof routedFetch>, url: string) {
  const call = fetchFn.mock.calls.find(([u]) => String(u) === url);
  if (!call) throw new Error(`no call to ${url}`);
  return JSON.parse(String(call[1]?.body)) as Record<string, any>;
}

const BASE = "https://openrouter.ai/api/v1";

function videoRoutes(status: Record<string, unknown>) {
  return {
    [`${BASE}/videos`]: () =>
      json({ id: "job 1", polling_url: "https://evil.example/poll", status: "pending" }, 202),
    [`${BASE}/videos/job%201`]: () => json(status),
    [`${BASE}/videos/job%201/content?index=0`]: () => new Response(MP4)
  };
}

describe("OpenRouterProvider video", () => {
  it("lists prompt-driven video models from /videos/models", async () => {
    const fetchFn = routedFetch({
      [`${BASE}/videos/models`]: () =>
        json({
          data: [
            {
              id: "google/veo-3.1",
              name: "Google: Veo 3.1",
              supported_durations: [4, 6, 8],
              supported_resolutions: ["720p", "1080p"],
              supported_aspect_ratios: ["16:9", "9:16"],
              supported_frame_images: ["first_frame", "last_frame"],
              upscale_factor: null
            },
            {
              id: "openai/sora-2-pro",
              name: "OpenAI: Sora 2 Pro",
              supported_durations: [4, 8],
              supported_resolutions: null,
              supported_aspect_ratios: null,
              supported_frame_images: null,
              upscale_factor: null
            },
            {
              id: "black-forest-labs/flux-video-edit",
              name: "FLUX Video Edit",
              supported_durations: null
            },
            {
              id: "black-forest-labs/flux-video-upscale",
              name: "FLUX Video Upscale",
              supported_durations: [5],
              upscale_factor: { min: 1.5, max: 3 }
            }
          ]
        })
    });
    const provider = makeProvider(fetchFn);

    expect(await provider.getAvailableVideoModels()).toEqual([
      {
        id: "google/veo-3.1",
        name: "Google: Veo 3.1",
        provider: "openrouter",
        supportedTasks: ["text_to_video", "image_to_video"],
        durations: [4, 6, 8],
        resolutions: ["720p", "1080p"],
        aspectRatios: ["16:9", "9:16"]
      },
      {
        id: "openai/sora-2-pro",
        name: "OpenAI: Sora 2 Pro",
        provider: "openrouter",
        supportedTasks: ["text_to_video"],
        durations: [4, 8]
      }
    ]);
    const headers = fetchFn.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer or-key");
  });

  it("submits text-to-video, polls by job id and downloads the content", async () => {
    const fetchFn = routedFetch(
      videoRoutes({ id: "job 1", status: "completed", usage: { cost: 0.25 } })
    );
    const provider = makeProvider(fetchFn);

    const video = await provider.textToVideo({
      model: VIDEO_MODEL,
      prompt: "a fox in snow",
      negativePrompt: "text",
      durationSeconds: 6,
      resolution: "720p",
      aspectRatio: "16:9",
      seed: 7
    });

    expect(video).toEqual(MP4);
    expect(bodyOf(fetchFn, `${BASE}/videos`)).toEqual({
      model: "google/veo-3.1",
      prompt: "a fox in snow\n\nDo not include: text",
      duration: 6,
      resolution: "720p",
      aspect_ratio: "16:9",
      seed: 7
    });
    // The polling_url in the submit response is never followed.
    expect(fetchFn.mock.calls.map(([u]) => String(u))).not.toContain(
      "https://evil.example/poll"
    );
  });

  it("sends the start and end frames as data URIs in frame_images", async () => {
    const fetchFn = routedFetch(videoRoutes({ status: "completed" }));
    const provider = makeProvider(fetchFn);

    await provider.imageToVideo(PNG, {
      model: VIDEO_MODEL,
      prompt: "zoom in",
      endImage: JPEG
    });

    const body = bodyOf(fetchFn, `${BASE}/videos`);
    expect(body.frame_images).toEqual([
      {
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`
        },
        frame_type: "first_frame"
      },
      {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`
        },
        frame_type: "last_frame"
      }
    ]);
  });

  it("reports the upstream error when the job fails", async () => {
    const fetchFn = routedFetch(
      videoRoutes({ status: "failed", error: { message: "content policy" } })
    );
    const provider = makeProvider(fetchFn);

    await expect(
      provider.textToVideo({ model: VIDEO_MODEL, prompt: "x" })
    ).rejects.toThrow("OpenRouter video job job 1 failed: content policy");
  });

  it("names the status when submission is rejected", async () => {
    const fetchFn = routedFetch({
      [`${BASE}/videos`]: () => json({ error: "bad duration" }, 400)
    });
    const provider = makeProvider(fetchFn);

    await expect(
      provider.textToVideo({ model: VIDEO_MODEL, prompt: "x" })
    ).rejects.toThrow("OpenRouter video submit failed: 400");
  });

  it("advertises video capabilities but not reference-to-video", () => {
    const provider = makeProvider(routedFetch({}));
    const caps = (provider as unknown as BaseProvider).getCapabilities();
    expect(caps).toContain("text_to_video");
    expect(caps).toContain("image_to_video");
    expect(caps).not.toContain("reference_to_video");
  });
});
