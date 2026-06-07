import { UnifiedModel } from "../../../../stores/ApiTypes";
import { isManageableModel } from "../useModels";

const model = (overrides: Partial<UnifiedModel>): UnifiedModel =>
  ({
    id: "m",
    name: "m",
    type: "language_model",
    repo_id: null,
    path: null,
    ...overrides
  }) as UnifiedModel;

describe("isManageableModel", () => {
  it("keeps HuggingFace models", () => {
    expect(isManageableModel(model({ type: "hf.text_generation" }))).toBe(true);
  });

  it("keeps HuggingFace models identified by path", () => {
    expect(
      isManageableModel(model({ type: "language_model", path: "model.gguf" }))
    ).toBe(true);
  });

  it("keeps transformers.js cached models", () => {
    expect(
      isManageableModel(model({ type: "tjs.text_generation", provider: "transformers_js" }))
    ).toBe(true);
  });

  it("keeps Ollama models", () => {
    expect(isManageableModel(model({ type: "llama_model", provider: "ollama" }))).toBe(true);
  });

  it("keeps local-runtime provider models", () => {
    expect(isManageableModel(model({ provider: "ollama" }))).toBe(true);
    expect(isManageableModel(model({ provider: "llama_cpp" }))).toBe(true);
    expect(isManageableModel(model({ provider: "huggingface" }))).toBe(true);
  });

  it("drops cloud API provider models", () => {
    expect(isManageableModel(model({ provider: "openai" }))).toBe(false);
    expect(isManageableModel(model({ provider: "anthropic" }))).toBe(false);
    expect(isManageableModel(model({ provider: "gemini" }))).toBe(false);
    expect(isManageableModel(model({ provider: "groq" }))).toBe(false);
  });
});
