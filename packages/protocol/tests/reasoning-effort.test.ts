import { describe, expect, it } from "vitest";
import {
  isReasoningEffort,
  supportsReasoningEffort
} from "../src/reasoning-effort.js";

describe("supportsReasoningEffort", () => {
  it.each([
    ["anthropic", "claude-opus-5-5", true],
    ["anthropic", "claude-sonnet-5-5", true],
    ["anthropic", "claude-haiku-5-5", true],
    ["anthropic", "claude-fable-5-1", true],
    ["anthropic", "claude-opus-4-8", true],
    ["anthropic", "claude-opus-4-6", true],
    ["anthropic", "claude-sonnet-4-6", true],
    ["anthropic", "claude-opus-4-5-20251101", true],
    ["anthropic", "claude-sonnet-4-5", false],
    ["anthropic", "claude-haiku-4-5", false],
    ["anthropic", "claude-opus-4-20250514", false],
    ["anthropic", "claude-3-7-sonnet-latest", false],
    ["claude_agent_sdk", "sonnet", true],
    ["antigravity", "gemini-3.5-flash", true],
    ["openai", "gpt-5.2", true],
    ["openai", "gpt-5-mini", true],
    ["openai", "gpt-5-chat-latest", false],
    ["openai", "gpt-4o", false],
    ["gemini", "gemini-2.5-pro", true],
    ["gemini", "models/gemini-3.5-flash", true],
    ["gemini", "gemini-3-pro-image", false],
    ["gemini", "gemini-2.5-flash-preview-tts", false],
    ["gemini", "gemini-2.0-flash", false],
    ["openrouter", "openai/gpt-5", false],
    ["ollama", "qwen3", false]
  ])("%s %s -> %s", (provider, model, expected) => {
    expect(supportsReasoningEffort(provider, model)).toBe(expected);
  });

  it("is false without a provider or model", () => {
    expect(supportsReasoningEffort(null, "gpt-5")).toBe(false);
    expect(supportsReasoningEffort("openai", "")).toBe(false);
    expect(supportsReasoningEffort("openai", undefined)).toBe(false);
  });
});

describe("isReasoningEffort", () => {
  it("accepts only the composer levels", () => {
    expect(isReasoningEffort("medium")).toBe(true);
    expect(isReasoningEffort("max")).toBe(false);
    expect(isReasoningEffort(null)).toBe(false);
  });
});
