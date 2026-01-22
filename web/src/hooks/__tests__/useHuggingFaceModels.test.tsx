import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHuggingFaceModels } from "../useHuggingFaceModels";
import { client } from "../../stores/ApiClient";

jest.mock("../../stores/ApiClient", () => ({
  client: {
    GET: jest.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useHuggingFaceModels", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading state initially", () => {
    (client.GET as jest.Mock).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useHuggingFaceModels(), {
      wrapper: createWrapper(),
    });

    expect(result.current.hfLoading).toBe(true);
    expect(result.current.hfModels).toBeUndefined();
    expect(result.current.hfError).toBeNull();
  });

  it("fetches models successfully", async () => {
    const mockModels = [
      { id: "model-1", name: "Model 1", type: "text" },
      { id: "model-2", name: "Model 2", type: "image" },
    ];

    (client.GET as jest.Mock).mockResolvedValue({
      data: mockModels,
      error: null,
    });

    const { result } = renderHook(() => useHuggingFaceModels(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.hfLoading).toBe(false);
    });

    expect(result.current.hfModels).toEqual(mockModels);
    expect(result.current.hfError).toBeNull();
    expect(client.GET).toHaveBeenCalledWith("/api/models/huggingface", {});
  });

  it("handles API error", async () => {
    const mockError = new Error("Failed to fetch models");

    (client.GET as jest.Mock).mockResolvedValue({
      data: null,
      error: mockError,
    });

    const { result } = renderHook(() => useHuggingFaceModels(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.hfLoading).toBe(false);
    });

    expect(result.current.hfModels).toBeUndefined();
    expect(result.current.hfError).toBe(mockError);
  });

  it("caches results after first fetch", async () => {
    const mockModels = [{ id: "model-1", name: "Model 1" }];

    (client.GET as jest.Mock).mockResolvedValue({
      data: mockModels,
      error: null,
    });

    const { result, rerender } = renderHook(() => useHuggingFaceModels(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.hfLoading).toBe(false);
    });

    // Clear mock call count
    (client.GET as jest.Mock).mockClear();

    // Re-render - should use cached data
    rerender();

    await waitFor(() => {
      expect(result.current.hfModels).toEqual(mockModels);
    });

    // Should not make another API call on re-render
    expect(client.GET).not.toHaveBeenCalled();
  });

  it("uses correct query key", async () => {
    (client.GET as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    renderHook(() => useHuggingFaceModels(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(client.GET).toHaveBeenCalled();
    });

    // Verify query was made with correct endpoint
    expect(client.GET).toHaveBeenCalledWith("/api/models/huggingface", {});
  });

  it("returns empty array when no models available", async () => {
    (client.GET as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    const { result } = renderHook(() => useHuggingFaceModels(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.hfLoading).toBe(false);
    });

    expect(result.current.hfModels).toEqual([]);
  });
});
