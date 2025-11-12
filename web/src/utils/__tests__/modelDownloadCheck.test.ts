import { describe, it, expect } from "@jest/globals";
import { isModelDownloaded } from "../modelDownloadCheck";
import type { UnifiedModel } from "../../stores/ApiTypes";

describe("isModelDownloaded", () => {
  it("returns true when model id exists in downloaded set", () => {
    const downloadedIds = new Set(["model-1"]);
    const model = {
      id: "model-1",
      repo_id: "test/model-1",
      name: "Test Model",
      provider: "local",
      type: "language_model"
    } as unknown as UnifiedModel;

    expect(isModelDownloaded(model, downloadedIds)).toBe(true);
  });

  it("checks repo_id for models without local id", () => {
    const downloadedIds = new Set(["test/model-2"]);

    expect(
      isModelDownloaded({ repo_id: "test/model-2" }, downloadedIds)
    ).toBe(true);
  });

  it("falls back to false when path downloads are not matched", () => {
    const downloadedIds = new Set(["test/model-3"]);
    const model = {
      repo_id: "test/model-3",
      path: "/models/model-3.bin",
      name: "Model With Path",
      provider: "local",
      type: "language_model"
    } as unknown as UnifiedModel;

    const huggingFaceModels: UnifiedModel[] = [
      {
        id: "test/model-3",
        name: "Model With Path",
        provider: "huggingface",
        type: "language_model"
      } as unknown as UnifiedModel
    ];

    expect(isModelDownloaded(model, downloadedIds, huggingFaceModels)).toBe(
      false
    );
  });

  it("treats allow_patterns models like id-only checks", () => {
    const downloadedIds = new Set(["test/model-4"]);

    expect(
      isModelDownloaded(
        { repo_id: "test/model-4", allow_patterns: ["*.gguf"] },
        downloadedIds
      )
    ).toBe(true);
  });

  it("returns false when model is not present in downloads", () => {
    const downloadedIds = new Set<string>();
    const model = {
      id: "missing-model",
      repo_id: "test/missing-model",
      name: "Missing Model",
      provider: "local",
      type: "language_model"
    } as unknown as UnifiedModel;

    expect(isModelDownloaded(model, downloadedIds)).toBe(false);
  });
});
