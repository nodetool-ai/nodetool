/**
 * HiggsfieldProvider endpoint calls, uploads and downloads, with `fetch`
 * mocked at the provider boundary.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HiggsfieldProvider } from "../../src/providers/higgsfield-provider.js";
import { runWithGenerationReceipt } from "../../src/generation-receipt.js";

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const STATUS_URL = `https://api.higgsfield.ai/requests/${REQUEST_ID}/status`;
const MODEL = "bytedance/seedance-2.5/text-to-video";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function provider(): HiggsfieldProvider {
  return new HiggsfieldProvider({ HIGGSFIELD_API_KEY_ID: " kid ", HIGGSFIELD_API_KEY_SECRET: "ksecret\n" });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("HiggsfieldProvider endpoint calls", () => {
  it("claims endpoint support", () => {
    expect(provider().supportsEndpointCalls()).toBe(true);
  });

  it("submits the input once, polls the status URL and returns the status body", async () => {
    const statuses = [
      { status: "in_progress" },
      { status: "completed", video: { url: "https://cdn.example/out.mp4" } }
    ];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === `https://api.higgsfield.ai/${MODEL}`) {
        return json({ request_id: REQUEST_ID, status_url: STATUS_URL, cancel_url: `${STATUS_URL}/cancel` });
      }
      if (url === STATUS_URL) return json(statuses.shift());
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const progress: unknown[] = [];

    const { value: result, receipt } = await runWithGenerationReceipt(() =>
      provider().callEndpoint({ model: MODEL, input: { prompt: "rain", duration: 5 }, onProgress: (event) => progress.push(event) })
    );

    expect(result).toEqual({
      output: { status: "completed", video: { url: "https://cdn.example/out.mp4" } },
      requestId: REQUEST_ID
    });
    expect(receipt?.provider_request_id).toBe(REQUEST_ID);
    expect(progress).toEqual([{ message: "in_progress" }, { message: "completed" }]);
    const submit = fetchMock.mock.calls[0];
    expect(submit?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(submit?.[1]?.body))).toEqual({ prompt: "rain", duration: 5 });
    expect(new Headers(submit?.[1]?.headers).get("Authorization")).toBe("Key kid:ksecret");
  }, 20_000);

  it("rejects a route and a model outside the manifest before any request", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(provider().callEndpoint({ model: MODEL, input: {}, route: "v2" })).rejects.toThrow('take no route, got "v2"');
    await expect(provider().callEndpoint({ model: "../admin", input: {} })).rejects.toThrow("Unknown Higgsfield model: ../admin");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not retry a failed submission", async () => {
    const fetchMock = vi.fn(async () => new Response("overloaded", { status: 503 }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(provider().callEndpoint({ model: MODEL, input: { prompt: "x" } })).rejects.toThrow("HTTP 503");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uploads through a presigned URL and returns the public URL", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://api.higgsfield.ai/files/generate-upload-url") {
        return json({ upload_url: "https://upload.example/put", public_url: "https://cdn.example/in.mp4", upload_headers: { "x-upload-token": "t" } });
      }
      if (url === "https://upload.example/put") return new Response(null, { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const url = await provider().uploadMedia({ bytes: Uint8Array.from([1, 2]), mimeType: "video/mp4" });

    expect(url).toBe("https://cdn.example/in.mp4");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ content_type: "video/mp4" });
    const put = fetchMock.mock.calls[1]?.[1];
    expect(put?.method).toBe("PUT");
    expect(new Headers(put?.headers).get("Authorization")).toBeNull();
    expect(new Headers(put?.headers).get("Content-Type")).toBe("video/mp4");
  });

  it("downloads a result URL and retries a transient failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(new Response(Uint8Array.from([5, 6]), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(provider().downloadMedia("https://cdn.example/out.png")).resolves.toEqual(Uint8Array.from([5, 6]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses a result URL on a private host", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(provider().downloadMedia("https://169.254.169.254/latest")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
