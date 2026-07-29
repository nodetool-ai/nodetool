import { describe, expect, it, vi } from "vitest";
import { createNodeToolSdkV1CachedModelInventory } from "../src/sdk/sdk-cached-model-inventory.js";

describe("NodeTool SDK v1 cached model inventory", () => {
  it("normalizes Python and TypeScript-shaped cached records", async () => {
    const listModels = vi.fn((_userId: string) => [
      {
        id: "alias",
        name: "Alias",
        repo_id: "org/model",
        downloaded: true
      },
      {
        id: "org/model",
        name: "Duplicate",
        downloaded: true
      },
      {
        id: "not-downloaded",
        name: "Remote",
        downloaded: false
      }
    ]);
    const inventory = createNodeToolSdkV1CachedModelInventory({
      sources: [
        {
          providerIds: ["local"],
          listModels
        }
      ]
    });

    await expect(
      inventory("alice", "local", ["language_model"])
    ).resolves.toEqual(["alias", "org/model"]);
    expect(listModels).toHaveBeenCalledWith("alice");
  });

  it("uses the Python bridge only for explicitly associated providers", async () => {
    const listCachedModels = vi.fn(async () => [
      { id: "org/python-model", name: "Python model", downloaded: true }
    ]);
    const inventory = createNodeToolSdkV1CachedModelInventory({
      pythonBridge: { listCachedModels },
      getPythonBridgeReady: () => true,
      pythonProviderIds: ["huggingface", "mlx"]
    });

    await expect(
      inventory("alice", "mlx", ["language_model"])
    ).resolves.toEqual(["org/python-model"]);
    expect(listCachedModels).toHaveBeenCalledOnce();

    await expect(
      inventory("alice", "openai", ["language_model"])
    ).rejects.toThrow("Cached model inventory is unavailable.");
    expect(listCachedModels).toHaveBeenCalledOnce();
  });

  it("reports an unready bridge conservatively without reading it", async () => {
    const listCachedModels = vi.fn(async () => []);
    const inventory = createNodeToolSdkV1CachedModelInventory({
      pythonBridge: { listCachedModels },
      getPythonBridgeReady: () => false
    });

    await expect(
      inventory("alice", "huggingface", ["image_model"])
    ).rejects.toThrow("Cached model inventory is unavailable.");
    expect(listCachedModels).not.toHaveBeenCalled();
  });

  it("redacts cache-source failures", async () => {
    const inventory = createNodeToolSdkV1CachedModelInventory({
      sources: [
        {
          providerIds: ["local"],
          listModels: () => {
            throw new Error("secret filesystem path");
          }
        }
      ]
    });

    await expect(
      inventory("alice", "local", ["embedding_model"])
    ).rejects.toThrow("Cached model inventory is unavailable.");
  });
});
