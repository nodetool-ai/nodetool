import { isModelDownloaded } from "../modelDownloadCheck";

// Helper type for test models - a partial model object that matches what the function accepts
type TestModel = {
  id?: string;
  repo_id?: string;
  path?: string;
  allow_patterns?: string[];
};

describe("modelDownloadCheck", () => {
  describe("isModelDownloaded", () => {
    const downloadedModelIds = new Set<string>([
      "model-a",
      "model-b",
      "user/repo-c",
    ]);

    it("should return true when repo_id is in downloaded models", () => {
      const model: TestModel = { id: "model-a", repo_id: "model-a" };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(true);
    });

    it("should return false when repo_id is not in downloaded models", () => {
      const model: TestModel = { id: "model-x", repo_id: "model-x" };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(false);
    });

    it("should return true when id matches downloaded model", () => {
      const model: TestModel = { id: "model-b", repo_id: "different-id" };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(true);
    });

    it("should return false when no match found", () => {
      const model: TestModel = { id: "unknown-model" };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(false);
    });

    it("should handle model with path but return false (not fully implemented)", () => {
      const model: TestModel = { repo_id: "model-a", path: "some/path" };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(false);
    });

    it("should handle model with allow_patterns", () => {
      const model: TestModel = { repo_id: "model-a", allow_patterns: ["*.safetensors"] };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(true);
    });

    it("should return false for model with allow_patterns not in downloaded set", () => {
      const model: TestModel = { repo_id: "unknown-model", allow_patterns: ["*.safetensors"] };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(false);
    });

    it("should handle empty downloadedModelIds set", () => {
      const model: TestModel = { id: "model-a" };
      const result = isModelDownloaded(model, new Set());
      expect(result).toBe(false);
    });

    it("should handle model with undefined id and repo_id", () => {
      const model: TestModel = { path: "some/path" };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(false);
    });
  });
});
