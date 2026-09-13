import { describe, expect, it, vi } from "vitest";
import {
  createFalQueueOperations,
  falSubmitAndWait
} from "../../src/providers/fal-queue.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("FAL explicit queue adapter", () => {
  it("submits once, binds the returned id, then fetches the result after completion", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          request_id: "req-1",
          status_url: "https://provider.invalid/status",
          response_url: "https://provider.invalid/result"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: "IN_QUEUE", request_id: "req-1" })
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: "COMPLETED", request_id: "req-1" })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: { images: [{ url: "https://fal.media/out.png" }] }
        })
      );
    const operations = createFalQueueOperations({
      apiKey: "secret",
      fetchFn,
      pollIntervalMs: 0
    });

    const result = await falSubmitAndWait(operations, {
      endpoint: "fal-ai/flux/dev",
      input: { prompt: "sunset" },
      webhookUrl: "https://app.example.test/api/providers/fal/webhook/token"
    });

    expect(result.requestId).toBe("req-1");
    expect(result.data.images).toBeDefined();
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(fetchFn.mock.calls[0]?.[0]?.toString()).toContain(
      "fal_webhook=https%3A%2F%2Fapp.example.test%2Fapi%2Fproviders%2Ffal%2Fwebhook%2Ftoken"
    );
    expect(fetchFn.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchFn.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: "GET" })
    );
    expect(fetchFn.mock.calls[1]?.[0]?.toString()).toBe(
      "https://queue.fal.run/fal-ai/flux/requests/req-1/status"
    );
  });

  it("uses the application path for namespaced queue status URLs", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ request_id: "req-ns" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "COMPLETED", request_id: "req-ns" })
      )
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));
    const operations = createFalQueueOperations({
      apiKey: "secret",
      fetchFn,
      pollIntervalMs: 0
    });

    await falSubmitAndWait(operations, {
      endpoint: "workflows/owner/app/path",
      input: {}
    });
    expect(fetchFn.mock.calls[0]?.[0]?.toString()).toBe(
      "https://queue.fal.run/workflows/owner/app/path"
    );
    expect(fetchFn.mock.calls[1]?.[0]?.toString()).toBe(
      "https://queue.fal.run/workflows/owner/app/requests/req-ns/status"
    );
  });

  it("normalizes repeated boundary slashes without a regular expression", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ request_id: "req-slashes" }));
    const operations = createFalQueueOperations({ apiKey: "secret", fetchFn });
    const slashes = "/".repeat(4096);

    const submission = await operations.submit({
      endpoint: `${slashes}fal-ai/flux/dev${slashes}`,
      input: {}
    });

    expect(submission.endpoint).toBe("fal-ai/flux/dev");
    expect(fetchFn.mock.calls[0]?.[0]?.toString()).toBe(
      "https://queue.fal.run/fal-ai/flux/dev"
    );
  });

  it("does not retry a failed submission POST", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: "unavailable" }, 503));
    const operations = createFalQueueOperations({ apiKey: "secret", fetchFn });

    await expect(
      operations.submit({ endpoint: "fal-ai/flux/dev", input: { prompt: "x" } })
    ).rejects.toThrow("HTTP 503");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not treat COMPLETED status as success when result retrieval is empty", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ request_id: "req-2" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "COMPLETED", request_id: "req-2" })
      )
      .mockResolvedValueOnce(jsonResponse({ data: null }));
    const operations = createFalQueueOperations({
      apiKey: "secret",
      fetchFn,
      pollIntervalMs: 0
    });

    await expect(
      falSubmitAndWait(operations, { endpoint: "fal-ai/flux/dev", input: {} })
    ).rejects.toThrow("did not contain a JSON object payload");
  });

  it("normalizes a completed queue status carrying an error as failure", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ request_id: "req-error" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "COMPLETED",
          request_id: "req-error",
          error: "model failed"
        })
      );
    const operations = createFalQueueOperations({
      apiKey: "secret",
      fetchFn,
      pollIntervalMs: 0
    });

    await expect(
      falSubmitAndWait(operations, { endpoint: "fal-ai/flux/dev", input: {} })
    ).rejects.toThrow("did not succeed");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("aborting a waiter does not issue a remote cancellation", async () => {
    const controller = new AbortController();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ request_id: "req-3" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "IN_PROGRESS", request_id: "req-3" })
      );
    const operations = createFalQueueOperations({
      apiKey: "secret",
      fetchFn,
      pollIntervalMs: 1000
    });
    const pending = falSubmitAndWait(
      operations,
      { endpoint: "fal-ai/flux/dev", input: {} },
      { signal: controller.signal }
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls.some((call) => call[1]?.method === "PUT")).toBe(
      false
    );
  });
});
