/**
 * @jest-environment node
 */
import { rankModels } from "../modelRanking";
import type { ModelSelectorModel } from "../../stores/ModelMenuStore";

const m = (
  provider: string,
  id: string,
  name: string,
  path?: string
): ModelSelectorModel => ({ type: "image", provider, id, name, path });

const models: ModelSelectorModel[] = [
  m("openai", "gpt-4", "GPT-4"),
  m("openai", "gpt-3.5-turbo", "GPT-3.5 Turbo"),
  m("anthropic", "claude-3-opus", "Claude 3 Opus"),
  m("anthropic", "claude-3-sonnet", "Claude 3 Sonnet"),
  m("google", "gemini-1.5-pro", "Gemini 1.5 Pro"),
  m("huggingface", "sdxl", "Stable Diffusion XL", "stabilityai/stable-diffusion-xl-base-1.0")
];

const keyOf = (model: ModelSelectorModel) => `${model.provider}:${model.id}`;

describe("rankModels", () => {
  it("returns empty for undefined or empty input", () => {
    expect(rankModels(undefined, "")).toEqual([]);
    expect(rankModels([], "anything")).toEqual([]);
  });

  it("returns all enabled models alphabetically when no term, no preferences", () => {
    const result = rankModels(models, "");
    const names = result.map((r) => r.path || r.name);
    const sorted = [...names].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    expect(names).toEqual(sorted);
    expect(result).toHaveLength(models.length);
  });

  it("excludes models from disabled providers", () => {
    const result = rankModels(models, "", {
      enabledProviders: { openai: false }
    });
    expect(result.every((r) => r.provider !== "openai")).toBe(true);
    expect(result.some((r) => r.provider === "anthropic")).toBe(true);
  });

  it("filters by selected provider regardless of enabled flag", () => {
    const result = rankModels(models, "", {
      selectedProvider: "openai",
      enabledProviders: { openai: false }
    });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.provider === "openai")).toBe(true);
  });

  it("treats the gemini sidebar entry as gemini OR google", () => {
    const withGemini = m("gemini", "gemini-flash", "Gemini Flash");
    const result = rankModels([...models, withGemini], "", {
      selectedProvider: "gemini"
    });
    const providers = new Set(result.map((r) => r.provider));
    expect(providers).toContain("google");
    expect(providers).toContain("gemini");
  });

  it("matches by name", () => {
    const result = rankModels(models, "claude");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].provider).toBe("anthropic");
  });

  it("matches by id", () => {
    const result = rankModels(models, "gpt-4");
    expect(result.some((r) => r.id === "gpt-4")).toBe(true);
  });

  it("matches by HF path", () => {
    const result = rankModels(models, "stabilityai");
    expect(result.some((r) => r.id === "sdxl")).toBe(true);
  });

  it("is case-insensitive", () => {
    const upper = rankModels(models, "CLAUDE");
    const lower = rankModels(models, "claude");
    expect(upper.map(keyOf)).toEqual(lower.map(keyOf));
  });

  it("handles multi-token queries (all tokens must match somewhere)", () => {
    const result = rankModels(models, "gpt turbo");
    // "gpt-3.5-turbo" hits on id (gpt + turbo) and name (GPT-3.5 Turbo)
    expect(result.some((r) => r.id === "gpt-3.5-turbo")).toBe(true);
  });

  it("returns empty for non-matching query", () => {
    expect(rankModels(models, "definitely-not-a-model")).toEqual([]);
  });

  it("ranks favorites above other matches", () => {
    const favoriteKeys = new Set([keyOf(models[3])]); // claude-3-sonnet
    const result = rankModels(models, "claude", { favoriteKeys });
    expect(result[0].id).toBe("claude-3-sonnet");
  });

  it("ranks recents above other matches when scores would otherwise tie", () => {
    const result = rankModels(models, "claude", {
      recentKeys: [keyOf(models[3])] // claude-3-sonnet was used most recently
    });
    expect(result[0].id).toBe("claude-3-sonnet");
  });

  it("more-recent items rank higher than less-recent items", () => {
    const result = rankModels(models, "", {
      recentKeys: [
        keyOf(models[5]), // sdxl — most recent
        keyOf(models[0]) // gpt-4 — less recent
      ]
    });
    expect(result[0].id).toBe("sdxl");
    expect(result[1].id).toBe("gpt-4");
  });

  it("puts a recommended model before an alphabetically earlier one when the query is empty", () => {
    // With no history and no prior, "Claude 3 Opus" leads on display name.
    const plain = rankModels(models, "");
    expect(plain[0].id).toBe("claude-3-opus");

    const result = rankModels(models, "", {
      recommendedKeys: [keyOf(models[0])] // openai:gpt-4
    });
    expect(result[0].id).toBe("gpt-4");
    // Everything else keeps the alphabetical order it had.
    expect(result.slice(1).map(keyOf)).toEqual(
      plain.filter((m) => m.id !== "gpt-4").map(keyOf)
    );
  });

  it("keeps favorites and recents ahead of a recommended model", () => {
    const result = rankModels(models, "", {
      favoriteKeys: new Set([keyOf(models[2])]), // anthropic:claude-3-opus
      recentKeys: [keyOf(models[5])], // huggingface:sdxl
      recommendedKeys: [keyOf(models[0])] // openai:gpt-4
    });
    expect(result.slice(0, 3).map((m) => m.id)).toEqual([
      "sdxl",
      "claude-3-opus",
      "gpt-4"
    ]);
  });

  it("leaves a non-empty query unchanged by the recommended prior", () => {
    const withPrior = rankModels(models, "claude", {
      recommendedKeys: [keyOf(models[3])] // anthropic:claude-3-sonnet
    });
    const withoutPrior = rankModels(models, "claude");
    expect(withPrior.map(keyOf)).toEqual(withoutPrior.map(keyOf));
  });
});
