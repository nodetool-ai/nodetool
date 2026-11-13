import { describe, expect, it } from "vitest";
import {
  isReasoningEffort,
  reasoningEffortLevels,
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
    ["gemini", "gemini-4-hydrogen", true],
    ["gemini_vertex", "gemini-4-argon", true],
    ["gemini", "gemini-4-hydrogen-tts", false],
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

describe("reasoningEffortLevels", () => {
  it("offers xhigh only on models that take it", () => {
    expect(reasoningEffortLevels("gemini", "gemini-4-hydrogen")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh"
    ]);
    expect(reasoningEffortLevels("gemini_vertex", "gemini-4-hydrogen")).toContain(
      "xhigh"
    );
    for (const [provider, model] of [
      ["gemini", "gemini-4-argon"],
      ["gemini", "gemini-3.8-flash"],
      ["gemini", "gemini-2.5-pro"],
      ["anthropic", "claude-opus-5-5"],
      ["openai", "gpt-5.2"]
    ]) {
      expect(reasoningEffortLevels(provider, model)).toEqual([
        "low",
        "medium",
        "high"
      ]);
    }
  });

  it("is empty for a model that takes no level", () => {
    expect(reasoningEffortLevels("gemini", "gemini-2.0-flash")).toEqual([]);
    expect(reasoningEffortLevels("ollama", "qwen3")).toEqual([]);
    expect(reasoningEffortLevels(null, "gemini-4-hydrogen")).toEqual([]);
  });
});

describe("isReasoningEffort", () => {
  it("accepts only the composer levels", () => {
    expect(isReasoningEffort("medium")).toBe(true);
    expect(isReasoningEffort("xhigh")).toBe(true);
    expect(isReasoningEffort("max")).toBe(false);
    expect(isReasoningEffort(null)).toBe(false);
  });
});
