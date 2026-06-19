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
});
