import { UnifiedModel } from "../stores/ApiTypes";
import {
  isHfModel,
  canCheckHfCache,
  getHfCacheKey,
  buildHfCacheRequest
} from "../hfCache";

describe("hfCache", () => {
  const createMockModel = (overrides: Partial<UnifiedModel> = {}): UnifiedModel => ({
    type: "hf.gguf",
    id: "model-123",
    name: "Test Model",
    path: null,
    repo_id: null,
    allow_patterns: null,
    ignore_patterns: null,
    ...overrides
  });

  describe("isHfModel", () => {
    it("returns true for hf. prefix type", () => {
      const model = createMockModel({ type: "hf.llama" });
      expect(isHfModel(model)).toBe(true);
    });

    it("returns true for hf_ prefix type", () => {
      const model = createMockModel({ type: "hf_safetensors" });
      expect(isHfModel(model)).toBe(true);
    });

    it("returns true when path is set", () => {
      const model = createMockModel({ type: "local", path: "models/model.bin" });
      expect(isHfModel(model)).toBe(true);
    });

    it("returns true when allow_patterns is set", () => {
      const model = createMockModel({ type: "local", allow_patterns: ["*.safetensors"] });
      expect(isHfModel(model)).toBe(true);
    });

    it("returns true when ignore_patterns is set", () => {
      const model = createMockModel({ type: "local", ignore_patterns: ["*.bin"] });
      expect(isHfModel(model)).toBe(true);
    });

    it("returns false for non-HF types without patterns", () => {
      const model = createMockModel({ type: "local", path: null, allow_patterns: null });
      expect(isHfModel(model)).toBe(false);
    });

    it("handles undefined type", () => {
      const model = createMockModel({ type: undefined as unknown as string });
      expect(isHfModel(model)).toBe(false);
    });

    it("handles empty string type", () => {
      const model = createMockModel({ type: "" });
      expect(isHfModel(model)).toBe(false);
    });
  });

  describe("canCheckHfCache", () => {
    it("returns true for HF model with repo_id", () => {
      const model = createMockModel({ type: "hf.llama", repo_id: "meta/llama" });
      expect(canCheckHfCache(model)).toBe(true);
    });

    it("returns true for HF model with id", () => {
      const model = createMockModel({ type: "hf.gguf", repo_id: null });
      expect(canCheckHfCache(model)).toBe(true);
    });

    it("returns false for non-HF model", () => {
      const model = createMockModel({ type: "local", path: null });
      expect(canCheckHfCache(model)).toBe(false);
    });

    it("returns false when repo_id and id are both null", () => {
      const model = createMockModel({ repo_id: null, id: null });
      expect(canCheckHfCache(model)).toBe(false);
    });
  });

  describe("getHfCacheKey", () => {
    it("returns repo_id when path is null", () => {
      const model = createMockModel({ repo_id: "meta/llama", path: null });
      expect(getHfCacheKey(model)).toBe("meta/llama");
    });

    it("returns id when repo_id is null", () => {
      const model = createMockModel({ repo_id: null, id: "model-123" });
      expect(getHfCacheKey(model)).toBe("model-123");
    });

    it("returns repo_id/path when path is set", () => {
      const model = createMockModel({ repo_id: "meta/llama", path: "model.bin" });
      expect(getHfCacheKey(model)).toBe("meta/llama/model.bin");
    });

    it("handles id/path when repo_id is null", () => {
      const model = createMockModel({ repo_id: null, id: "model-123", path: "model.bin" });
      expect(getHfCacheKey(model)).toBe("model-123/model.bin");
    });
  });

  describe("buildHfCacheRequest", () => {
    it("returns request item for checkable HF model", () => {
      const model = createMockModel({
        type: "hf.llama",
        repo_id: "meta/llama",
        path: null,
        allow_patterns: ["*.safetensors"],
        ignore_patterns: null
      });
      const result = buildHfCacheRequest(model);
      expect(result).not.toBeNull();
      expect(result?.key).toBe("meta/llama");
      expect(result?.repo_id).toBe("meta/llama");
      expect(result?.path).toBeNull();
      expect(result?.allow_patterns).toEqual(["*.safetensors"]);
      expect(result?.ignore_patterns).toBeNull();
    });

    it("returns null for non-HF model", () => {
      const model = createMockModel({ type: "local", path: null });
      const result = buildHfCacheRequest(model);
      expect(result).toBeNull();
    });

    it("returns null when repo_id and id are both null", () => {
      const model = createMockModel({ repo_id: null, id: null });
      const result = buildHfCacheRequest(model);
      expect(result).toBeNull();
    });

    it("sets path and nullifies patterns when path is set", () => {
      const model = createMockModel({
        repo_id: "meta/llama",
        path: "model.bin",
        allow_patterns: ["*.safetensors"],
        ignore_patterns: ["*.bin"]
      });
      const result = buildHfCacheRequest(model);
      expect(result).not.toBeNull();
      expect(result?.path).toBe("model.bin");
      expect(result?.allow_patterns).toBeNull();
      expect(result?.ignore_patterns).toBeNull();
    });
  });
});
