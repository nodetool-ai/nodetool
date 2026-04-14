/**
 * Unit tests for ClaudeAgentProvider error classification.
 *
 * These tests exercise only the pure error-classification logic and do not
 * require the @anthropic-ai/claude-agent-sdk package or the Claude CLI to
 * be installed. E2E tests live in claude-agent-e2e.test.ts.
 */

import { describe, it, expect } from "vitest";
import {
  ClaudeAgentError,
  classifyClaudeAgentError
} from "../../src/providers/claude-agent-provider.js";

describe("classifyClaudeAgentError", () => {
  it("detects missing SDK package", () => {
    const raw = new Error(
      "Cannot find module '@anthropic-ai/claude-agent-sdk' from 'x.js'"
    );
    const err = classifyClaudeAgentError(raw);
    expect(err).toBeInstanceOf(ClaudeAgentError);
    expect(err.kind).toBe("sdk_not_installed");
    expect(err.message).toMatch(/npm install @anthropic-ai\/claude-agent-sdk/);
    expect(err.cause).toBe(raw);
  });

  it("detects missing Claude CLI (ENOENT)", () => {
    const raw = new Error("spawn claude ENOENT");
    const err = classifyClaudeAgentError(raw);
    expect(err.kind).toBe("cli_not_found");
    expect(err.message).toMatch(/Claude Code CLI not found/);
    expect(err.message).toMatch(/claude login/);
  });

  it("detects running as root", () => {
    const raw = new Error(
      "--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons"
    );
    const err = classifyClaudeAgentError(raw);
    expect(err.kind).toBe("running_as_root");
    expect(err.message).toMatch(/non-root user/);
  });

  it("detects authentication failures (401)", () => {
    const raw = new Error("Request failed with status 401 Unauthorized");
    const err = classifyClaudeAgentError(raw);
    expect(err.kind).toBe("auth");
    expect(err.message).toMatch(/claude login/);
  });

  it("detects authentication failures (not logged in)", () => {
    const raw = new Error("You are not logged in to Claude");
    const err = classifyClaudeAgentError(raw);
    expect(err.kind).toBe("auth");
  });

  it("detects rate limits", () => {
    const raw = new Error("429 Too Many Requests: rate limit exceeded");
    const err = classifyClaudeAgentError(raw);
    expect(err.kind).toBe("rate_limit");
    expect(err.message).toMatch(/rate limit/i);
  });

  it("detects context length errors", () => {
    const raw = new Error("prompt is too long: exceeds maximum context window");
    const err = classifyClaudeAgentError(raw);
    expect(err.kind).toBe("context_length");
    expect(err.message).toMatch(/context window/);
  });

  it("detects invalid model errors", () => {
    const raw = new Error("model claude-xyz-999 not found");
    const err = classifyClaudeAgentError(raw);
    expect(err.kind).toBe("invalid_model");
  });

  it("detects aborted requests", () => {
    const raw = new Error("The operation was aborted");
    const err = classifyClaudeAgentError(raw);
    expect(err.kind).toBe("aborted");
  });

  it("falls back to 'unknown' for unrecognised errors", () => {
    const raw = new Error("weird internal failure xyz");
    const err = classifyClaudeAgentError(raw);
    expect(err.kind).toBe("unknown");
    expect(err.message).toMatch(/Claude Agent provider error/);
    expect(err.message).toMatch(/weird internal failure xyz/);
  });

  it("passes through an existing ClaudeAgentError unchanged", () => {
    const original = new ClaudeAgentError("auth", "already classified");
    const err = classifyClaudeAgentError(original);
    expect(err).toBe(original);
  });

  it("handles non-Error values", () => {
    const err = classifyClaudeAgentError("string error");
    expect(err).toBeInstanceOf(ClaudeAgentError);
    expect(err.kind).toBe("unknown");
    expect(err.message).toMatch(/string error/);
  });
});

describe("ClaudeAgentError", () => {
  it("stores kind and message", () => {
    const err = new ClaudeAgentError("auth", "nope");
    expect(err.name).toBe("ClaudeAgentError");
    expect(err.kind).toBe("auth");
    expect(err.message).toBe("nope");
  });

  it("preserves cause when provided", () => {
    const cause = new Error("root cause");
    const err = new ClaudeAgentError("unknown", "wrapper", cause);
    expect(err.cause).toBe(cause);
  });

  it("is an instance of Error", () => {
    const err = new ClaudeAgentError("auth", "x");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ClaudeAgentError);
  });
});
