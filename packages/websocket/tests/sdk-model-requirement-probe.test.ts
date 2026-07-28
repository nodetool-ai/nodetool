import { describe, expect, it, vi } from "vitest";
import type { SdkV1Requirement } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import { createNodeToolSdkV1ModelProbe } from "../src/sdk/sdk-model-requirement-probe.js";

function modelRequirement(
  details?: Record<string, unknown>
): SdkV1Requirement & { kind: "model" } {
  return {
    kind: "model",
    id: "model-1",
    name: "Model 1",
    status: "unknown",
    blocking: true,
    message: null,
    ...(details ? { details } : {})
  };
}

describe("NodeTool SDK v1 model requirement probe", () => {
  it("checks only the recorded provider and model type", async () => {
    const listModelIds = vi.fn(async () => ["model-1", "model-2"]);
    const probe = createNodeToolSdkV1ModelProbe({
      userId: "alice",
      listProviderIds: () => ["openai", "other"],
      isProviderReady: async () => true,
      listModelIds
    });

    await expect(
      probe(
        modelRequirement({
          provider_ids: ["openai"],
          model_types: ["language_model"]
        })
      )
    ).resolves.toEqual({ status: "available", message: null });
    expect(listModelIds).toHaveBeenCalledWith("alice", "openai", [
      "language_model"
    ]);
    expect(listModelIds).toHaveBeenCalledOnce();
  });

  it("stays conservative when provider context is incomplete", async () => {
    const listModelIds = vi.fn(async () => ["model-1"]);
    const probe = createNodeToolSdkV1ModelProbe({
      userId: "alice",
      listProviderIds: () => ["openai"],
      isProviderReady: async () => true,
      listModelIds
    });

    await expect(probe(modelRequirement())).resolves.toEqual({
      status: "unknown",
      message: "Model provider or model type is not specified."
    });
    expect(listModelIds).not.toHaveBeenCalled();
  });

  it("distinguishes unregistered, unconfigured, and absent models", async () => {
    const requirement = modelRequirement({
      provider_ids: ["openai"],
      model_types: ["language_model"]
    });

    await expect(
      createNodeToolSdkV1ModelProbe({
        userId: "alice",
        listProviderIds: () => [],
        isProviderReady: async () => true,
        listModelIds: async () => []
      })(requirement)
    ).resolves.toMatchObject({ status: "unavailable" });

    await expect(
      createNodeToolSdkV1ModelProbe({
        userId: "alice",
        listProviderIds: () => ["openai"],
        isProviderReady: async () => false,
        listModelIds: async () => []
      })(requirement)
    ).resolves.toMatchObject({ status: "unknown" });

    await expect(
      createNodeToolSdkV1ModelProbe({
        userId: "alice",
        listProviderIds: () => ["openai"],
        isProviderReady: async () => true,
        listModelIds: async () => ["other-model"]
      })(requirement)
    ).resolves.toMatchObject({ status: "unavailable" });
  });

  it("bounds a stalled inventory and does not claim the model is absent", async () => {
    const probe = createNodeToolSdkV1ModelProbe({
      userId: "alice",
      timeoutMs: 5,
      listProviderIds: () => ["openai"],
      isProviderReady: async () => true,
      listModelIds: () => new Promise(() => {})
    });

    await expect(
      probe(
        modelRequirement({
          provider_ids: ["openai"],
          model_types: ["language_model"]
        })
      )
    ).resolves.toEqual({
      status: "unknown",
      message: "Model inventory could not be checked."
    });
  });

  it("reports an already-tracked download without starting one", async () => {
    const getModelDownloadStatus = vi.fn(() => "downloading" as const);
    const listModelIds = vi.fn(async () => []);
    const probe = createNodeToolSdkV1ModelProbe({
      userId: "alice",
      listProviderIds: () => ["huggingface"],
      isProviderReady: async () => true,
      listModelIds,
      getModelDownloadStatus
    });

    await expect(
      probe(
        modelRequirement({
          provider_ids: ["huggingface"],
          model_types: ["image_model"]
        })
      )
    ).resolves.toEqual({
      status: "downloading",
      message: "Required model is downloading."
    });
    expect(getModelDownloadStatus).toHaveBeenCalledExactlyOnceWith(
      "alice",
      "huggingface",
      "model-1"
    );
    expect(listModelIds).not.toHaveBeenCalled();
  });

  it("can report a download without a cache inventory adapter", async () => {
    const probe = createNodeToolSdkV1ModelProbe({
      userId: "alice",
      listProviderIds: () => ["huggingface"],
      isProviderReady: async () => false,
      getModelDownloadStatus: () => "downloading"
    });

    await expect(
      probe(
        modelRequirement({
          provider_ids: ["huggingface"],
          model_types: ["image_model"]
        })
      )
    ).resolves.toEqual({
      status: "downloading",
      message: "Required model is downloading."
    });
  });

  it("ignores unsupported model types without probing unrelated inventories", async () => {
    const listModelIds = vi.fn(async () => ["model-1"]);
    const probe = createNodeToolSdkV1ModelProbe({
      userId: "alice",
      listProviderIds: () => ["openai"],
      isProviderReady: async () => true,
      listModelIds
    });

    await expect(
      probe(
        modelRequirement({
          provider_ids: ["openai"],
          model_types: ["future_model_type"]
        })
      )
    ).resolves.toMatchObject({ status: "unknown" });
    expect(listModelIds).not.toHaveBeenCalled();
  });
});
