import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useOllamaModels } from "../useOllamaModels";
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

describe("useOllamaModels", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading state initially", () => {
    (client.GET as jest.Mock).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useOllamaModels(), {
      wrapper: createWrapper(),
    });

    expect(result.current.ollamaLoading).toBe(true);
    expect(result.current.ollamaModels).toBeUndefined();
    expect(result.current.ollamaError).toBeNull();
  });

  it("fetches models successfully", async () => {
    const mockModels = [
      { id: "llama2", name: "Llama 2", size: "7B" },
      { id: "mistral", name: "Mistral", size: "7B" },
    ];

    (client.GET as jest.Mock).mockResolvedValue({
      data: mockModels,
      error: null,
    });

    const { result } = renderHook(() => useOllamaModels(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.ollamaLoading).toBe(false);
    });

    expect(result.current.ollamaModels).toEqual(mockModels);
    expect(result.current.ollamaError).toBeNull();
    expect(client.GET).toHaveBeenCalledWith("/api/models/ollama", {});
  });

  it("handles API error", async () => {
    const mockError = new Error("Failed to fetch Ollama models");

    (client.GET as jest.Mock).mockResolvedValue({
      data: null,
      error: mockError,
    });

    const { result } = renderHook(() => useOllamaModels(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.ollamaLoading).toBe(false);
    });

    expect(result.current.ollamaModels).toBeUndefined();
    expect(result.current.ollamaError).toBe(mockError);
  });

  it("caches results after first fetch", async () => {
    const mockModels = [{ id: "llama2", name: "Llama 2" }];

    (client.GET as jest.Mock).mockResolvedValue({
      data: mockModels,
      error: null,
    });

    const { result, rerender } = renderHook(() => useOllamaModels(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.ollamaLoading).toBe(false);
    });

    // Clear mock call count
    (client.GET as jest.Mock).mockClear();

    // Re-render - should use cached data
    rerender();

    await waitFor(() => {
      expect(result.current.ollamaModels).toEqual(mockModels);
    });

    // Should not make another API call on re-render
    expect(client.GET).not.toHaveBeenCalled();
  });

  it("uses correct query key and endpoint", async () => {
    (client.GET as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    renderHook(() => useOllamaModels(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(client.GET).toHaveBeenCalled();
    });

    // Verify query was made with correct endpoint
    expect(client.GET).toHaveBeenCalledWith("/api/models/ollama", {});
  });

  it("returns empty array when no models available", async () => {
    (client.GET as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    const { result } = renderHook(() => useOllamaModels(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.ollamaLoading).toBe(false);
    });

    expect(result.current.ollamaModels).toEqual([]);
  });

  it("handles null response data", async () => {
    (client.GET as jest.Mock).mockResolvedValue({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useOllamaModels(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.ollamaLoading).toBe(false);
    });

    expect(result.current.ollamaModels).toBeNull();
  });
});
