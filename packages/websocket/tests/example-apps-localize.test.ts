import { describe, expect, it, vi } from "vitest";
import type { ApplicationBundle } from "@nodetool-ai/app-runtime";
import { localizeLanguageModels } from "../src/lib/example-apps.js";

vi.mock(import("@nodetool-ai/runtime"), async (importOriginal) => ({
  ...await importOriginal(),
  RECOMMENDED_MODELS: (["openai", "anthropic"] as const).map((provider) => ({
    type: "language_model",
    provider,
    id: `recommended-${provider}`,
    name: `Recommended ${provider}`,
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "language",
    task: "text_generation"
  }))
}));

const model = (provider: string, id: string) => ({
  type: "language_model",
  provider,
  id,
  name: id,
  path: null,
  supported_tasks: []
});

const bundleWith = (value: unknown): ApplicationBundle =>
  ({
    workflows: [
      { graph: { nodes: [{ id: "a", data: { model: value } }], edges: [] } }
    ]
  }) as unknown as ApplicationBundle;

const modelOf = (bundle: ApplicationBundle) =>
  (bundle.workflows[0].graph.nodes[0] as { data: { model: unknown } }).data
    .model;

describe("localizeLanguageModels", () => {
  it("swaps a model whose provider is not configured", () => {
    const out = localizeLanguageModels(
      bundleWith(model("openai", "gpt-5-mini")),
      new Set(["anthropic"])
    );
    expect(modelOf(out)).toMatchObject({
      provider: "anthropic",
      id: "recommended-anthropic"
    });
  });

  it("keeps a model whose provider is configured", () => {
    const shipped = model("openai", "gpt-5-mini");
    const out = localizeLanguageModels(
      bundleWith(shipped),
      new Set(["openai", "anthropic"])
    );
    expect(modelOf(out)).toEqual(shipped);
  });

  it("keeps the shipped model when no recommended provider is configured", () => {
    const shipped = model("openai", "gpt-5-mini");
    const out = localizeLanguageModels(bundleWith(shipped), new Set());
    expect(modelOf(out)).toEqual(shipped);
  });
});

describe("localizeLanguageModels, unselected models", () => {
  it("fills an unselected model with a configured recommended one", () => {
    const out = localizeLanguageModels(
      bundleWith(model("empty", "")),
      new Set(["openai"])
    );
    expect(modelOf(out)).toMatchObject({ provider: "openai", id: "recommended-openai" });
  });

  it("leaves an unselected model alone when no provider is configured", () => {
    const blank = model("empty", "");
    expect(modelOf(localizeLanguageModels(bundleWith(blank), new Set()))).toEqual(
      blank
    );
  });
});
