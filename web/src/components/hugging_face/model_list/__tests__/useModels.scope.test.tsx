/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
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

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
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
    source: "installed",
    modelSearchTerm: "",
    selectedModelType: "All",
    selectedAvailability: "all",
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

  it("counts and filters installed models by execution availability", async () => {
    mockAll.mockResolvedValue([
      {
        id: "org/ready",
        name: "Ready",
        type: "hf.text_to_speech",
        execution: {
          kind: "local",
          state: "ready",
          label: "Local",
          reason: "Runs on this device."
        }
      },
      {
        id: "org/unavailable",
        name: "Unavailable",
        type: "hf.text_to_speech",
        execution: {
          kind: "local",
          state: "unavailable",
          label: "Unavailable",
          reason: "No compatible adapter is installed."
        }
      }
    ]);

    const { result } = renderHook(() => useModels(), { wrapper });
    await waitFor(() => expect(result.current.allModels).toHaveLength(2));
    expect(result.current.availabilityCounts).toEqual({
      all: 2,
      ready: 1,
      download_required: 0,
      unavailable: 1
    });

    act(() => useModelManagerStore.setState({ modelSearchTerm: "Ready" }));
    await waitFor(() =>
      expect(result.current.availabilityCounts).toEqual({
        all: 1,
        ready: 1,
        download_required: 0,
        unavailable: 0
      })
    );

    act(() =>
      useModelManagerStore.setState({
        modelSearchTerm: "",
        selectedAvailability: "unavailable"
      })
    );
    await waitFor(() =>
      expect(result.current.filteredModels.map((model) => model.id)).toEqual([
        "org/unavailable"
      ])
    );
  });
});
