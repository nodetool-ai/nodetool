import type { UnifiedModel } from "../../stores/ApiTypes";
import {
  isHfModel,
  canCheckHfCache,
  getHfCacheKey,
  buildHfCacheRequest,
} from "../hfCache";

const createMockModel = (overrides?: Partial<UnifiedModel>): UnifiedModel => ({
  type: "llm",
  id: "model-1",
  name: "Test Model",
  repo_id: null,
  ...overrides,
});

describe("hfCache", () => {
  describe("isHfModel", () => {
    it("returns true for hf. prefixed type", () => {
      const model = createMockModel({ type: "hf.text_generation" });
      expect(isHfModel(model)).toBe(true);
    });

    it("returns true for hf_ prefixed type", () => {
      const model = createMockModel({ type: "hf_text_to_image" });
      expect(isHfModel(model)).toBe(true);
    });

    it("returns true when path is present", () => {
      const model = createMockModel({ type: "llm", path: "some/path" });
      expect(isHfModel(model)).toBe(true);
    });

    it("returns true when allow_patterns is present", () => {
      const model = createMockModel({ type: "llm", allow_patterns: ["*.safetensors"] });
      expect(isHfModel(model)).toBe(true);
    });

    it("returns true when ignore_patterns is present", () => {
      const model = createMockModel({ type: "llm", ignore_patterns: ["*.bin"] });
      expect(isHfModel(model)).toBe(true);
    });

    it("returns false for regular model without hf markers", () => {
      const model = createMockModel({ type: "llm" });
      expect(isHfModel(model)).toBe(false);
    });
  });

  describe("canCheckHfCache", () => {
    it("returns true for hf model with repo_id", () => {
      const model = createMockModel({ 
        type: "hf.text_generation", 
        repo_id: "user/repo" 
      });
      expect(canCheckHfCache(model)).toBe(true);
    });

    it("returns true for hf model with id", () => {
      const model = createMockModel({ 
        type: "hf.text_generation", 
        id: "model-id" 
      });
      expect(canCheckHfCache(model)).toBe(true);
    });

    it("returns false for hf model without repo_id or id", () => {
      const model = createMockModel({ 
        type: "hf.text_generation", 
        repo_id: null,
        id: undefined 
      });
      expect(canCheckHfCache(model)).toBe(false);
    });

    it("returns false for non-hf model", () => {
      const model = createMockModel({ type: "llm" });
      expect(canCheckHfCache(model)).toBe(false);
    });

    it("returns false when isHfModel is false even with repo_id", () => {
      const model = createMockModel({ 
        type: "llm", 
        repo_id: "user/repo" 
      });
      expect(canCheckHfCache(model)).toBe(false);
    });
  });

  describe("getHfCacheKey", () => {
    it("returns repo_id when no path", () => {
      const model = createMockModel({ repo_id: "user/repo" });
      expect(getHfCacheKey(model)).toBe("user/repo");
    });

    it("returns id when no repo_id and no path", () => {
      const model = createMockModel({ id: "model-id", repo_id: null });
      expect(getHfCacheKey(model)).toBe("model-id");
    });

    it("returns combined path when path is present", () => {
      const model = createMockModel({ 
        repo_id: "user/repo", 
        path: "subfolder/model.bin" 
      });
      expect(getHfCacheKey(model)).toBe("user/repo/subfolder/model.bin");
    });

    it("uses id when repo_id is missing but path exists", () => {
      const model = createMockModel({ 
        id: "model-id", 
        repo_id: null,
        path: "weights.bin" 
      });
      expect(getHfCacheKey(model)).toBe("model-id/weights.bin");
    });

    it("handles empty strings", () => {
      const model = createMockModel({ repo_id: "", id: "" });
      expect(getHfCacheKey(model)).toBe("");
    });
  });

  describe("buildHfCacheRequest", () => {
    it("returns null when cannot check cache", () => {
      const model = createMockModel({ type: "llm" });
      expect(buildHfCacheRequest(model)).toBeNull();
    });

    it("returns request object for hf model with repo_id", () => {
      const model = createMockModel({ 
        type: "hf.text_generation", 
        repo_id: "user/repo" 
      });
      const result = buildHfCacheRequest(model);
      expect(result).toEqual({
        key: "user/repo",
        repo_id: "user/repo",
        path: null,
        allow_patterns: null,
        ignore_patterns: null,
      });
    });

    it("returns request with path when specified", () => {
      const model = createMockModel({ 
        type: "hf.text_generation", 
        repo_id: "user/repo",
        path: "model.bin" 
      });
      const result = buildHfCacheRequest(model);
      expect(result).toEqual({
        key: "user/repo/model.bin",
        repo_id: "user/repo",
        path: "model.bin",
        allow_patterns: null,
        ignore_patterns: null,
      });
    });

    it("uses id when repo_id is missing", () => {
      const model = createMockModel({ 
        type: "hf.text_generation", 
        id: "model-id",
        repo_id: null
      });
      const result = buildHfCacheRequest(model);
      expect(result?.key).toBe("model-id");
      expect(result?.repo_id).toBe("model-id");
    });

    it("includes allow_patterns when no path", () => {
      const model = createMockModel({ 
        type: "hf.text_generation", 
        repo_id: "user/repo",
        allow_patterns: ["*.safetensors"] 
      });
      const result = buildHfCacheRequest(model);
      expect(result?.allow_patterns).toEqual(["*.safetensors"]);
    });

    it("includes ignore_patterns when no path", () => {
      const model = createMockModel({ 
        type: "hf.text_generation", 
        repo_id: "user/repo",
        ignore_patterns: ["*.bin"] 
      });
      const result = buildHfCacheRequest(model);
      expect(result?.ignore_patterns).toEqual(["*.bin"]);
    });

    it("sets patterns to null when path is present", () => {
      const model = createMockModel({ 
        type: "hf.text_generation", 
        repo_id: "user/repo",
        path: "model.bin",
        allow_patterns: ["*.safetensors"],
        ignore_patterns: ["*.bin"]
      });
      const result = buildHfCacheRequest(model);
      expect(result?.allow_patterns).toBeNull();
      expect(result?.ignore_patterns).toBeNull();
    });
  });
});
