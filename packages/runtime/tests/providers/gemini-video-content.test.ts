import { describe, it, expect, vi } from "vitest";
import {
  GeminiProvider,
  GEMINI_INLINE_VIDEO_MAX_BYTES
} from "../../src/providers/gemini-provider.js";

function jsonResponse(
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

describe("GeminiProvider video content", () => {
  it("sends a small video inline with a sniffed mime type", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    // ISO base media header: <size> "ftyp" "isom" — sniffs as video/mp4.
    const bytes = new Uint8Array([
      0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 1, 2, 3
    ]);

    const result = await provider.convertMessages([
      { role: "user", content: [{ type: "video", video: { data: bytes } }] }
    ]);

    const part = result.contents[0].parts[0];
    expect(part.inlineData).toBeDefined();
    expect(part.inlineData!.mimeType).toBe("video/mp4");
    expect(part.inlineData!.data).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("takes the mime type from a video data URI", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });
    const base64 = Buffer.from("webmdata").toString("base64");

    const result = await provider.convertMessages([
      {
        role: "user",
        content: [
          { type: "video", video: { uri: `data:video/webm;base64,${base64}` } }
        ]
      }
    ]);

    const part = result.contents[0].parts[0];
    expect(part.inlineData!.mimeType).toBe("video/webm");
    expect(part.inlineData!.data).toBe(base64);
  });

  it("uploads a large video through the Files API and emits fileData", async () => {
    const bytes = new Uint8Array(GEMINI_INLINE_VIDEO_MAX_BYTES + 1024);
    bytes.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes("/upload/v1beta/files")) {
          return jsonResponse(
            {},
            { "x-goog-upload-url": "https://upload.example/session/1" }
          );
        }
        if (url.startsWith("https://upload.example/")) {
          return jsonResponse({
            file: {
              name: "files/abc",
              uri: "https://generativelanguage.googleapis.com/v1beta/files/abc",
              state: "PROCESSING"
            }
          });
        }
        return jsonResponse({ name: "files/abc", state: "ACTIVE" });
      }
    ) as unknown as typeof fetch;

    const provider = new GeminiProvider(
      { GEMINI_API_KEY: "k" },
      { fetchFn, sleepFn: async () => {} }
    );

    const result = await provider.convertMessages([
      { role: "user", content: [{ type: "video", video: { data: bytes } }] }
    ]);

    const part = result.contents[0].parts[0];
    expect(part.inlineData).toBeUndefined();
    expect(part.fileData).toEqual({
      mimeType: "video/mp4",
      fileUri: "https://generativelanguage.googleapis.com/v1beta/files/abc"
    });

    const startHeaders = calls[0].init?.headers as Record<string, string>;
    expect(calls[0].url).toContain("/upload/v1beta/files");
    expect(startHeaders["X-Goog-Upload-Protocol"]).toBe("resumable");
    expect(startHeaders["X-Goog-Upload-Command"]).toBe("start");
    expect(startHeaders["X-Goog-Upload-Header-Content-Length"]).toBe(
      String(bytes.length)
    );
    expect(startHeaders["X-Goog-Upload-Header-Content-Type"]).toBe("video/mp4");

    const uploadHeaders = calls[1].init?.headers as Record<string, string>;
    expect(calls[1].url).toBe("https://upload.example/session/1");
    expect(uploadHeaders["X-Goog-Upload-Command"]).toBe("upload, finalize");
    expect(uploadHeaders["X-Goog-Upload-Offset"]).toBe("0");

    // One poll, and it stops as soon as the file reports ACTIVE.
    expect(calls).toHaveLength(3);
    expect(calls[2].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/files/abc"
    );
  });

  it("fails when the uploaded file reports FAILED", async () => {
    const bytes = new Uint8Array(GEMINI_INLINE_VIDEO_MAX_BYTES + 1);
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/upload/v1beta/files")) {
        return jsonResponse(
          {},
          { "x-goog-upload-url": "https://upload.example/session/1" }
        );
      }
      if (url.startsWith("https://upload.example/")) {
        return jsonResponse({
          file: { name: "files/bad", uri: "u", state: "PROCESSING" }
        });
      }
      return jsonResponse({
        name: "files/bad",
        state: "FAILED",
        error: { message: "transcode error" }
      });
    }) as unknown as typeof fetch;

    const provider = new GeminiProvider(
      { GEMINI_API_KEY: "k" },
      { fetchFn, sleepFn: async () => {} }
    );

    await expect(
      provider.convertMessages([
        { role: "user", content: [{ type: "video", video: { data: bytes } }] }
      ])
    ).rejects.toThrow("transcode error");
  });

  it("still degrades unsupported content to a text placeholder", async () => {
    const provider = new GeminiProvider({ GEMINI_API_KEY: "k" });

    const result = await provider.convertMessages([
      {
        role: "user",
        content: [
          {
            type: "document",
            document: { data: "x", mimeType: "application/pdf" }
          }
        ]
      }
    ]);

    expect(result.contents[0].parts[0]).toEqual({
      text: "[unsupported content type]"
    });
  });
});
