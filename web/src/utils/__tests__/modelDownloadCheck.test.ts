import { isModelDownloaded } from "../modelDownloadCheck";

describe("modelDownloadCheck", () => {
  describe("isModelDownloaded", () => {
    const downloadedModelIds = new Set<string>([
      "model-a",
      "model-b",
      "user/repo-c",
    ]);

    it("should return true when repo_id is in downloaded models", () => {
      const model = { id: "model-a", repo_id: "model-a" };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(true);
    });

    it("should return false when repo_id is not in downloaded models", () => {
      const model = { id: "model-x", repo_id: "model-x" };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(false);
    });

    it("should return true when id matches downloaded model", () => {
      const model = { id: "model-b", repo_id: "different-id" };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(true);
    });

    it("should return false when no match found", () => {
      const model = { id: "unknown-model" };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(false);
    });

    it("should handle model with path but return false (not fully implemented)", () => {
      const model = { repo_id: "model-a", path: "some/path" };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(false);
    });

    it("should handle model with allow_patterns", () => {
      const model = { repo_id: "model-a", allow_patterns: ["*.safetensors"] };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(true);
    });

    it("should return false for model with allow_patterns not in downloaded set", () => {
      const model = { repo_id: "unknown-model", allow_patterns: ["*.safetensors"] };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(false);
    });

    it("should handle empty downloadedModelIds set", () => {
      const model = { id: "model-a" };
      const result = isModelDownloaded(model, new Set());
      expect(result).toBe(false);
    });

    it("should handle model with undefined id and repo_id", () => {
      const model = { path: "some/path" };
      const result = isModelDownloaded(model, downloadedModelIds);
      expect(result).toBe(false);
    });
  });
});
