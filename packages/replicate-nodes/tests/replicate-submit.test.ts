/**
 * Tests for replicateSubmit submit/poll lifecycle, assetToUrl upload paths,
 * and registerReplicateNodes registry integration.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  replicateSubmit,
  assetToUrl,
  type ReplicatePrediction,
} from "../src/replicate-base.js";
import { registerReplicateNodes } from "../src/index.js";
import { NodeRegistry } from "@nodetool/node-sdk";

/* ------------------------------------------------------------------ */
/*  fetch mock setup                                                    */
/* ------------------------------------------------------------------ */

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function makePrediction(
  status: ReplicatePrediction["status"],
  output: unknown = null,
  error: string | null = null
): ReplicatePrediction {
  return {
    id: "pred_test123",
    version: "abc123",
    status,
    input: { prompt: "test" },
    output,
    error,
    urls: {
      get: "https://api.replicate.com/v1/predictions/pred_test123",
      cancel: "https://api.replicate.com/v1/predictions/pred_test123/cancel",
    },
    created_at: "2024-01-01T00:00:00Z",
    started_at: null,
    completed_at: null,
  };
}

function mockJsonResponse(data: unknown, status = 200): Response {
  const body = JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : String(status),
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => data,
    text: async () => body,
    clone: () => mockJsonResponse(data, status),
  } as unknown as Response;
}

function mockErrorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    headers: new Headers({ "content-type": "text/plain" }),
    text: async () => body,
    json: async () => ({ detail: body }),
    clone: () => mockErrorResponse(status, body),
  } as unknown as Response;
}

/**
 * Helper for tests that expect a polling-based async rejection with fake timers.
 * Attaches the rejection handler BEFORE advancing timers to prevent unhandled rejection warnings.
 */
async function expectPollingRejection(
  promise: Promise<unknown>,
  expectedMessage: string
): Promise<void> {
  const expectation = expect(promise).rejects.toThrow(expectedMessage);
  await vi.runAllTimersAsync();
  await expectation;
}

/* ================================================================== */
/*  replicateSubmit                                                     */
/* ================================================================== */

describe("replicateSubmit", () => {
  const apiKey = "test-replicate-key";

  it("sends version field for versioned model IDs (owner/name:version)", async () => {
    const prediction = makePrediction("succeeded", "https://replicate.com/output.png");
    mockFetch.mockResolvedValueOnce(mockJsonResponse(prediction));

    await replicateSubmit(apiKey, "owner/model:abc123def456", { prompt: "test" });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.version).toBe("abc123def456");
    expect(body.model).toBeUndefined();
  });

  it("sends model field for unversioned model IDs (owner/name, no colon)", async () => {
    const prediction = makePrediction("succeeded", "https://replicate.com/output.png");
    mockFetch.mockResolvedValueOnce(mockJsonResponse(prediction));

    await replicateSubmit(apiKey, "owner/model", { prompt: "test" });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("owner/model");
    expect(body.version).toBeUndefined();
  });

  it("includes Prefer: wait header in submit request", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(makePrediction("succeeded"))
    );

    await replicateSubmit(apiKey, "owner/model", {});

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Prefer"]).toBe("wait");
  });

  it("passes input to request body", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(makePrediction("succeeded"))
    );

    const input = { prompt: "a cat", num_outputs: 2, seed: 42 };
    await replicateSubmit(apiKey, "owner/model:hash", input);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.input).toEqual(input);
  });

  it("uses Bearer token for Authorization", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(makePrediction("succeeded"))
    );

    await replicateSubmit(apiKey, "owner/model", {});

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${apiKey}`
    );
  });

  it("returns prediction immediately when already succeeded on first response", async () => {
    const prediction = makePrediction("succeeded", "https://cdn.example.com/img.png");
    mockFetch.mockResolvedValueOnce(mockJsonResponse(prediction));

    const result = await replicateSubmit(apiKey, "owner/model:hash", { prompt: "a" });

    expect(result.status).toBe("succeeded");
    expect(result.output).toBe("https://cdn.example.com/img.png");
    // No polling — only one fetch call
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("polls until prediction succeeds", async () => {
    vi.useFakeTimers();
    const starting = makePrediction("starting");
    const processing = makePrediction("processing");
    const succeeded = makePrediction("succeeded", "https://cdn.example.com/img.png");

    mockFetch
      .mockResolvedValueOnce(mockJsonResponse(starting))    // submit
      .mockResolvedValueOnce(mockJsonResponse(processing))  // poll 1
      .mockResolvedValueOnce(mockJsonResponse(succeeded));  // poll 2

    const promise = replicateSubmit(apiKey, "owner/model:hash", { prompt: "a" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe("succeeded");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws when prediction fails immediately", async () => {
    const failed = makePrediction("failed", null, "CUDA out of memory");
    mockFetch.mockResolvedValueOnce(mockJsonResponse(failed));

    await expect(
      replicateSubmit(apiKey, "owner/model:hash", {})
    ).rejects.toThrow("Replicate prediction failed: CUDA out of memory");
  });

  it("throws when prediction fails during polling", async () => {
    vi.useFakeTimers();
    const starting = makePrediction("starting");
    const failed = makePrediction("failed", null, "Model crashed");

    mockFetch
      .mockResolvedValueOnce(mockJsonResponse(starting))
      .mockResolvedValueOnce(mockJsonResponse(failed));

    await expectPollingRejection(
      replicateSubmit(apiKey, "owner/model:hash", {}),
      "Replicate prediction failed: Model crashed"
    );
  });

  it("returns canceled prediction without throwing", async () => {
    vi.useFakeTimers();
    const starting = makePrediction("starting");
    const canceled = makePrediction("canceled");

    mockFetch
      .mockResolvedValueOnce(mockJsonResponse(starting))
      .mockResolvedValueOnce(mockJsonResponse(canceled));

    const promise = replicateSubmit(apiKey, "owner/model:hash", {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe("canceled");
  });

  it("throws on HTTP error from submit endpoint", async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(422, "Invalid input"));

    await expect(
      replicateSubmit(apiKey, "owner/model:hash", { prompt: "a" })
    ).rejects.toThrow("Replicate API error 422: Invalid input");
  });

  it("throws on HTTP error from poll endpoint", async () => {
    vi.useFakeTimers();
    const starting = makePrediction("starting");

    mockFetch
      .mockResolvedValueOnce(mockJsonResponse(starting))
      .mockResolvedValueOnce(mockErrorResponse(500, "Internal Server Error"));

    await expectPollingRejection(
      replicateSubmit(apiKey, "owner/model:hash", {}),
      "Replicate poll error 500: Internal Server Error"
    );
  });

  it("uses the poll URL from prediction.urls.get when polling", async () => {
    vi.useFakeTimers();
    const starting = makePrediction("starting");
    const succeeded = makePrediction("succeeded");

    mockFetch
      .mockResolvedValueOnce(mockJsonResponse(starting))
      .mockResolvedValueOnce(mockJsonResponse(succeeded));

    const promise = replicateSubmit(apiKey, "owner/model:hash", {});
    await vi.runAllTimersAsync();
    await promise;

    // Second call should hit the predictions/{id} endpoint
    const [pollUrl] = mockFetch.mock.calls[1] as [string];
    expect(pollUrl).toContain(`/predictions/${starting.id}`);
  });
});

/* ================================================================== */
/*  assetToUrl — upload paths (with apiKey)                            */
/* ================================================================== */

describe("assetToUrl with apiKey (upload paths)", () => {
  const apiKey = "test-key";

  it("uploads external HTTPS URL to Replicate and returns hosted URL", async () => {
    // fetch the source URL
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: { get: () => "image/png" },
    } as unknown as Response);
    // upload to Replicate files API
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        urls: { get: "https://replicate.delivery/files/abc.png" },
      }),
    } as unknown as Response);

    const url = await assetToUrl(
      { uri: "https://external.example.com/photo.png" },
      apiKey
    );
    expect(url).toBe("https://replicate.delivery/files/abc.png");
  });

  it("falls back to direct URL when Replicate upload fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: { get: () => "image/png" },
    } as unknown as Response);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as unknown as Response);

    const url = await assetToUrl(
      { uri: "https://external.example.com/photo.png" },
      apiKey
    );
    expect(url).toBe("https://external.example.com/photo.png");
  });

  it("uploads local path (starts with /) to Replicate via localhost", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
      headers: { get: () => "image/jpeg" },
    } as unknown as Response);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        urls: { get: "https://replicate.delivery/files/local.jpg" },
      }),
    } as unknown as Response);

    const url = await assetToUrl({ uri: "/api/storage/asset123.png" }, apiKey);
    expect(url).toBe("https://replicate.delivery/files/local.jpg");

    // Confirm it resolved to localhost URL first
    const [sourceUrl] = mockFetch.mock.calls[0] as [string];
    expect(sourceUrl).toMatch(/^http:\/\/127\.0\.0\.1/);
    expect(sourceUrl).toContain("/api/storage/asset123.png");
  });

  it("returns external URL directly when no apiKey is provided", async () => {
    const url = await assetToUrl({ uri: "https://external.example.com/photo.png" });
    // Without apiKey, upload is skipped — returns the URL as-is
    expect(url).toBe("https://external.example.com/photo.png");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("falls back to direct URL when source fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as unknown as Response);

    const url = await assetToUrl(
      { uri: "https://external.example.com/missing.png" },
      apiKey
    );
    // Source fetch fails → uploadToReplicate throws → fallback to direct URL
    expect(url).toBe("https://external.example.com/missing.png");
  });
});

/* ================================================================== */
/*  registerReplicateNodes                                              */
/* ================================================================== */

describe("registerReplicateNodes", () => {
  it("registers all replicate nodes in the registry", () => {
    const registry = new NodeRegistry();
    registerReplicateNodes(registry);

    const types = registry.list();
    expect(types.length).toBeGreaterThanOrEqual(150);
    for (const nodeType of types) {
      expect(nodeType).toMatch(/^replicate\./);
    }
  });

  it("registered nodes can be looked up by type", () => {
    const registry = new NodeRegistry();
    registerReplicateNodes(registry);

    const types = registry.list();
    const firstType = types[0];
    expect(registry.has(firstType)).toBe(true);
    expect(registry.getClass(firstType)).toBeDefined();
  });

  it("does not register duplicate node types", () => {
    const registry = new NodeRegistry();
    registerReplicateNodes(registry);

    const types = registry.list();
    const uniqueTypes = new Set(types);
    expect(types.length).toBe(uniqueTypes.size);
  });
});
