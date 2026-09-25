/**
 * Gemini media generation beyond plain text/image-to-video: Lyria music and
 * Omni Flash video through the Interactions API, and the Veo 3.1 controls
 * (last frame, reference images, extension) on `predictLongRunning`.
 */

import { describe, it, expect, vi } from "vitest";
import { GeminiProvider } from "../../src/providers/gemini-provider.js";
import type { VideoModel } from "../../src/providers/types.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body))
  } as unknown as Response;
}

function bytesResponse(bytes: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  } as unknown as Response;
}

/** A finished Veo operation followed by the download of its video. */
function veoFetch(): ReturnType<typeof vi.fn> {
  return vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
        name: "operations/1",
        done: true,
        response: {
          generateVideoResponse: {
            generatedSamples: [{ video: { uri: "https://example.com/v.mp4" } }]
          }
        }
      })
    )
    .mockResolvedValueOnce(bytesResponse(new Uint8Array([9, 9])));
}

function provider(fetchFn: ReturnType<typeof vi.fn>): GeminiProvider {
  return new GeminiProvider(
    { GEMINI_API_KEY: "k" },
    { fetchFn: fetchFn as unknown as typeof fetch, sleepFn: async () => {} }
  );
}

interface VeoImage {
  bytesBase64Encoded: string;
  mimeType: string;
}

interface RequestBody {
  input?: unknown;
  response_format?: unknown;
  instances: Array<{
    image: VeoImage;
    lastFrame?: VeoImage;
    referenceImages?: unknown;
  }>;
  parameters: Record<string, unknown>;
}

function requestBody(
  fetchFn: ReturnType<typeof vi.fn>,
  call = 0
): RequestBody {
  return JSON.parse(fetchFn.mock.calls[call][1].body) as RequestBody;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70]);

const VEO: VideoModel = {
  id: "veo-3.1-generate-preview",
  name: "Veo 3.1",
  provider: "gemini"
};
const VEO_LITE: VideoModel = {
  id: "veo-3.1-lite-generate-preview",
  name: "Veo 3.1 Lite",
  provider: "gemini"
};
const OMNI: VideoModel = {
  id: "gemini-omni-1.1-flash",
  name: "Gemini Omni Flash",
  provider: "gemini"
};

describe("GeminiProvider – textToMusic (Lyria)", () => {
  it("posts the prompt, length and lyrics to the Interactions API", async () => {
    const audio = Buffer.from("ID3 fake mp3").toString("base64");
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "i1",
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              { type: "text", text: "notes" },
              { type: "audio", data: audio, mime_type: "audio/mp3" }
            ]
          }
        ]
      })
    );

    const result = await provider(fetchFn).textToMusic({
      model: { id: "lyria-3.5", name: "Lyria 3.5", provider: "gemini" },
      prompt: "Warm lo-fi piano",
      durationSeconds: 90,
      lyrics: "La la la"
    });

    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions"
    );
    expect(fetchFn.mock.calls[0][1].headers["x-goog-api-key"]).toBe("k");
    expect(requestBody(fetchFn)).toEqual({
      model: "lyria-3.5",
      input: "Warm lo-fi piano\n\nLength: about 90 seconds.\n\nLyrics:\nLa la la"
    });
    expect(Buffer.from(result.data).toString()).toBe("ID3 fake mp3");
    expect(result.mimeType).toBe("audio/mp3");
  });

  it("requests WAV from Lyria 3.5 only", async () => {
    const reply = jsonResponse({
      status: "completed",
      steps: [{ content: [{ type: "audio", data: "AAAA" }] }]
    });
    const fetchFn = vi.fn().mockResolvedValue(reply);
    const gemini = provider(fetchFn);

    await gemini.textToMusic({
      model: { id: "lyria-3.5", name: "Lyria", provider: "gemini" },
      prompt: "drums",
      audioFormat: "wav"
    });
    await gemini.textToMusic({
      model: { id: "lyria-3-clip-preview", name: "Clip", provider: "gemini" },
      prompt: "drums",
      audioFormat: "wav"
    });

    expect(requestBody(fetchFn, 0).response_format).toEqual({ type: "audio" });
    expect(requestBody(fetchFn, 1).response_format).toBeUndefined();
  });

  it("rejects a non-Lyria model without calling the API", async () => {
    const fetchFn = vi.fn();
    await expect(
      provider(fetchFn).textToMusic({
        model: { id: "veo-3.1-generate-preview", name: "x", provider: "gemini" },
        prompt: "song"
      })
    ).rejects.toThrow("not a Lyria model");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("raises when the interaction did not complete", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: "failed", steps: [] }));
    await expect(
      provider(fetchFn).textToMusic({
        model: { id: "lyria-3.5", name: "Lyria", provider: "gemini" },
        prompt: "song"
      })
    ).rejects.toThrow("status failed");
  });

  it("raises when the interaction holds no audio", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "completed",
        steps: [{ content: [{ type: "text", text: "no" }] }]
      })
    );
    await expect(
      provider(fetchFn).textToMusic({
        model: { id: "lyria-3.5", name: "Lyria", provider: "gemini" },
        prompt: "song"
      })
    ).rejects.toThrow("no audio output");
  });
});

describe("GeminiProvider – Veo 3.1 controls", () => {
  it("sends the end image as lastFrame in an 8-second clip", async () => {
    const fetchFn = veoFetch();
    await provider(fetchFn).imageToVideo(PNG, {
      model: VEO,
      prompt: "morph",
      endImage: JPEG
    });

    const body = requestBody(fetchFn);
    expect(body.instances[0].image.mimeType).toBe("image/png");
    expect(body.instances[0].lastFrame).toEqual({
      bytesBase64Encoded: Buffer.from(JPEG).toString("base64"),
      mimeType: "image/jpeg"
    });
    expect(body.parameters.durationSeconds).toBe(8);
  });

  it("sends up to three asset reference images", async () => {
    const fetchFn = veoFetch();
    const result = await provider(fetchFn).referenceToVideo(
      { images: [PNG, JPEG], videos: [] },
      { model: VEO, prompt: "a woman in the dress", aspectRatio: "9:16" }
    );

    expect(result).toEqual(new Uint8Array([9, 9]));
    expect(fetchFn.mock.calls[0][0]).toContain(
      "/models/veo-3.1-generate-preview:predictLongRunning"
    );
    const body = requestBody(fetchFn);
    expect(body.instances[0].referenceImages).toEqual([
      {
        image: {
          bytesBase64Encoded: Buffer.from(PNG).toString("base64"),
          mimeType: "image/png"
        },
        referenceType: "asset"
      },
      {
        image: {
          bytesBase64Encoded: Buffer.from(JPEG).toString("base64"),
          mimeType: "image/jpeg"
        },
        referenceType: "asset"
      }
    ]);
    expect(body.parameters).toEqual({ aspectRatio: "9:16", durationSeconds: 8 });
  });

  it("rejects reference input Veo cannot take", async () => {
    const fetchFn = vi.fn();
    const gemini = provider(fetchFn);
    await expect(
      gemini.referenceToVideo(
        { images: [PNG, PNG, PNG, PNG], videos: [] },
        { model: VEO, prompt: "p" }
      )
    ).rejects.toThrow("at most 3 reference images");
    await expect(
      gemini.referenceToVideo(
        { images: [], videos: [MP4] },
        { model: VEO, prompt: "p" }
      )
    ).rejects.toThrow("reference images only");
    await expect(
      gemini.referenceToVideo(
        { images: [PNG], videos: [] },
        { model: VEO_LITE, prompt: "p" }
      )
    ).rejects.toThrow("does not support reference_to_video");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("extends a video at the end by seven seconds", async () => {
    const fetchFn = veoFetch();
    await provider(fetchFn).extendVideo(MP4, {
      model: VEO,
      prompt: "keep flying",
      mode: "end",
      durationSeconds: 7
    });

    expect(requestBody(fetchFn)).toEqual({
      instances: [
        {
          prompt: "keep flying",
          video: {
            inlineData: {
              mimeType: "video/mp4",
              data: Buffer.from(MP4).toString("base64")
            }
          }
        }
      ],
      parameters: { numberOfVideos: 1, resolution: "720p" }
    });
  });

  it("rejects extensions Veo cannot produce", async () => {
    const fetchFn = vi.fn();
    const gemini = provider(fetchFn);
    await expect(
      gemini.extendVideo(MP4, {
        model: VEO,
        prompt: "p",
        mode: "start",
        durationSeconds: 7
      })
    ).rejects.toThrow("at the end only");
    await expect(
      gemini.extendVideo(MP4, {
        model: VEO,
        prompt: "p",
        mode: "end",
        durationSeconds: 5
      })
    ).rejects.toThrow("exactly 7 seconds");
    await expect(
      gemini.extendVideo(MP4, {
        model: VEO_LITE,
        prompt: "p",
        mode: "end",
        durationSeconds: 7
      })
    ).rejects.toThrow("does not support extend_video");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("GeminiProvider – Gemini Omni Flash video", () => {
  const video = Buffer.from("omni-mp4").toString("base64");
  const inlineVideo = {
    status: "completed",
    steps: [
      {
        type: "model_output",
        content: [{ type: "video", mime_type: "video/mp4", data: video }]
      }
    ]
  };

  it("generates text-to-video through the Interactions API", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(inlineVideo));
    const result = await provider(fetchFn).textToVideo({
      model: OMNI,
      prompt: "a paper boat",
      aspectRatio: "9:16",
      resolution: "1080p"
    });

    expect(Buffer.from(result).toString()).toBe("omni-mp4");
    expect(fetchFn.mock.calls[0][0]).toContain("/v1beta/interactions");
    expect(requestBody(fetchFn)).toEqual({
      model: "gemini-omni-1.1-flash",
      input: [{ type: "text", text: "a paper boat" }],
      response_format: {
        type: "video",
        aspect_ratio: "9:16",
        resolution: "1080p"
      }
    });
  });

  it("animates an image", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(inlineVideo));
    await provider(fetchFn).imageToVideo(JPEG, { model: OMNI, prompt: "wave" });

    expect(requestBody(fetchFn).input).toEqual([
      {
        type: "image",
        data: Buffer.from(JPEG).toString("base64"),
        mime_type: "image/jpeg"
      },
      { type: "text", text: "wave" }
    ]);
  });

  it("edits a video and downloads a uri-delivered result", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: "completed",
          steps: [
            {
              content: [
                {
                  type: "video",
                  mime_type: "video/mp4",
                  uri: "https://generativelanguage.googleapis.com/v1beta/files/x:download"
                }
              ]
            }
          ]
        })
      )
      .mockResolvedValueOnce(bytesResponse(new Uint8Array([7])));

    const result = await provider(fetchFn).videoToVideo(MP4, {
      model: OMNI,
      prompt: "make the mirror ripple",
      referenceImages: [PNG]
    });

    expect(result).toEqual(new Uint8Array([7]));
    expect(requestBody(fetchFn).input).toEqual([
      {
        type: "video",
        data: Buffer.from(MP4).toString("base64"),
        mime_type: "video/mp4"
      },
      {
        type: "image",
        data: Buffer.from(PNG).toString("base64"),
        mime_type: "image/png"
      },
      { type: "text", text: "make the mirror ripple" }
    ]);
    expect(fetchFn.mock.calls[1][1].headers["x-goog-api-key"]).toBe("k");
  });

  it("rejects editing on a Veo model", async () => {
    const fetchFn = vi.fn();
    await expect(
      provider(fetchFn).videoToVideo(MP4, { model: VEO, prompt: "edit" })
    ).rejects.toThrow("does not support video_to_video");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
