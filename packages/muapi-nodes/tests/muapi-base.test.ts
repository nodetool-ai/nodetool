import { afterEach, describe, expect, it, vi } from "vitest";

import {
  downloadMuapiOutput,
  getMuapiApiKey,
  pickMuapiOutputUrl,
  pollMuapi,
  submitMuapi,
  uploadMuapiImage,
  videoRefFromBytes
} from "../src/muapi-base.js";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.MUAPI_API_KEY;
});

describe("MuAPI configuration", () => {
  it("prefers the injected secret and falls back to the environment", () => {
    process.env.MUAPI_API_KEY = "env-key";
    expect(getMuapiApiKey({ MUAPI_API_KEY: "secret-key" })).toBe("secret-key");
    expect(getMuapiApiKey({})).toBe("env-key");
  });

  it("throws when no key is configured", () => {
    expect(() => getMuapiApiKey({})).toThrow("MUAPI_API_KEY is not configured");
  });
});

describe("MuAPI async transport", () => {
  it("submits once, polls terminal output, and downloads the media", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        const url = String(input);
        if (url.endsWith("/flux-3-text-to-image")) {
          expect((init as RequestInit).method).toBe("POST");
          return new Response(JSON.stringify({ request_id: "req_1" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        if (url.endsWith("/predictions/req_1/result")) {
          return new Response(
            JSON.stringify({ status: "completed", result: { image_url: "https://cdn.example/image.png" } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url === "https://cdn.example/image.png") {
          return new Response(Uint8Array.from([137, 80, 78, 71]), { status: 200 });
        }
        throw new Error(`unexpected URL: ${url}`);
      }
    );

    const requestId = await submitMuapi("key", "flux-3-text-to-image", { prompt: "cat" });
    const result = await pollMuapi("key", requestId, {
      pollIntervalMs: 0,
      maxAttempts: 2
    });
    const url = pickMuapiOutputUrl(result);
    const bytes = await downloadMuapiOutput(url);

    expect(requestId).toBe("req_1");
    expect(url).toBe("https://cdn.example/image.png");
    expect([...bytes]).toEqual([137, 80, 78, 71]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recognizes failure as a terminal state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "failure", error: "bad prompt" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(
      pollMuapi("key", "req_failed", { pollIntervalMs: 0, maxAttempts: 1 })
    ).rejects.toThrow("bad prompt");
  });

  it("accepts nested upload responses and sends multipart data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { file: { url: "https://cdn.example/input.png" } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const url = await uploadMuapiImage("key", Uint8Array.from([137, 80, 78, 71]));
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(url).toBe("https://cdn.example/input.png");
    expect((init.body as FormData).get("file")).toBeInstanceOf(Blob);
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("key");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });
});

describe("video refs", () => {
  it("stores raw base64 and keeps the media type", () => {
    expect(videoRefFromBytes(Uint8Array.from([1, 2, 3]))).toEqual({
      type: "video",
      uri: "",
      data: "AQID",
      format: "mp4"
    });
  });
});
