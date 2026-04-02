import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  WorkflowSyncer,
  type AssetInfo,
  type SyncerAssetStorage,
  type WorkflowSyncerDeps
} from "../src/workflow-syncer.js";
import type { AdminHTTPClient } from "../src/admin-client.js";

// ---------- helpers ----------

function makeMockClient(): AdminHTTPClient {
  return {
    updateWorkflow: vi.fn().mockResolvedValue({}),
    getAsset: vi.fn().mockRejectedValue(new Error("not found")),
    createAsset: vi.fn().mockResolvedValue({}),
    uploadAssetFile: vi.fn().mockResolvedValue(undefined),
    downloadHuggingfaceModel: vi.fn().mockImplementation(async function* () {
      yield { status: "complete" };
    }),
    downloadOllamaModel: vi.fn().mockImplementation(async function* () {
      yield { status: "success" };
    })
  } as unknown as AdminHTTPClient;
}

function makeMockStorage(
  data: Record<string, Uint8Array> = {}
): SyncerAssetStorage {
  return {
    download: vi.fn().mockImplementation(async (key: string) => {
      return data[key] ?? new Uint8Array([1, 2, 3]);
    })
  };
}

function makeMockDeps(
  overrides: Partial<WorkflowSyncerDeps> = {}
): WorkflowSyncerDeps {
  return {
    getWorkflowData: vi.fn().mockResolvedValue({
      id: "wf-1",
      name: "Test Workflow",
      graph: { nodes: [] }
    }),
    getAsset: vi.fn().mockResolvedValue(null),
    getSyncerAssetStorage: vi.fn().mockReturnValue(makeMockStorage()),
    ...overrides
  };
}

function makeAsset(overrides: Partial<AssetInfo> = {}): AssetInfo {
  return {
    id: "asset-1",
    user_id: "1",
    name: "test-image.png",
    content_type: "image/png",
    file_name: "asset-1.png",
    has_thumbnail: false,
    ...overrides
  };
}

function makeWorkflowWithAsset(assetId: string): Record<string, unknown> {
  return {
    id: "wf-1",
    graph: {
      nodes: [
        {
          type: "nodetool.constant.Image",
          data: {
            value: { asset_id: assetId, uri: "http://example.com/img.png" }
          }
        }
      ]
    }
  };
}

function makeWorkflowWithHFModel(repoId: string): Record<string, unknown> {
  return {
    id: "wf-1",
    graph: {
      nodes: [
        {
          data: {
            model: {
              type: "hf.diffusers",
              repo_id: repoId
            }
          }
        }
      ]
    }
  };
}

function makeWorkflowWithOllamaModel(modelId: string): Record<string, unknown> {
  return {
    id: "wf-1",
    graph: {
      nodes: [
        {
          data: {
            model: {
              type: "language_model",
              provider: "ollama",
              id: modelId
            }
          }
        }
      ]
    }
  };
}

describe("WorkflowSyncer", () => {
  let client: ReturnType<typeof makeMockClient>;
  let deps: WorkflowSyncerDeps;
  let syncer: WorkflowSyncer;

  beforeEach(() => {
    client = makeMockClient();
    deps = makeMockDeps();
    syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  describe("syncWorkflow - basic", () => {
    it("should return true on successful sync", async () => {
      const result = await syncer.syncWorkflow("wf-1");
      expect(result).toBe(true);
    });

    it("should call updateWorkflow with the workflow data", async () => {
      await syncer.syncWorkflow("wf-1");
      expect(client.updateWorkflow).toHaveBeenCalledWith(
        "wf-1",
        expect.objectContaining({ id: "wf-1" })
      );
    });

    it("should return false when workflow not found locally", async () => {
      deps = makeMockDeps({
        getWorkflowData: vi.fn().mockResolvedValue(null)
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);
      const result = await syncer.syncWorkflow("nonexistent");
      expect(result).toBe(false);
    });

    it("should return false when updateWorkflow throws", async () => {
      client.updateWorkflow = vi
        .fn()
        .mockRejectedValue(new Error("network error"));
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);
      const result = await syncer.syncWorkflow("wf-1");
      expect(result).toBe(false);
    });

    it("should call getWorkflowData with the given ID", async () => {
      await syncer.syncWorkflow("wf-42");
      expect(deps.getWorkflowData).toHaveBeenCalledWith("wf-42");
    });
  });

  describe("syncWorkflow - asset syncing", () => {
    it("should sync an asset referenced in the workflow", async () => {
      const asset = makeAsset({ id: "asset-1" });
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithAsset("asset-1")),
        getAsset: vi.fn().mockResolvedValue(asset)
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      const result = await syncer.syncWorkflow("wf-1");
      expect(result).toBe(true);
      expect(client.createAsset).toHaveBeenCalledWith(
        expect.objectContaining({ id: "asset-1", name: "test-image.png" })
      );
    });

    it("should upload asset file data", async () => {
      const asset = makeAsset({ id: "asset-1", file_name: "asset-1.png" });
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithAsset("asset-1")),
        getAsset: vi.fn().mockResolvedValue(asset)
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(client.uploadAssetFile).toHaveBeenCalledWith(
        "asset-1.png",
        expect.any(Uint8Array)
      );
    });

    it("should upload thumbnail when has_thumbnail is true", async () => {
      const asset = makeAsset({
        id: "asset-1",
        file_name: "asset-1.png",
        has_thumbnail: true,
        thumb_file_name: "asset-1-thumb.png"
      });
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithAsset("asset-1")),
        getAsset: vi.fn().mockResolvedValue(asset)
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(client.uploadAssetFile).toHaveBeenCalledWith(
        "asset-1-thumb.png",
        expect.any(Uint8Array)
      );
    });

    it("should not upload thumbnail when has_thumbnail is false", async () => {
      const asset = makeAsset({
        id: "asset-1",
        file_name: "asset-1.png",
        has_thumbnail: false
      });
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithAsset("asset-1")),
        getAsset: vi.fn().mockResolvedValue(asset)
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      // Only one call for the main file
      expect(client.uploadAssetFile).toHaveBeenCalledTimes(1);
    });

    it("should skip asset that already exists on remote", async () => {
      const asset = makeAsset({ id: "asset-1" });
      client.getAsset = vi.fn().mockResolvedValue({ id: "asset-1" }); // exists
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithAsset("asset-1")),
        getAsset: vi.fn().mockResolvedValue(asset)
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(client.createAsset).not.toHaveBeenCalled();
    });

    it("should skip asset not found locally", async () => {
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithAsset("asset-missing")),
        getAsset: vi.fn().mockResolvedValue(null)
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      const result = await syncer.syncWorkflow("wf-1");
      expect(result).toBe(true);
      expect(client.createAsset).not.toHaveBeenCalled();
    });

    it("should not upload file for folder content type", async () => {
      const asset = makeAsset({
        id: "asset-folder",
        content_type: "folder",
        file_name: "folder"
      });
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithAsset("asset-folder")),
        getAsset: vi.fn().mockResolvedValue(asset)
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(client.uploadAssetFile).not.toHaveBeenCalled();
    });

    it("should not upload file when file_name is null", async () => {
      const asset = makeAsset({
        id: "asset-1",
        file_name: null
      });
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithAsset("asset-1")),
        getAsset: vi.fn().mockResolvedValue(asset)
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(client.uploadAssetFile).not.toHaveBeenCalled();
    });

    it("should handle asset sync failure gracefully", async () => {
      const asset = makeAsset({ id: "asset-1" });
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithAsset("asset-1")),
        getAsset: vi.fn().mockResolvedValue(asset)
      });
      client.createAsset = vi
        .fn()
        .mockRejectedValue(new Error("create failed"));
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      const result = await syncer.syncWorkflow("wf-1");
      // Should still succeed overall (asset failures are caught)
      expect(result).toBe(true);
    });

    it("should skip workflow nodes that are not constant types", async () => {
      deps = makeMockDeps({
        getWorkflowData: vi.fn().mockResolvedValue({
          id: "wf-1",
          graph: {
            nodes: [
              {
                type: "nodetool.transform.Resize",
                data: {
                  value: { asset_id: "should-not-be-extracted" }
                }
              }
            ]
          }
        })
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(deps.getAsset).not.toHaveBeenCalled();
    });

    it("should handle multiple assets in one workflow", async () => {
      const wfData = {
        id: "wf-1",
        graph: {
          nodes: [
            {
              type: "nodetool.constant.Image",
              data: { value: { asset_id: "a1" } }
            },
            {
              type: "nodetool.constant.Audio",
              data: { value: { asset_id: "a2" } }
            }
          ]
        }
      };
      const asset1 = makeAsset({
        id: "a1",
        name: "img.png",
        file_name: "a1.png"
      });
      const asset2 = makeAsset({
        id: "a2",
        name: "audio.mp3",
        file_name: "a2.mp3"
      });
      deps = makeMockDeps({
        getWorkflowData: vi.fn().mockResolvedValue(wfData),
        getAsset: vi.fn().mockImplementation(async (id: string) => {
          if (id === "a1") return asset1;
          if (id === "a2") return asset2;
          return null;
        })
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(client.createAsset).toHaveBeenCalledTimes(2);
    });

    it("should deduplicate asset IDs", async () => {
      const wfData = {
        id: "wf-1",
        graph: {
          nodes: [
            {
              type: "nodetool.constant.Image",
              data: { value: { asset_id: "a1" } }
            },
            {
              type: "nodetool.constant.Image",
              data: { value: { asset_id: "a1" } }
            }
          ]
        }
      };
      const asset = makeAsset({ id: "a1" });
      deps = makeMockDeps({
        getWorkflowData: vi.fn().mockResolvedValue(wfData),
        getAsset: vi.fn().mockResolvedValue(asset)
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(deps.getAsset).toHaveBeenCalledTimes(1);
    });
  });

  describe("syncWorkflow - model downloading", () => {
    it("should download HuggingFace models", async () => {
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithHFModel("org/model"))
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(client.downloadHuggingfaceModel).toHaveBeenCalledWith(
        expect.objectContaining({ repoId: "org/model" })
      );
    });

    it("should download Ollama models", async () => {
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithOllamaModel("llama3:8b"))
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(client.downloadOllamaModel).toHaveBeenCalledWith("llama3:8b");
    });

    it("should handle model download failure gracefully", async () => {
      client.downloadHuggingfaceModel = vi
        .fn()
        .mockImplementation(async function* () {
          throw new Error("download failed");
        });
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithHFModel("org/model"))
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      const result = await syncer.syncWorkflow("wf-1");
      expect(result).toBe(true); // still succeeds
    });

    it("should not call download methods when no models", async () => {
      deps = makeMockDeps({
        getWorkflowData: vi.fn().mockResolvedValue({
          id: "wf-1",
          graph: { nodes: [{ data: { prompt: "hello" } }] }
        })
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(client.downloadHuggingfaceModel).not.toHaveBeenCalled();
      expect(client.downloadOllamaModel).not.toHaveBeenCalled();
    });

    it("should handle HF model download with progress events", async () => {
      client.downloadHuggingfaceModel = vi
        .fn()
        .mockImplementation(async function* () {
          yield {
            status: "downloading",
            file: "model.safetensors",
            percent: 50
          };
          yield {
            status: "downloading",
            file: "model.safetensors",
            percent: 100
          };
          yield { status: "complete" };
        });
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithHFModel("org/model"))
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      const result = await syncer.syncWorkflow("wf-1");
      expect(result).toBe(true);
    });

    it("should handle Ollama model download with progress events", async () => {
      client.downloadOllamaModel = vi
        .fn()
        .mockImplementation(async function* () {
          yield { status: "pulling manifest" };
          yield { status: "downloading" };
          yield { status: "success" };
        });
      deps = makeMockDeps({
        getWorkflowData: vi
          .fn()
          .mockResolvedValue(makeWorkflowWithOllamaModel("llama3:8b"))
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      const result = await syncer.syncWorkflow("wf-1");
      expect(result).toBe(true);
    });

    it("should pass filePath for HF models with path", async () => {
      const wfData = {
        id: "wf-1",
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "hf.gguf",
                  repo_id: "org/model",
                  path: "model.gguf"
                }
              }
            }
          ]
        }
      };
      deps = makeMockDeps({
        getWorkflowData: vi.fn().mockResolvedValue(wfData)
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(client.downloadHuggingfaceModel).toHaveBeenCalledWith(
        expect.objectContaining({ repoId: "org/model", filePath: "model.gguf" })
      );
    });

    it("should pass patterns for HF models", async () => {
      const wfData = {
        id: "wf-1",
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "hf.model",
                  repo_id: "org/model",
                  allow_patterns: ["*.safetensors"],
                  ignore_patterns: ["*.bin"]
                }
              }
            }
          ]
        }
      };
      deps = makeMockDeps({
        getWorkflowData: vi.fn().mockResolvedValue(wfData)
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      await syncer.syncWorkflow("wf-1");
      expect(client.downloadHuggingfaceModel).toHaveBeenCalledWith(
        expect.objectContaining({
          allowPatterns: ["*.safetensors"],
          ignorePatterns: ["*.bin"]
        })
      );
    });
  });

  describe("syncWorkflow - error handling", () => {
    it("should return false when getWorkflowData throws", async () => {
      deps = makeMockDeps({
        getWorkflowData: vi.fn().mockRejectedValue(new Error("db error"))
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      const result = await syncer.syncWorkflow("wf-1");
      expect(result).toBe(false);
    });

    it("should continue syncing other assets after one fails", async () => {
      const wfData = {
        id: "wf-1",
        graph: {
          nodes: [
            {
              type: "nodetool.constant.Image",
              data: { value: { asset_id: "a1" } }
            },
            {
              type: "nodetool.constant.Image",
              data: { value: { asset_id: "a2" } }
            }
          ]
        }
      };
      const asset1 = makeAsset({
        id: "a1",
        name: "img1.png",
        file_name: "a1.png"
      });
      const asset2 = makeAsset({
        id: "a2",
        name: "img2.png",
        file_name: "a2.png"
      });

      let createCallCount = 0;
      client.createAsset = vi.fn().mockImplementation(async () => {
        createCallCount++;
        if (createCallCount === 1) throw new Error("first fails");
        return {};
      });

      deps = makeMockDeps({
        getWorkflowData: vi.fn().mockResolvedValue(wfData),
        getAsset: vi.fn().mockImplementation(async (id: string) => {
          if (id === "a1") return asset1;
          if (id === "a2") return asset2;
          return null;
        })
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      const result = await syncer.syncWorkflow("wf-1");
      expect(result).toBe(true);
      expect(client.createAsset).toHaveBeenCalledTimes(2);
    });

    it("should handle workflow with no graph gracefully", async () => {
      deps = makeMockDeps({
        getWorkflowData: vi.fn().mockResolvedValue({ id: "wf-1" })
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      const result = await syncer.syncWorkflow("wf-1");
      expect(result).toBe(true);
    });

    it("should handle workflow with empty graph gracefully", async () => {
      deps = makeMockDeps({
        getWorkflowData: vi.fn().mockResolvedValue({ id: "wf-1", graph: {} })
      });
      syncer = new WorkflowSyncer(client as AdminHTTPClient, deps);

      const result = await syncer.syncWorkflow("wf-1");
      expect(result).toBe(true);
    });
  });
});
