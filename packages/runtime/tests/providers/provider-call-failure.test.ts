/**
 * The `provider_call_failed` record a surface reports with. What matters is
 * that the fields a maintainer asks for — status, failure class, provider
 * request id, elapsed — survive, that a cancelled call produces nothing, and
 * that no credential rides along in the request.
 */
import { describe, it, expect } from "vitest";
import {
  buildProviderCallFailure,
  providerFailureKind,
  providerRequestId
} from "../../src/providers/provider-call-failure.js";

function httpError(status: number, message = "upstream said no"): Error {
  return Object.assign(new Error(message), { status });
}

describe("providerFailureKind", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [402, "payment"],
    [404, "not_found"],
    [429, "rate_limit"],
    [408, "timeout"],
    [504, "timeout"],
    [500, "server"],
    [503, "server"],
    [422, "client"]
  ])("classifies %i as %s", (status, kind) => {
    expect(providerFailureKind(httpError(status))).toBe(kind);
  });

  it("classifies a dropped connection as a network failure", () => {
    expect(
      providerFailureKind(Object.assign(new Error("boom"), { code: "ECONNRESET" }))
    ).toBe("network");
    expect(providerFailureKind(new Error("fetch failed"))).toBe("network");
  });

  it("reads a status out of the message when the error carries no field", () => {
    expect(providerFailureKind(new Error("429 Too Many Requests"))).toBe(
      "rate_limit"
    );
  });

  it("says unknown rather than guessing", () => {
    expect(providerFailureKind(new Error("something went sideways"))).toBe(
      "unknown"
    );
  });
});

describe("providerRequestId", () => {
  it("reads the id under any of the names the SDKs use", () => {
    expect(
      providerRequestId(Object.assign(new Error("x"), { request_id: "req_1" }))
    ).toBe("req_1");
    expect(
      providerRequestId(Object.assign(new Error("x"), { requestID: "req_2" }))
    ).toBe("req_2");
    expect(
      providerRequestId(
        Object.assign(new Error("x"), { headers: { "x-request-id": "req_3" } })
      )
    ).toBe("req_3");
  });

  it("is null when the error carries none", () => {
    expect(providerRequestId(new Error("x"))).toBeNull();
  });
});

describe("buildProviderCallFailure", () => {
  const base = {
    provider: "openai",
    model: "gpt-5.4-mini",
    operation: "generateMessages"
  };

  it("carries the whole call", () => {
    const error = Object.assign(new Error("429 slow down"), {
      status: 429,
      name: "RateLimitError",
      request_id: "req_abc"
    });
    const failure = buildProviderCallFailure(
      {
        ...base,
        error,
        request: { model: "gpt-5.4-mini", messages: [] },
        startedAt: Date.now() - 50
      },
      new Date("2026-01-02T03:04:05.000Z")
    );

    expect(failure).not.toBeNull();
    expect(failure).toMatchObject({
      type: "provider_call_failed",
      provider: "openai",
      model: "gpt-5.4-mini",
      operation: "generateMessages",
      kind: "rate_limit",
      status: 429,
      error_name: "RateLimitError",
      request_id: "req_abc",
      request_source: "wire",
      timestamp: "2026-01-02T03:04:05.000Z"
    });
    expect(failure?.message).toContain("slow down");
    expect(failure?.duration_ms).toBeGreaterThanOrEqual(50);
  });

  it("reports nothing for a cancelled call", () => {
    const aborted = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(buildProviderCallFailure({ ...base, error: aborted })).toBeNull();
  });

  it("redacts credentials out of the reported request", () => {
    const failure = buildProviderCallFailure({
      ...base,
      error: httpError(401),
      request: { api_key: "sk-live-abcdefghijklmnop", prompt: "a red fox" }
    });
    expect(JSON.stringify(failure?.request)).not.toContain(
      "sk-live-abcdefghijklmnop"
    );
    expect(JSON.stringify(failure?.request)).toContain("a red fox");
  });

  it("marks the NodeTool args when no wire payload was recorded", () => {
    const failure = buildProviderCallFailure({
      ...base,
      error: httpError(500),
      nodetoolArgs: { model: "gpt-5.4-mini" }
    });
    expect(failure?.request_source).toBe("nodetool-args");
  });

  it("drops the placeholder model id rather than naming a model called unknown", () => {
    const failure = buildProviderCallFailure({
      provider: "fal_ai",
      model: "unknown",
      operation: "textToImage",
      error: httpError(500)
    });
    expect(failure?.model).toBeNull();
  });
});
