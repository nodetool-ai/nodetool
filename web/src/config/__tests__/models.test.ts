import { llama_models } from "../models";

describe("llama_models", () => {
  it("should be a non-empty array", () => {
    expect(Array.isArray(llama_models)).toBe(true);
    expect(llama_models.length).toBeGreaterThan(0);
  });

  it("all models should have required fields", () => {
    llama_models.forEach((model) => {
      expect(typeof model.id).toBe("string");
      expect(model.id.length).toBeGreaterThan(0);
      expect(typeof model.name).toBe("string");
      expect(model.name.length).toBeGreaterThan(0);
      expect(typeof model.description).toBe("string");
      expect(model.description.length).toBeGreaterThan(0);
      expect(model.type).toBe("llama_model");
    });
  });

  it("all models should have mapped properties from the .map() transform", () => {
    llama_models.forEach((model) => {
      expect(model.repo_id).toBe(model.id);
      expect(model.downloaded).toBe(false);
      expect(model.path).toBeNull();
      expect(model.cache_path).toBeNull();
      expect(model.allow_patterns).toBeNull();
      expect(model.ignore_patterns).toBeNull();
      expect(model.pipeline_tag).toBeNull();
      expect(model.tags).toBeNull();
      expect(model.has_model_index).toBeNull();
      expect(model.downloads).toBeNull();
      expect(model.likes).toBeNull();
      expect(model.trending_score).toBeNull();
      expect(model.readme).toBeNull();
      expect(model.size_on_disk).toBeNull();
    });
  });

  it("should have unique model ids", () => {
    const ids = llama_models.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it("should include known models", () => {
    const ids = llama_models.map((m) => m.id);
    expect(ids).toContain("gpt-oss:20b");
    expect(ids).toContain("llama3.1:8b");
    expect(ids).toContain("mistral:latest");
  });
});
