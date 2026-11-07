import { afterEach, describe, expect, it, vi } from "vitest";
import { FalProvider } from "../../src/providers/fal-provider.js";
import type { EndpointProgress } from "../../src/providers/base-provider.js";

const upload = vi.fn(async (_blob: Blob) => "https://v3.fal.media/files/up.png");

// A queue-capable SDK: FalProvider then drives the queue over its own fetch.
vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn(() => ({
    queue: {},
    subscribe: vi.fn(),
    storage: { upload }
  }))
}));

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** A fetch that answers the FAL queue: submit, then the given statuses, then the result. */
function queueFetch(
  statuses: Record<string, unknown>[],
  result: Record<string, unknown>,
  submit: Response = Response.json({ request_id: "req-1" })
): { fetchFn: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const pending = [...statuses];
  const fetchFn = vi.fn(async (url: URL | string, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (init?.method === "POST") return submit;
    if (href.endsWith("/status")) {
      return Response.json(pending.shift() ?? { status: "COMPLETED" });
    }
    return Response.json(result);
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

afterEach(() => {
  upload.mockClear();
});

describe("FalProvider endpoint calls", () => {
  it("reports endpoint call support", () => {
    expect(new FalProvider({ FAL_API_KEY: "k" }).supportsEndpointCalls()).toBe(
      true
    );
  });

  it("submits the input unchanged and returns the endpoint output and request id", async () => {
    const { fetchFn, calls } = queueFetch([{ status: "COMPLETED" }], {
      images: [{ url: "https://v3.fal.media/files/out.png" }]
    });
    const provider = new FalProvider({ FAL_API_KEY: "test-key" }, { fetchFn });

    const result = await provider.callEndpoint({
      model: "fal-ai/flux/dev",
      input: { prompt: "a fox", seed: 7 }
    });

    expect(result).toEqual({
      output: { images: [{ url: "https://v3.fal.media/files/out.png" }] },
      requestId: "req-1"
    });
    const submit = calls[0];
    expect(submit.url).toBe("https://queue.fal.run/fal-ai/flux/dev");
    expect(JSON.parse(String(submit.init?.body))).toEqual({
      prompt: "a fox",
      seed: 7
    });
    expect(new Headers(submit.init?.headers).get("Authorization")).toBe(
      "Key test-key"
    );
    expect(calls.map((call) => call.url)).toEqual([
      "https://queue.fal.run/fal-ai/flux/dev",
      "https://queue.fal.run/fal-ai/flux/requests/req-1/status",
      "https://queue.fal.run/fal-ai/flux/requests/req-1"
    ]);
  });

  it("maps the queue position and log lines to progress", async () => {
    const { fetchFn } = queueFetch(
      [
        { status: "IN_QUEUE", queue_position: 2 },
        {
          status: "COMPLETED",
          logs: [{ message: "step 1" }, { message: "step 2" }]
        }
      ],
      { video: { url: "https://v3.fal.media/files/out.mp4" } }
    );
    const provider = new FalProvider({ FAL_API_KEY: "k" }, { fetchFn });
    const progress: EndpointProgress[] = [];

    await provider.callEndpoint({
      model: "fal-ai/amt-interpolation",
      input: {},
      onProgress: (event) => progress.push(event)
    });

    expect(progress).toEqual([
      { message: "Queued at position 2" },
      { message: "step 1" },
      { message: "step 2" }
    ]);
  });

  it("forwards the abort signal to every queue request", async () => {
    const { fetchFn, calls } = queueFetch([{ status: "COMPLETED" }], {
      output: "ok"
    });
    const provider = new FalProvider({ FAL_API_KEY: "k" }, { fetchFn });
    const controller = new AbortController();

    await provider.callEndpoint({
      model: "fal-ai/any-llm",
      input: {},
      signal: controller.signal
    });

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.init?.signal).toBe(controller.signal);
    }
  });

  it("surfaces the queue's rejection reason", async () => {
    const { fetchFn } = queueFetch(
      [],
      {},
      Response.json(
        { detail: [{ loc: ["body", "prompt"], msg: "field required" }] },
        { status: 422 }
      )
    );
    const provider = new FalProvider({ FAL_API_KEY: "k" }, { fetchFn });

    await expect(
      provider.callEndpoint({ model: "fal-ai/flux/dev", input: {} })
    ).rejects.toThrow(/FAL queue request failed \(HTTP 422\).*prompt/);
  });

  it("refuses a route and a missing key before any request", async () => {
    const { fetchFn, calls } = queueFetch([], {});
    const configured = new FalProvider({ FAL_API_KEY: "k" }, { fetchFn });
    await expect(
      configured.callEndpoint({ model: "fal-ai/flux/dev", input: {}, route: "x" })
    ).rejects.toThrow("fal_ai does not accept an endpoint route: x");

    const unconfigured = new FalProvider({}, { fetchFn });
    await expect(
      unconfigured.callEndpoint({ model: "fal-ai/flux/dev", input: {} })
    ).rejects.toThrow("FAL_API_KEY is not configured");
    expect(calls).toEqual([]);
  });

  it("maps an SDK client's queue updates the same way", async () => {
    const subscribe = vi.fn(
      async (
        _endpoint: string,
        opts: { onQueueUpdate?: (update: Record<string, unknown>) => void }
      ) => {
        opts.onQueueUpdate?.({ status: "IN_QUEUE", queue_position: 0 });
        opts.onQueueUpdate?.({
          status: "IN_PROGRESS",
          logs: [{ message: "denoising" }]
        });
        return { data: { text: "hi" }, requestId: "sdk-1" };
      }
    );
    const provider = new FalProvider({ FAL_API_KEY: "k" });
    (provider as unknown as { _client: unknown })._client = {
      subscribe,
      storage: { upload }
    };
    const progress: EndpointProgress[] = [];

    const result = await provider.callEndpoint({
      model: "fal-ai/any-llm",
      input: { prompt: "hello" },
      onProgress: (event) => progress.push(event)
    });

    expect(result).toEqual({ output: { text: "hi" }, requestId: "sdk-1" });
    expect(subscribe.mock.calls[0][1]).toMatchObject({
      input: { prompt: "hello" },
      logs: true
    });
    expect(progress).toEqual([
      { message: "Queued at position 0" },
      { message: "denoising" }
    ]);
  });
});

describe("FalProvider media uploads", () => {
  it("uploads the bytes to FAL storage with their MIME type", async () => {
    const provider = new FalProvider({ FAL_API_KEY: "k" });
    const bytes = new Uint8Array([137, 80, 78, 71]);

    const url = await provider.uploadMedia({ bytes, mimeType: "image/png" });

    expect(url).toBe("https://v3.fal.media/files/up.png");
    const blob = upload.mock.calls[0][0];
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it("does not upload when the signal is already aborted or the key is missing", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stopped"));
    await expect(
      new FalProvider({ FAL_API_KEY: "k" }).uploadMedia({
        bytes: new Uint8Array([1]),
        mimeType: "image/png",
        signal: controller.signal
      })
    ).rejects.toThrow("stopped");
    await expect(
      new FalProvider({}).uploadMedia({
        bytes: new Uint8Array([1]),
        mimeType: "image/png"
      })
    ).rejects.toThrow("FAL_API_KEY is not configured");
    expect(upload).not.toHaveBeenCalled();
  });
});
