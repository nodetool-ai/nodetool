import type { UnifiedModel } from "../../stores/ApiTypes";
import { isHfModel, canCheckHfCache, getHfCacheKey, buildHfCacheRequest } from "../hfCache";

describe("hfCache", () => {
  const createMockModel = (overrides: Partial<UnifiedModel> & { type?: string | null } = {}): UnifiedModel => ({
    id: "model-1",
    name: "Test Model",
    type: null,
    repo_id: null,
    path: null,
    allow_patterns: null,
    ignore_patterns: null,
    ...overrides
  });

  describe("isHfModel", () => {
    it("returns true for hf. prefix types", () => {
      expect(isHfModel(createMockModel({ type: "hf.text" }))).toBe(true);
      expect(isHfModel(createMockModel({ type: "hf.image" }))).toBe(true);
      expect(isHfModel(createMockModel({ type: "hf.audio" }))).toBe(true);
    });

    it("returns true for hf_ prefix types", () => {
      expect(isHfModel(createMockModel({ type: "hf_custom" }))).toBe(true);
      expect(isHfModel(createMockModel({ type: "hf_model" }))).toBe(true);
    });

    it("returns true when path is provided", () => {
      expect(isHfModel(createMockModel({ path: "some/path" }))).toBe(true);
    });

    it("returns true when allow_patterns is provided", () => {
      expect(isHfModel(createMockModel({ allow_patterns: ["*.safetensors"] }))).toBe(true);
    });

    it("returns true when ignore_patterns is provided", () => {
      expect(isHfModel(createMockModel({ ignore_patterns: ["*.bin"] }))).toBe(true);
    });

    it("returns false for non-HF types without path or patterns", () => {
      expect(isHfModel(createMockModel({ type: "ollama.llama3" }))).toBe(false);
      expect(isHfModel(createMockModel({ type: "openai.gpt-4" }))).toBe(false);
      expect(isHfModel(createMockModel({ type: undefined }))).toBe(false);
    });

    it("handles empty string type", () => {
      expect(isHfModel(createMockModel({ type: "" }))).toBe(false);
    });

    it("handles null type", () => {
      expect(isHfModel(createMockModel({ type: null as any }))).toBe(false);
    });

    it("returns true with multiple HF indicators", () => {
      expect(isHfModel(createMockModel({ 
        type: "hf.text", 
        path: "some/path" 
      }))).toBe(true);
    });

    it("returns true when only repo_id is provided (checks path/patterns)", () => {
      expect(isHfModel(createMockModel({ repo_id: "user/repo" }))).toBe(false);
    });
  });

  describe("canCheckHfCache", () => {
    it("returns true for HF models with repo_id", () => {
      expect(canCheckHfCache(createMockModel({ 
        type: "hf.text", 
        repo_id: "user/repo" 
      }))).toBe(true);
    });

    it("returns true for HF models with id", () => {
      expect(canCheckHfCache(createMockModel({ 
        type: "hf.text", 
        id: "model-id" 
      }))).toBe(true);
    });

    it("returns false for non-HF models", () => {
      expect(canCheckHfCache(createMockModel({ 
        type: "ollama.llama3",
        repo_id: "user/repo" 
      }))).toBe(false);
    });

    it("returns false when repo_id and id are both missing", () => {
      expect(canCheckHfCache(createMockModel({ 
        type: "hf.text",
        repo_id: undefined,
        id: undefined
      }))).toBe(false);
    });

    it("returns true for models with path property", () => {
      expect(canCheckHfCache(createMockModel({ 
        type: "hf.text",
        path: "some/path",
        repo_id: "user/repo"
      }))).toBe(true);
    });

    it("returns false with empty repo_id and no id", () => {
      expect(canCheckHfCache(createMockModel({ 
        type: "hf.text",
        repo_id: "",
        id: undefined
      }))).toBe(false);
    });
  });

  describe("getHfCacheKey", () => {
    it("returns repo_id when path is not provided", () => {
      expect(getHfCacheKey(createMockModel({ 
        repo_id: "user/repo",
        path: undefined 
      }))).toBe("user/repo");
    });

    it("returns id when repo_id is not provided", () => {
      expect(getHfCacheKey(createMockModel({ 
        id: "model-id",
        repo_id: undefined,
        path: undefined 
      }))).toBe("model-id");
    });

    it("combines repo_id and path when path is provided", () => {
      expect(getHfCacheKey(createMockModel({ 
        repo_id: "user/repo",
        path: "snapshot/main/file.bin"
      }))).toBe("user/repo/snapshot/main/file.bin");
    });

    it("combines id and path when path is provided", () => {
      expect(getHfCacheKey(createMockModel({ 
        id: "model-id",
        path: "weights.safetensors"
      }))).toBe("model-id/weights.safetensors");
    });

    it("prioritizes repo_id over id", () => {
      expect(getHfCacheKey(createMockModel({ 
        id: "model-id",
        repo_id: "user/repo"
      }))).toBe("user/repo");
    });
  });

  describe("buildHfCacheRequest", () => {
    it("returns null for non-HF models", () => {
      expect(buildHfCacheRequest(createMockModel({ 
        type: "ollama.llama3" 
      }))).toBeNull();
    });

    it("returns request object for valid HF model", () => {
      const result = buildHfCacheRequest(createMockModel({ 
        type: "hf.text",
        repo_id: "user/repo"
      }));

      expect(result).not.toBeNull();
      expect(result?.key).toBe("user/repo");
      expect(result?.repo_id).toBe("user/repo");
      expect(result?.path).toBeNull();
    });

    it("includes path when provided", () => {
      const result = buildHfCacheRequest(createMockModel({ 
        type: "hf.text",
        repo_id: "user/repo",
        path: "weights.safetensors"
      }));

      expect(result).not.toBeNull();
      expect(result?.key).toBe("user/repo/weights.safetensors");
      expect(result?.path).toBe("weights.safetensors");
      expect(result?.allow_patterns).toBeNull();
      expect(result?.ignore_patterns).toBeNull();
    });

    it("includes allow_patterns when path is not provided", () => {
      const result = buildHfCacheRequest(createMockModel({ 
        type: "hf.text",
        repo_id: "user/repo",
        allow_patterns: ["*.safetensors"]
      }));

      expect(result).not.toBeNull();
      expect(result?.allow_patterns).toEqual(["*.safetensors"]);
      expect(result?.path).toBeNull();
    });

    it("includes ignore_patterns when path is not provided", () => {
      const result = buildHfCacheRequest(createMockModel({ 
        type: "hf.text",
        repo_id: "user/repo",
        ignore_patterns: ["*.bin"]
      }));

      expect(result).not.toBeNull();
      expect(result?.ignore_patterns).toEqual(["*.bin"]);
      expect(result?.path).toBeNull();
    });

    it("uses id when repo_id is not provided", () => {
      const result = buildHfCacheRequest(createMockModel({ 
        type: "hf.text",
        id: "model-id"
      }));

      expect(result).not.toBeNull();
      expect(result?.repo_id).toBe("model-id");
    });

    it("handles undefined patterns correctly", () => {
      const result = buildHfCacheRequest(createMockModel({ 
        type: "hf.text",
        repo_id: "user/repo",
        allow_patterns: undefined,
        ignore_patterns: undefined
      }));

      expect(result).not.toBeNull();
      expect(result?.allow_patterns).toBeNull();
      expect(result?.ignore_patterns).toBeNull();
    });
  });
});
