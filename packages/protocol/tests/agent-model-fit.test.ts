import { describe, expect, it } from "vitest";
import { agentModelFit, isOpenRouterFreeRoute } from "../src/agent-model-fit.js";

describe("agentModelFit", () => {
  it("rejects a model the provider marks as unable to call tools", () => {
    expect(
      agentModelFit({ id: "claude-sonnet-5", provider: "anthropic", supports_tools: false })
    ).toBe("no_tools");
  });

  it("flags OpenRouter free routes", () => {
    expect(
      agentModelFit({ id: "meta-llama/llama-3.3-70b-instruct:free", provider: "openrouter" })
    ).toBe("free_tier");
    expect(isOpenRouterFreeRoute("openrouter", "qwen/qwen3-coder:FREE")).toBe(true);
  });

  it("does not treat a :free suffix on another provider as OpenRouter's free tier", () => {
    expect(agentModelFit({ id: "some-model:free", provider: "ollama" })).toBe("unknown");
  });

  it("marks NodeTool's default agent models, directly and through a router", () => {
    expect(agentModelFit({ id: "claude-sonnet-5", provider: "anthropic" })).toBe("default");
    expect(
      agentModelFit({ id: "anthropic/claude-sonnet-5", provider: "openrouter", supports_tools: true })
    ).toBe("default");
    expect(agentModelFit({ id: "gpt-5.4-mini", provider: "openai" })).toBe("default");
  });

  it("does not match a longer id that only starts with a default id", () => {
    expect(agentModelFit({ id: "gpt-5.4-mini-2026", provider: "openai" })).toBe("unknown");
  });

  it("answers unknown when supports_tools is unset and nothing else applies", () => {
    expect(agentModelFit({ id: "mistral-large", provider: "mistral", supports_tools: null })).toBe("unknown");
  });
});
