/**
 * Barrel export tests – verify that all public exports are accessible.
 */

import { describe, it, expect } from "vitest";

describe("runtime barrel exports", () => {
  it("exports context classes and utilities", async () => {
    const mod = await import("../src/index.js");
    expect(mod.ProcessingContext).toBeDefined();
    expect(mod.MemoryCache).toBeDefined();
    expect(mod.InMemoryStorageAdapter).toBeDefined();
    expect(mod.FileStorageAdapter).toBeDefined();
    expect(mod.S3StorageAdapter).toBeDefined();
    expect(mod.resolveWorkspacePath).toBeDefined();
  });

  it("exports provider classes", async () => {
    const mod = await import("../src/index.js");
    expect(mod.BaseProvider).toBeDefined();
    expect(mod.OpenAIProvider).toBeDefined();
    expect(mod.AnthropicProvider).toBeDefined();
    expect(mod.GeminiProvider).toBeDefined();
    expect(mod.LlamaProvider).toBeDefined();
    expect(mod.OllamaProvider).toBeDefined();
    expect(mod.AkiProvider).toBeDefined();
    expect(mod.FakeProvider).toBeDefined();
  });

  it("exports provider registry functions", async () => {
    const mod = await import("../src/index.js");
    expect(mod.registerProvider).toBeDefined();
    expect(mod.getRegisteredProvider).toBeDefined();
    expect(mod.getProvider).toBeDefined();
    expect(mod.clearProviderCache).toBeDefined();
    expect(mod.listRegisteredProviderIds).toBeDefined();
  });

  it("exports cost calculator", async () => {
    const mod = await import("../src/index.js");
    expect(mod.CostCalculator).toBeDefined();
    expect(mod.CostType).toBeDefined();
    expect(mod.calculateChatCost).toBeDefined();
    expect(mod.calculateEmbeddingCost).toBeDefined();
    expect(mod.calculateSpeechCost).toBeDefined();
    expect(mod.calculateWhisperCost).toBeDefined();
    expect(mod.calculateImageCost).toBeDefined();
  });

  it("exports fake provider utilities", async () => {
    const mod = await import("../src/index.js");
    expect(mod.createFakeToolCall).toBeDefined();
    expect(mod.createSimpleFakeProvider).toBeDefined();
    expect(mod.createStreamingFakeProvider).toBeDefined();
    expect(mod.createToolCallingFakeProvider).toBeDefined();
  });
});

describe("providers barrel exports", () => {
  it("exports all providers from providers/index", async () => {
    const mod = await import("../src/providers/index.js");
    expect(mod.BaseProvider).toBeDefined();
    expect(mod.OpenAIProvider).toBeDefined();
    expect(mod.AnthropicProvider).toBeDefined();
    expect(mod.GeminiProvider).toBeDefined();
    expect(mod.LlamaProvider).toBeDefined();
    expect(mod.OllamaProvider).toBeDefined();
    expect(mod.AkiProvider).toBeDefined();
    expect(mod.FakeProvider).toBeDefined();
  });
});
