/**
 * @jest-environment jsdom
 */
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockAll = jest.fn();
const mockHuggingfaceList = jest.fn();

jest.mock("../../../../lib/trpc", () => ({
  trpc: {
    models: {
      all: { query: (...args: unknown[]) => mockAll(...args) },
      huggingfaceList: {
        query: (...args: unknown[]) => mockHuggingfaceList(...args)
      }
    }
  }
}));

import { useModels } from "../useModels";
import { useModelManagerStore } from "../../../../stores/ModelManagerStore";
import { useHfCacheStatusStore } from "../../../../stores/HfCacheStatusStore";
import { getHfCacheKey } from "../../../../utils/hfCache";
import type { UnifiedModel } from "../../../../stores/ApiTypes";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  mockAll.mockReset().mockResolvedValue([]);
  mockHuggingfaceList.mockReset().mockResolvedValue([
    {
      id: "org/m",
      name: "org/m",
      repo_id: "org/m",
      type: "hf.text_generation",
      downloaded: true
    }
  ]);
  useHfCacheStatusStore.setState({ statuses: {} });
  useModelManagerStore.setState({
    filterStatus: "all",
    modelSearchTerm: "",
    selectedModelType: "All",
    maxModelSizeGB: undefined
  });
});

describe("useModels scope", () => {
  it("local scope (default) queries models.all", async () => {
    renderHook(() => useModels(), { wrapper });
    await waitFor(() => expect(mockAll).toHaveBeenCalled());
    expect(mockHuggingfaceList).not.toHaveBeenCalled();
  });

  it("worker scope calls huggingfaceList with scope=worker", async () => {
    const { result } = renderHook(() => useModels("worker"), { wrapper });
    await waitFor(() =>
      expect(mockHuggingfaceList).toHaveBeenCalledWith({ scope: "worker" })
    );
    await waitFor(() =>
      expect(result.current.allModels?.[0]?.repo_id).toBe("org/m")
    );
    expect(mockAll).not.toHaveBeenCalled();
  });

  it("worker scope ignores the LOCAL cache and trusts the model's downloaded flag", async () => {
    const model = {
      id: "org/m",
      name: "org/m",
      repo_id: "org/m",
      type: "hf.text_generation",
      downloaded: true
    };
    mockHuggingfaceList.mockResolvedValue([model]);
    // Local cache reports this repo as NOT downloaded (it isn't present locally).
    const cacheKey = getHfCacheKey(model as unknown as UnifiedModel);
    useHfCacheStatusStore.setState({ statuses: { [cacheKey]: false } });
    useModelManagerStore.setState({ filterStatus: "downloaded" });

    const { result } = renderHook(() => useModels("worker"), { wrapper });
    await waitFor(() =>
      expect(result.current.allModels?.length).toBe(1)
    );
    // Despite the local cache saying false, the worker-cached model is shown.
    expect(result.current.filteredModels.map((m) => m.repo_id)).toEqual([
      "org/m"
    ]);
  });

  it("local scope honors the LOCAL cache (hides a repo the cache says is absent)", async () => {
    const model = {
      id: "org/m",
      name: "org/m",
      repo_id: "org/m",
      type: "hf.text_generation",
      downloaded: true
    };
    mockAll.mockResolvedValue([model]);
    const cacheKey = getHfCacheKey(model as unknown as UnifiedModel);
    useHfCacheStatusStore.setState({ statuses: { [cacheKey]: false } });
    useModelManagerStore.setState({ filterStatus: "downloaded" });

    const { result } = renderHook(() => useModels("local"), { wrapper });
    await waitFor(() =>
      expect(result.current.allModels?.length).toBe(1)
    );
    // Local cache is authoritative here — the model is filtered out.
    expect(result.current.filteredModels).toEqual([]);
  });
});
