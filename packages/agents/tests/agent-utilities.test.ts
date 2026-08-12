/**
 * Tests for agent utility gaps: T-AG-3, T-AG-7, T-AG-8.
 */
import { describe, it, expect } from "vitest";
import { removeBase64Images } from "../src/utils/remove-base64-images.js";
import { wrapGeneratorsParallel } from "../src/utils/wrap-generators-parallel.js";
import type {
  BaseProvider,
  MessageContent,
  ProcessingContext
} from "@nodetool-ai/runtime";
import {
  UNGATED,
  createCapabilityRun,
  toolForCapabilityName
} from "../src/capabilities/index.js";

// ── T-AG-3 — Model listing tool ─────────────────────────────────────

/** `list_provider_models` over a run carrying the providers map. */
function listProviderModelsTool(providers: Record<string, BaseProvider>) {
  return toolForCapabilityName("list_provider_models", (context) =>
    createCapabilityRun({ context, gate: UNGATED, providers })
  );
}

describe("T-AG-3: list_provider_models", () => {
  it("returns models from a mock provider", async () => {
    const mockProvider = {
      getAvailableLanguageModels: async () => [
        { id: "gpt-4", name: "GPT-4" },
        { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" }
      ]
    };
    const tool = listProviderModelsTool({
      openai: mockProvider as unknown as BaseProvider
    });

    const result = (await tool.process({} as ProcessingContext, {
      provider: "openai"
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const models = result.models as Array<{ id: string }>;
    expect(models.length).toBe(2);
    expect(models[0].id).toBe("gpt-4");
  });

  it("returns error for unknown provider", async () => {
    const tool = listProviderModelsTool({});
    const result = (await tool.process({} as ProcessingContext, {
      provider: "unknown"
    })) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain("unknown");
  });

  it("returns error when provider has no getAvailableLanguageModels", async () => {
    const mockProvider = {};
    const tool = listProviderModelsTool({
      openai: mockProvider as unknown as BaseProvider
    });
    const result = (await tool.process({} as ProcessingContext, {
      provider: "openai"
    })) as Record<string, unknown>;
    expect(result.success).toBe(false);
  });
});

// ── T-AG-7 — removeBase64Images ─────────────────────────────────────

describe("T-AG-7: removeBase64Images", () => {
  it("removes base64 image content blocks", () => {
    const content: MessageContent[] = [
      { type: "text", text: "hello" },
      { type: "image_url", image: { uri: "data:image/png;base64,abc123" } },
      { type: "text", text: "world" }
    ];
    const result = removeBase64Images(content);
    expect(result.length).toBe(2);
    expect(result[0].type).toBe("text");
    expect(result[1].type).toBe("text");
  });

  it("preserves real-URL images", () => {
    const content: MessageContent[] = [
      { type: "text", text: "hello" },
      { type: "image_url", image: { uri: "https://example.com/image.png" } }
    ];
    const result = removeBase64Images(content);
    expect(result.length).toBe(2);
    expect(result[1].type).toBe("image_url");
  });

  it("preserves text content", () => {
    const content: MessageContent[] = [
      { type: "text", text: "hello" },
      { type: "text", text: "world" }
    ];
    const result = removeBase64Images(content);
    expect(result.length).toBe(2);
  });

  it("removes image with base64 data field", () => {
    const content: MessageContent[] = [
      {
        type: "image_url",
        image: { data: "base64string", mimeType: "image/png" }
      }
    ];
    const result = removeBase64Images(content);
    expect(result.length).toBe(0);
  });

  it("returns empty array for empty input", () => {
    expect(removeBase64Images([])).toEqual([]);
  });

  it("preserves audio content", () => {
    const content: MessageContent[] = [
      { type: "audio", audio: { uri: "data:audio/mp3;base64,abc" } }
    ];
    const result = removeBase64Images(content);
    expect(result.length).toBe(1);
  });
});

// ── T-AG-8 — wrapGeneratorsParallel ─────────────────────────────────

describe("T-AG-8: wrapGeneratorsParallel", () => {
  async function* delayedItems<T>(
    items: T[],
    delayMs: number
  ): AsyncGenerator<T> {
    for (const item of items) {
      await new Promise((r) => setTimeout(r, delayMs));
      yield item;
    }
  }

  it("yields items from all generators", async () => {
    const gen1 = delayedItems([1, 2, 3], 10);
    const gen2 = delayedItems([10, 20, 30], 10);
    const result: number[] = [];
    for await (const item of wrapGeneratorsParallel([gen1, gen2])) {
      result.push(item);
    }
    expect(result.sort((a, b) => a - b)).toEqual([1, 2, 3, 10, 20, 30]);
  });

  it("faster generator items arrive first", async () => {
    const fast = delayedItems(["fast1", "fast2"], 5);
    const slow = delayedItems(["slow1"], 100);
    const result: string[] = [];
    for await (const item of wrapGeneratorsParallel([fast, slow])) {
      result.push(item);
    }
    // fast items should arrive before slow
    expect(result.indexOf("fast1")).toBeLessThan(result.indexOf("slow1"));
    expect(result.indexOf("fast2")).toBeLessThan(result.indexOf("slow1"));
    expect(result.length).toBe(3);
  });

  it("handles empty generator list", async () => {
    const result: unknown[] = [];
    for await (const item of wrapGeneratorsParallel([])) {
      result.push(item);
    }
    expect(result).toEqual([]);
  });

  it("handles single generator", async () => {
    const gen = delayedItems([1, 2], 5);
    const result: number[] = [];
    for await (const item of wrapGeneratorsParallel([gen])) {
      result.push(item);
    }
    expect(result).toEqual([1, 2]);
  });
});
