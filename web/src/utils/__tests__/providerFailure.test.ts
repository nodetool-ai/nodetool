import {
  pickAlternativeModel,
  summarizeProviderCallFailure,
  summarizeProviderErrorText,
  trailingRepeatCount
} from "../providerFailure";
import type { ProviderCallFailed } from "@nodetool-ai/protocol";

const frame = (overrides: Partial<ProviderCallFailed> = {}): ProviderCallFailed => ({
  type: "provider_call_failed",
  provider: "gemini",
  model: "veo-3.1-generate-preview",
  operation: "textToVideo",
  kind: "quota",
  status: 429,
  message: "quota",
  timestamp: "2026-11-13T10:00:00.000Z",
  ...overrides
});

describe("summarizeProviderErrorText", () => {
  it.each([
    [
      "429 You exceeded your current quota, please check your plan and billing details. insufficient_quota",
      "billing"
    ],
    ["Your credit balance is too low to access the Anthropic API.", "billing"],
    ["402 Insufficient Balance", "billing"],
    [
      "429 Quota exceeded for metric: generate_content_free_tier_requests, limit: 0",
      "quota"
    ],
    ["404 models/gemini-2.5-pro is not found for API version v1beta", "model_unavailable"],
    ["401 Incorrect API key provided", "auth"],
    ["429 Rate limit reached for requests", "rate_limit"],
    ["The socket closed while the turn ran", "other"]
  ])("reads %s as %s", (text, category) => {
    expect(summarizeProviderErrorText(text).category).toBe(category);
  });

  it("reads the failing provider and model from the server's annotation", () => {
    const summary = summarizeProviderErrorText(
      "404 Not Found — gemini/gemini-2.5-pro does not expose this model (404). Pick another model."
    );
    expect(summary).toMatchObject({
      category: "model_unavailable",
      provider: "gemini",
      model: "gemini-2.5-pro",
      switchModel: true
    });
  });

  it("offers no model switch for a burst limit", () => {
    expect(summarizeProviderErrorText("429 Too Many Requests").switchModel).toBe(false);
  });
});

describe("summarizeProviderCallFailure", () => {
  it("trusts the class the server stamped", () => {
    expect(summarizeProviderCallFailure(frame({ kind: "payment" }))).toMatchObject({
      category: "billing",
      provider: "gemini",
      model: "veo-3.1-generate-preview"
    });
  });
});

describe("trailingRepeatCount", () => {
  it("counts the same failure at the end of the list", () => {
    expect(
      trailingRepeatCount([
        frame({ kind: "auth" }),
        frame(),
        frame(),
        frame()
      ])
    ).toBe(3);
  });

  it("stops at a different model", () => {
    expect(trailingRepeatCount([frame(), frame({ model: "veo-3.1-fast-generate-preview" })])).toBe(1);
    expect(trailingRepeatCount([])).toBe(0);
  });
});

describe("pickAlternativeModel", () => {
  const models = [
    { id: "gemini-2.5-pro", provider: "gemini" },
    { id: "gemini-3.1-flash", provider: "gemini" },
    { id: "deepseek-chat", provider: "deepseek" },
    { id: "openrouter/free", provider: "openrouter" }
  ];

  it("leaves the provider after a billing failure, free models first", () => {
    expect(
      pickAlternativeModel(models, {
        category: "billing",
        provider: "gemini",
        model: "gemini-2.5-pro"
      })?.id
    ).toBe("openrouter/free");
  });

  it("stays with the provider when only the model is gone", () => {
    expect(
      pickAlternativeModel(models, {
        category: "model_unavailable",
        provider: "gemini",
        model: "gemini-2.5-pro"
      })?.id
    ).toBe("gemini-3.1-flash");
  });

  it("returns nothing when no other provider is listed", () => {
    expect(
      pickAlternativeModel(models.slice(0, 2), {
        category: "quota",
        provider: "gemini",
        model: "gemini-2.5-pro"
      })
    ).toBeUndefined();
  });
});
