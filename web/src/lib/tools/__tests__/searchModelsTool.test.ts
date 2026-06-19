/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import "../builtin/searchModels";

const mockQuery = jest.fn();

jest.mock("../../trpc", () => ({
  trpc: {
    models: {
      availableForKind: {
        query: (...args: unknown[]) => mockQuery(...args),
      },
    },
  },
}));

describe("ui_search_models tool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns models for a given kind", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: "gpt-4o", name: "GPT-4o", provider: "openai", type: "language_model" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet", provider: "anthropic", type: "language_model" },
    ]);

    const result = await FrontendToolRegistry.call(
      "ui_search_models",
      { kind: "text_generation" },
      "tc-1",
      { getState: () => ({}) as never }
    );

    const typed = result as { ok: boolean; kind: string; count: number; models: unknown[] };
    expect(typed.ok).toBe(true);
    expect(typed.kind).toBe("text_generation");
    expect(typed.count).toBe(2);
    expect(typed.models).toHaveLength(2);
    expect(mockQuery).toHaveBeenCalledWith({ kind: "text_generation" });
  });

  it("respects the limit parameter", async () => {
    const models = Array.from({ length: 30 }, (_, i) => ({
      id: `model-${i}`,
      name: `Model ${i}`,
      provider: "test",
    }));
    mockQuery.mockResolvedValueOnce(models);

    const result = await FrontendToolRegistry.call(
      "ui_search_models",
      { kind: "text_generation", limit: 5 },
      "tc-2",
      { getState: () => ({}) as never }
    );

    const typed = result as { count: number; models: unknown[] };
    expect(typed.count).toBe(5);
    expect(typed.models).toHaveLength(5);
  });

  it("handles empty results", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await FrontendToolRegistry.call(
      "ui_search_models",
      { kind: "text_to_video" },
      "tc-3",
      { getState: () => ({}) as never }
    );

    const typed = result as { ok: boolean; count: number; models: unknown[] };
    expect(typed.ok).toBe(true);
    expect(typed.count).toBe(0);
    expect(typed.models).toHaveLength(0);
  });

  it("handles null response", async () => {
    mockQuery.mockResolvedValueOnce(null);

    const result = await FrontendToolRegistry.call(
      "ui_search_models",
      { kind: "text_to_speech" },
      "tc-4",
      { getState: () => ({}) as never }
    );

    const typed = result as { ok: boolean; count: number; models: unknown[] };
    expect(typed.ok).toBe(true);
    expect(typed.count).toBe(0);
  });

  it("normalizes model fields with fallbacks", async () => {
    mockQuery.mockResolvedValueOnce([
      { repo_id: "org/model", description: "A model" },
    ]);

    const result = await FrontendToolRegistry.call(
      "ui_search_models",
      { kind: "text_generation" },
      "tc-5",
      { getState: () => ({}) as never }
    );

    const typed = result as { models: Array<Record<string, unknown>> };
    const model = typed.models[0];
    expect(model.id).toBe("org/model");
    expect(model.name).toBe("org/model");
    expect(model.repo_id).toBe("org/model");
    expect(model.provider).toBeNull();
    expect(model.type).toBeNull();
    expect(model.description).toBe("A model");
  });

  it("includes usage guidance in result", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await FrontendToolRegistry.call(
      "ui_search_models",
      { kind: "text_to_image" },
      "tc-6",
      { getState: () => ({}) as never }
    );

    const typed = result as { usage: string };
    expect(typed.usage).toContain("ui_update_node_data");
  });

  it("defaults limit to 20 when not provided", async () => {
    const models = Array.from({ length: 25 }, (_, i) => ({
      id: `model-${i}`,
      name: `Model ${i}`,
      provider: "test",
    }));
    mockQuery.mockResolvedValueOnce(models);

    const result = await FrontendToolRegistry.call(
      "ui_search_models",
      { kind: "text_generation" },
      "tc-7",
      { getState: () => ({}) as never }
    );

    const typed = result as { count: number };
    expect(typed.count).toBe(20);
  });

  it("works with text_to_image kind", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: "flux-pro", name: "FLUX Pro", provider: "fal" },
    ]);

    const result = await FrontendToolRegistry.call(
      "ui_search_models",
      { kind: "text_to_image", limit: 10 },
      "tc-8",
      { getState: () => ({}) as never }
    );

    const typed = result as { ok: boolean; kind: string; models: Array<Record<string, unknown>> };
    expect(typed.ok).toBe(true);
    expect(typed.kind).toBe("text_to_image");
    expect(typed.models[0].id).toBe("flux-pro");
    expect(typed.models[0].downloaded).toBeNull();
    expect(typed.models[0].path).toBeNull();
  });
});
