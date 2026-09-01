import type { ProviderCallFailed } from "@nodetool-ai/protocol";
import {
  formatProviderCallFailure,
  formatProviderCallFailures,
  providerCallSummary,
  providerCallTarget
} from "../providerCallReport";

function failure(
  overrides: Partial<ProviderCallFailed> = {}
): ProviderCallFailed {
  return {
    type: "provider_call_failed",
    provider: "openai",
    model: "gpt-5.4-mini",
    operation: "generateMessages",
    kind: "rate_limit",
    status: 429,
    message: "429 Too Many Requests",
    error_name: "RateLimitError",
    request_id: "req_abc123",
    duration_ms: 812,
    request_source: "wire",
    request: { model: "gpt-5.4-mini", prompt: "a red fox" },
    workflow_id: "wf-1",
    job_id: "job-1",
    timestamp: "2026-01-02T03:04:05.000Z",
    ...overrides
  };
}

describe("providerCallTarget / providerCallSummary", () => {
  it("names provider and model", () => {
    expect(providerCallTarget(failure())).toBe("openai/gpt-5.4-mini");
    expect(providerCallSummary(failure())).toBe(
      "openai/gpt-5.4-mini 429 — rate limited or out of quota"
    );
  });

  it("names the provider alone when no model was chosen", () => {
    expect(providerCallTarget(failure({ model: null }))).toBe("openai");
  });
});

describe("formatProviderCallFailure", () => {
  it("carries every field a maintainer asks for", () => {
    const text = formatProviderCallFailure(failure());
    expect(text).toContain("Provider: openai");
    expect(text).toContain("Model: gpt-5.4-mini");
    expect(text).toContain("Operation: generateMessages");
    expect(text).toContain("HTTP status: 429");
    expect(text).toContain("Error class: RateLimitError");
    expect(text).toContain("Provider request id: req_abc123");
    expect(text).toContain("Elapsed: 812 ms");
    expect(text).toContain("Job: job-1");
    expect(text).toContain("429 Too Many Requests");
    expect(text).toContain("a red fox");
  });

  it("omits fields the failure does not carry", () => {
    const text = formatProviderCallFailure(
      failure({ request_id: null, duration_ms: null, request: null })
    );
    expect(text).not.toContain("Provider request id");
    expect(text).not.toContain("Elapsed");
    expect(text).not.toContain("--- Request");
  });

  it("redacts credentials out of the request and the message", () => {
    const text = formatProviderCallFailure(
      failure({
        message: "401 with sk-live-abcdefghijklmnopqr",
        request: { api_key: "sk-live-abcdefghijklmnopqr" }
      })
    );
    expect(text).not.toContain("sk-live-abcdefghijklmnopqr");
  });
});

describe("formatProviderCallFailures", () => {
  it("lists every call, newest first", () => {
    const text = formatProviderCallFailures([
      failure({ provider: "openai" }),
      failure({ provider: "anthropic" })
    ]);
    expect(text).toContain("Failed provider call 1 of 2");
    expect(text).toContain("Failed provider call 2 of 2");
    expect(text.indexOf("anthropic")).toBeLessThan(text.indexOf("openai"));
  });
});
