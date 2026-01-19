import { isModelDownloaded } from "../modelDownloadCheck";

describe("modelDownloadCheck", () => {
  describe("isModelDownloaded", () => {
    const downloadedModels = new Set<string>(["model1", "model2", "model3"]);

    it("returns false when no path, no patterns, and model not in downloaded set", () => {
      const model = { id: "model4", repo_id: "repo4" };
      const result = isModelDownloaded(model, downloadedModels);
      expect(result).toBe(false);
    });

    it("returns true when no path, no patterns, and model id in downloaded set", () => {
      const model = { id: "model1", repo_id: "repo1" };
      const result = isModelDownloaded(model, downloadedModels);
      expect(result).toBe(true);
    });

    it("returns true when no path, no patterns, and repo_id in downloaded set", () => {
      const model = { id: undefined as any, repo_id: "model2" };
      const result = isModelDownloaded(model, downloadedModels);
      expect(result).toBe(true);
    });

    it("returns false when path set but not downloaded", () => {
      const model = { id: "model1", repo_id: "repo1", path: "path/to/model" };
      const result = isModelDownloaded(model, downloadedModels);
      expect(result).toBe(false);
    });

    it("returns true when allow_patterns set and model id is in downloaded set", () => {
      const model = { id: "model1", repo_id: "repo1", allow_patterns: ["*.safetensors"] };
      const result = isModelDownloaded(model, downloadedModels);
      expect(result).toBe(true);
    });

    it("returns false when allow_patterns set and model id is not in downloaded set", () => {
      const model = { id: "model4", repo_id: "repo4", allow_patterns: ["*.safetensors"] };
      const result = isModelDownloaded(model, downloadedModels);
      expect(result).toBe(false);
    });

    it("returns true when allow_patterns set and repo_id is in downloaded set", () => {
      const model = { id: undefined as any, repo_id: "model3", allow_patterns: ["*.safetensors"] };
      const result = isModelDownloaded(model, downloadedModels);
      expect(result).toBe(true);
    });

    it("returns false when model id is undefined and repo_id not in downloaded set", () => {
      const model = { id: undefined as any, repo_id: "nonexistent" };
      const result = isModelDownloaded(model, downloadedModels);
      expect(result).toBe(false);
    });

    it("returns false when both id and repo_id are undefined", () => {
      const model = { id: undefined as any, repo_id: undefined as any };
      const result = isModelDownloaded(model, downloadedModels);
      expect(result).toBe(false);
    });

    it("handles empty downloaded set", () => {
      const emptySet = new Set<string>();
      const model = { id: "model1" } as any;
      const result = isModelDownloaded(model, emptySet);
      expect(result).toBe(false);
    });

    it("returns true when empty path string but model id is in downloaded set", () => {
      const model = { id: "model1", path: "" };
      const result = isModelDownloaded(model, downloadedModels);
      expect(result).toBe(true);
    });

    it("returns true when empty allow_patterns array but model id is in downloaded set", () => {
      const model = { id: "model1", allow_patterns: [] };
      const result = isModelDownloaded(model, downloadedModels);
      expect(result).toBe(true);
    });

    it("handles UnifiedModel type input", () => {
      const unifiedModel = {
        id: "model1",
        repo_id: "repo1",
        type: "text",
        title: "Test Model",
        description: "A test model"
      } as any;
      const result = isModelDownloaded(unifiedModel, downloadedModels);
      expect(result).toBe(true);
    });

    it("passes hfModels parameter but does not use it in current implementation", () => {
      const model = { id: "model1", repo_id: "repo1", path: "path/to/model" } as any;
      const hfModels = [
        { id: "repo1", repo_id: "repo1", type: "text", title: "HF Model", description: "HF" }
      ] as any[];
      const result = isModelDownloaded(model, downloadedModels, hfModels);
      expect(result).toBe(false);
    });
  });
});
