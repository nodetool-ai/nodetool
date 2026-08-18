import { formatsForModel, MODEL_FORMATS } from "../modelFormat";
import type { UnifiedModel } from "../../../../stores/ApiTypes";

const model = (overrides: Partial<UnifiedModel>): UnifiedModel => ({
  id: "test/model",
  name: "model",
  ...overrides
});

describe("formatsForModel", () => {
  it("classifies Ollama models as GGUF", () => {
    expect(formatsForModel(model({ type: "llama_model" }))).toContain("gguf");
  });

  it("classifies transformers.js models as ONNX", () => {
    expect(
      formatsForModel(model({ type: "tjs.text_generation" }))
    ).toContain("onnx");
  });

  it("reads formats from Hub tags", () => {
    const formats = formatsForModel(
      model({ tags: ["GGUF", "safetensors", "text-generation"] })
    );
    expect(formats).toContain("gguf");
    expect(formats).toContain("safetensors");
    expect(formats).not.toContain("pytorch");
  });

  it("reads formats from file extensions in path", () => {
    expect(
      formatsForModel(model({ path: "unet/flux-dev.safetensors" }))
    ).toContain("safetensors");
    expect(formatsForModel(model({ path: "model.onnx" }))).toContain("onnx");
    expect(formatsForModel(model({ path: "weights.gguf" }))).toContain("gguf");
    expect(formatsForModel(model({ path: "model.bin" }))).toContain("pytorch");
  });

  it("reads format markers from the repo id", () => {
    expect(
      formatsForModel(model({ repo_id: "TheBloke/Mistral-7B-GGUF" }))
    ).toContain("gguf");
    expect(
      formatsForModel(model({ repo_id: "mlx-community/Qwen3-4B-4bit" }))
    ).toContain("mlx");
  });

  it("does not match markers inside larger words", () => {
    // "mlx" inside "html-xtra" must not count as an MLX marker.
    expect(formatsForModel(model({ name: "htmlxtra" }))).not.toContain("mlx");
  });

  it("returns an empty set when nothing identifies a format", () => {
    expect(formatsForModel(model({ type: "hf.text_generation" })).size).toBe(0);
  });

  it("every catalog format id is lowercase and unique", () => {
    const ids = MODEL_FORMATS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBe(id.toLowerCase());
    }
  });
});
