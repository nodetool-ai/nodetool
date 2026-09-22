import { afterEach, describe, expect, it, vi } from "vitest";
import {
  higgsfieldDownloadResult,
  higgsfieldEstimate,
  higgsfieldGetStatusByRequestId,
  higgsfieldOutputUrls,
  higgsfieldSubmit,
  higgsfieldUploadMedia,
  type HiggsfieldCredentials
} from "@nodetool-ai/runtime";

const credentials: HiggsfieldCredentials = { keyId: "id", secret: "secret" };
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Higgsfield transport", () => {
  it("composes the documented Key auth header and never retries submission", async () => {
    const fetchMock = vi.fn(async () => new Response("upstream failure", { status: 503 }));
    globalThis.fetch = fetchMock;
    await expect(higgsfieldSubmit(credentials, "model/id", { prompt: "hello" })).rejects.toThrow("HTTP 503");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Key id:secret");
  });

  it("collects every declared media output without inventing URLs", () => {
    expect(higgsfieldOutputUrls({
      status: "completed",
      images: [{ url: "https://cdn.example/image.png" }],
      video: { url: "https://cdn.example/video.mp4" },
      audio: { url: "https://cdn.example/audio.wav" },
      audios: [{ url: "https://cdn.example/audio.wav" }],
      outputs: [{ url: "https://cdn.example/model.fbx" }]
    })).toEqual([
      "https://cdn.example/image.png",
      "https://cdn.example/video.mp4",
      "https://cdn.example/audio.wav",
      "https://cdn.example/model.fbx"
    ]);
  });

  it("does not forward Higgsfield credentials to a presigned upload host", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;
    await higgsfieldUploadMedia({
      upload_url: "https://upload.example/file",
      public_url: "https://cdn.example/file",
      headers: { "x-upload-token": "presigned", "Content-Type": "image/png" }
    }, Uint8Array.from([1, 2]), "image/png");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
    expect(new Headers(init?.headers).get("x-upload-token")).toBe("presigned");
  });

  it("accepts the documented upload_headers and nullable error", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      upload_url: "https://upload.example/file",
      public_url: "https://cdn.example/file",
      upload_headers: { "x-upload-token": "presigned" }
    }), { status: 200 }));
    globalThis.fetch = fetchMock;
    const { higgsfieldCreateUploadUrl, higgsfieldGetStatus } = await import("@nodetool-ai/runtime");
    await expect(higgsfieldCreateUploadUrl(credentials, "image/png")).resolves.toMatchObject({ headers: { "x-upload-token": "presigned" } });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ status: "completed", error: null, video: { url: "https://cdn.example/video.mp4" } }), { status: 200 }));
    await expect(higgsfieldGetStatus(credentials, "https://api.higgsfield.ai/status")).resolves.toMatchObject({ status: "completed", error: null });
  });

  it("downloads an accepted result through the guarded fetch seam", async () => {
    globalThis.fetch = vi.fn(async () => new Response(Uint8Array.from([1, 2, 3]), { status: 200 }));
    await expect(higgsfieldDownloadResult("https://cdn.example/result.png")).resolves.toEqual(Uint8Array.from([1, 2, 3]));
  });

  it("recovers status by UUID without creating a replacement generation", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      expect(String(input)).toContain("/requests/550e8400-e29b-41d4-a716-446655440000/status");
      return new Response(JSON.stringify({ status: "completed", video: "https://cdn.example/result.mp4" }), { status: 200 });
    });
    globalThis.fetch = fetchMock;
    await expect(higgsfieldGetStatusByRequestId(credentials, "550e8400-e29b-41d4-a716-446655440000")).resolves.toMatchObject({ status: "completed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("submits estimates once and preserves the exact payload", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ credits: "3.000", usd: "0.120" }), { status: 200 }));
    globalThis.fetch = fetchMock;
    await expect(higgsfieldEstimate(credentials, "model/id", { prompt: "hello", duration: 5 })).resolves.toEqual({ credits: 3, usd: 0.12 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ prompt: "hello", duration: 5 });
  });
});
