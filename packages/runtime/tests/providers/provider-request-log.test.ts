/**
 * Tests for the central provider-failure request logger: sanitization
 * (truncate / redact / binary / cycle-safe) and the failure-log formatter.
 */

import { describe, it, expect } from "vitest";
import type { Logger } from "@nodetool-ai/config";
import {
  sanitizeForLog,
  logProviderRequestFailure
} from "../../src/providers/provider-request-log.js";

function fakeLogger(): {
  logger: Logger;
  calls: { level: string; msg: string; args: unknown[] }[];
} {
  const calls: { level: string; msg: string; args: unknown[] }[] = [];
  const make =
    (level: string) =>
    (msg: string, ...args: unknown[]) =>
      calls.push({ level, msg, args });
  return {
    logger: {
      debug: make("debug"),
      info: make("info"),
      warn: make("warn"),
      error: make("error")
    },
    calls
  };
}

describe("sanitizeForLog", () => {
  it("truncates long strings and notes the original length", () => {
    const long = "x".repeat(5000);
    const out = sanitizeForLog({ content: long }) as { content: string };
    expect(out.content.length).toBeLessThan(long.length);
    expect(out.content).toContain("truncated");
    expect(out.content).toContain("5000");
  });

  it("redacts secret-bearing keys but keeps token-count fields", () => {
    const out = sanitizeForLog({
      api_key: "sk-123",
      apiKey: "sk-456",
      Authorization: "Bearer abc",
      "x-api-key": "sk-789",
      password: "hunter2",
      max_tokens: 1024,
      max_completion_tokens: 2048
    }) as Record<string, unknown>;
    expect(out.api_key).toBe("[redacted]");
    expect(out.apiKey).toBe("[redacted]");
    expect(out.Authorization).toBe("[redacted]");
    expect(out["x-api-key"]).toBe("[redacted]");
    expect(out.password).toBe("[redacted]");
    // Token-count params must survive — they matter for diagnosing 422s.
    expect(out.max_tokens).toBe(1024);
    expect(out.max_completion_tokens).toBe(2048);
  });

  it("replaces binary buffers with a size marker", () => {
    const out = sanitizeForLog({ image: new Uint8Array([1, 2, 3, 4]) }) as {
      image: string;
    };
    expect(out.image).toBe("[binary 4 bytes]");
  });

  it("is cycle-safe and does not throw on circular references", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(() => sanitizeForLog(a)).not.toThrow();
    const out = sanitizeForLog(a) as Record<string, unknown>;
    expect(out.name).toBe("a");
    expect(out.self).toBe("[circular]");
  });

  it("preserves nested structure, numbers and booleans", () => {
    const input = {
      model: "gpt",
      stream: false,
      nested: { temperature: 0.7, arr: [1, 2, 3] }
    };
    expect(sanitizeForLog(input)).toEqual(input);
  });
});

describe("logProviderRequestFailure", () => {
  it("logs the recorded wire request at error level with provider/model", () => {
    const { logger, calls } = fakeLogger();
    const request = { model: "gpt-5", messages: [{ role: "user", content: "hi" }] };
    logProviderRequestFailure(
      {
        provider: "openai",
        model: "gpt-5",
        request,
        error: new Error("422 Unprocessable Entity")
      },
      logger
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].level).toBe("error");
    const payload = calls[0].args[0] as Record<string, unknown>;
    expect(payload.provider).toBe("openai");
    expect(payload.model).toBe("gpt-5");
    expect(payload.request).toEqual(request);
    expect(payload.requestSource).toBe("wire");
    expect(JSON.stringify(payload)).toContain("422");
  });

  it("includes the HTTP status when present on the error", () => {
    const { logger, calls } = fakeLogger();
    const err = Object.assign(new Error("Unprocessable Entity"), {
      status: 422
    });
    logProviderRequestFailure(
      { provider: "x", model: "m", request: {}, error: err },
      logger
    );
    expect((calls[0].args[0] as Record<string, unknown>).status).toBe(422);
  });

  it("falls back to NodeTool args when no wire payload was recorded", () => {
    const { logger, calls } = fakeLogger();
    logProviderRequestFailure(
      {
        provider: "x",
        model: "m",
        request: undefined,
        nodetoolArgs: { messages: [{ role: "user", content: "hi" }] },
        error: new Error("bad")
      },
      logger
    );
    const payload = calls[0].args[0] as Record<string, unknown>;
    expect(payload.request).toEqual({
      messages: [{ role: "user", content: "hi" }]
    });
    expect(payload.requestSource).toBe("nodetool-args");
  });

  it("skips logging for aborted requests", () => {
    const { logger, calls } = fakeLogger();
    const abortErr = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError"
    });
    logProviderRequestFailure(
      { provider: "x", model: "m", request: {}, error: abortErr },
      logger
    );
    expect(calls).toHaveLength(0);
  });

  it("sanitizes the request payload it logs (redact + truncate)", () => {
    const { logger, calls } = fakeLogger();
    logProviderRequestFailure(
      {
        provider: "x",
        model: "m",
        request: { api_key: "sk-secret", prompt: "y".repeat(5000) },
        error: new Error("e")
      },
      logger
    );
    const req = (calls[0].args[0] as { request: Record<string, unknown> })
      .request;
    expect(req.api_key).toBe("[redacted]");
    expect((req.prompt as string).length).toBeLessThan(5000);
  });
});
