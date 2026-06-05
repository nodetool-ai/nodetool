/**
 * @jest-environment node
 */
jest.mock("../../lib/trpc", () => ({
  trpc: {
    models: {
      huggingfaceCacheStatus: {
        mutate: jest.fn(),
      },
    },
  },
}));

import { checkHfCacheStatus } from "../checkHfCacheStatus";
import type { HfCacheStatusRequestItem, HfCacheStatusResponseItem } from "../checkHfCacheStatus";
import { trpc } from "../../lib/trpc";

const mockMutate = trpc.models.huggingfaceCacheStatus.mutate as jest.Mock;

describe("checkHfCacheStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty array for empty input", async () => {
    const result = await checkHfCacheStatus([]);
    expect(result).toEqual([]);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("calls trpc mutate with items", async () => {
    const items: HfCacheStatusRequestItem[] = [
      { key: "model-1", repo_id: "meta-llama/Llama-3-8B" },
      { key: "model-2", repo_id: "stabilityai/stable-diffusion-xl" },
    ];
    const response: HfCacheStatusResponseItem[] = [
      { key: "model-1", downloaded: true },
      { key: "model-2", downloaded: false },
    ];
    mockMutate.mockResolvedValue(response);

    const result = await checkHfCacheStatus(items);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(items);
    expect(result).toEqual(response);
  });

  it("passes through optional fields", async () => {
    const items: HfCacheStatusRequestItem[] = [
      {
        key: "model-1",
        repo_id: "org/model",
        model_type: "text-generation",
        path: "/path/to/model",
        allow_patterns: ["*.safetensors"],
        ignore_patterns: ["*.bin"],
      },
    ];
    mockMutate.mockResolvedValue([{ key: "model-1", downloaded: true }]);

    await checkHfCacheStatus(items);

    expect(mockMutate).toHaveBeenCalledWith(items);
  });

  it("propagates trpc errors", async () => {
    mockMutate.mockRejectedValue(new Error("Network error"));

    const items: HfCacheStatusRequestItem[] = [
      { key: "model-1", repo_id: "org/model" },
    ];

    await expect(checkHfCacheStatus(items)).rejects.toThrow("Network error");
  });
});
