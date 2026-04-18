import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import { useOllamaModels } from "../useOllamaModels";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    models: {
      ollama: { query: jest.fn() }
    }
  }
}));

const mockQuery = trpc.models.ollama.query as jest.Mock;

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

const createWrapper = () => TestWrapper;

describe("useOllamaModels", () => {
  const mockOllamaModels = [
    {
      id: "llama3-8b",
      name: "Llama 3 8B",
      size: 4500000000,
      modified: "2024-01-01T00:00:00Z"
    },
    {
      id: "mistral-7b",
      name: "Mistral 7B",
      size: 4200000000,
      modified: "2024-01-02T00:00:00Z"
    },
    {
      id: "codellama-13b",
      name: "Code Llama 13B",
      size: 7300000000,
      modified: "2024-01-03T00:00:00Z"
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetching models", () => {
    it("fetches and returns Ollama models successfully", async () => {
      mockQuery.mockResolvedValueOnce(mockOllamaModels as never);

      const { result } = renderHook(() => useOllamaModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.ollamaLoading).toBe(false);
      });

      expect(result.current.ollamaModels).toEqual(mockOllamaModels);
      expect(result.current.ollamaError).toBeNull();
      expect(mockQuery).toHaveBeenCalled();
    });

    it("returns undefined when no models available", async () => {
      mockQuery.mockResolvedValueOnce([] as never);

      const { result } = renderHook(() => useOllamaModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.ollamaLoading).toBe(false);
      });

      expect(result.current.ollamaModels).toEqual([]);
      expect(result.current.ollamaError).toBeNull();
    });

    it("handles API error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Failed to fetch Ollama models"));

      const { result } = renderHook(() => useOllamaModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.ollamaLoading).toBe(false);
      });

      expect(result.current.ollamaModels).toBeUndefined();
      expect(result.current.ollamaError).toBeDefined();
    });

    it("handles network error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useOllamaModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.ollamaLoading).toBe(false);
      });

      expect(result.current.ollamaModels).toBeUndefined();
      expect(result.current.ollamaError).toBeDefined();
    });

    it("does not refetch on window focus", async () => {
      mockQuery.mockResolvedValueOnce(mockOllamaModels as never);

      const { result } = renderHook(() => useOllamaModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.ollamaLoading).toBe(false);
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);

      // Simulate window focus
      window.dispatchEvent(new Event("focus"));

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should still only be called once due to refetchOnWindowFocus: false
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe("loading states", () => {
    it("sets ollamaLoading to true during initial fetch", async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockQuery.mockReturnValueOnce(promise);

      const { result } = renderHook(() => useOllamaModels(), {
        wrapper: createWrapper(),
      });

      // Initially should be loading
      expect(result.current.ollamaLoading).toBe(true);
      expect(result.current.ollamaModels).toBeUndefined();

      // Resolve the promise
      await waitFor(() => {
        resolvePromise(mockOllamaModels);
      });

      await waitFor(() => {
        expect(result.current.ollamaLoading).toBe(false);
      });

      expect(result.current.ollamaModels).toEqual(mockOllamaModels);
    });

    it("provides isFetching state for background refreshes", async () => {
      mockQuery.mockResolvedValueOnce(mockOllamaModels as never);

      const { result } = renderHook(() => useOllamaModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.ollamaLoading).toBe(false);
      });

      expect(result.current.ollamaIsFetching).toBe(false);
    });
  });

  describe("return values", () => {
    it("returns all expected properties", async () => {
      mockQuery.mockResolvedValueOnce(mockOllamaModels as never);

      const { result } = renderHook(() => useOllamaModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.ollamaLoading).toBe(false);
      });

      expect(result.current).toHaveProperty("ollamaModels");
      expect(result.current).toHaveProperty("ollamaLoading");
      expect(result.current).toHaveProperty("ollamaIsFetching");
      expect(result.current).toHaveProperty("ollamaError");
    });

    it("maintains stable references when data doesn't change", async () => {
      mockQuery.mockResolvedValueOnce(mockOllamaModels as never);

      const { result, rerender } = renderHook(() => useOllamaModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.ollamaLoading).toBe(false);
      });

      const firstModels = result.current.ollamaModels;

      // Rerender
      rerender();

      // Should be the same reference (no new fetch)
      expect(result.current.ollamaModels).toBe(firstModels);
    });
  });

  describe("error handling", () => {
    it("provides error details when API call fails", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Ollama service not available"));

      const { result } = renderHook(() => useOllamaModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.ollamaLoading).toBe(false);
      });

      expect(result.current.ollamaError).toBeTruthy();
      expect(result.current.ollamaModels).toBeUndefined();
    });

    it("handles empty error response", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Unknown error"));

      const { result } = renderHook(() => useOllamaModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.ollamaLoading).toBe(false);
      });

      expect(result.current.ollamaError).toBeTruthy();
    });
  });

  describe("caching behavior", () => {
    it("uses query key for caching", async () => {
      mockQuery.mockResolvedValueOnce(mockOllamaModels as never);

      const { result: result1 } = renderHook(() => useOllamaModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result1.current.ollamaLoading).toBe(false);
      });

      // First hook should fetch
      expect(mockQuery).toHaveBeenCalledTimes(1);

      // Create a new QueryClient for a truly independent test
      const queryClient2 = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            gcTime: 0,
          },
        },
      });

      const TestWrapper2: React.FC<{ children: React.ReactNode }> = ({ children }) => {
        return <QueryClientProvider client={queryClient2}>{children}</QueryClientProvider>;
      };

      mockQuery.mockResolvedValueOnce(mockOllamaModels as never);

      const { result: result2 } = renderHook(() => useOllamaModels(), {
        wrapper: TestWrapper2,
      });

      await waitFor(() => {
        expect(result2.current.ollamaLoading).toBe(false);
      });

      // Second hook in different context should also fetch
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });
});
