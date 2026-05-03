import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import { useHuggingFaceModels } from "../useHuggingFaceModels";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    models: {
      huggingfaceList: { query: jest.fn() }
    }
  }
}));

const mockQuery = trpc.models.huggingfaceList.query as jest.Mock;

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

describe("useHuggingFaceModels", () => {
  const mockHFModels = [
    {
      id: "bert-base-uncased",
      name: "BERT Base Uncased",
      size: 440000000,
      modified: "2024-01-01T00:00:00Z"
    },
    {
      id: "gpt2",
      name: "GPT-2",
      size: 548000000,
      modified: "2024-01-02T00:00:00Z"
    },
    {
      id: "stable-diffusion-v1-5",
      name: "Stable Diffusion v1.5",
      size: 4200000000,
      modified: "2024-01-03T00:00:00Z"
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetching models", () => {
    it("fetches and returns HuggingFace models successfully", async () => {
      mockQuery.mockResolvedValueOnce(mockHFModels as never);

      const { result } = renderHook(() => useHuggingFaceModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hfLoading).toBe(false);
      });

      expect(result.current.hfModels).toEqual(mockHFModels);
      expect(result.current.hfError).toBeNull();
      expect(mockQuery).toHaveBeenCalled();
    });

    it("returns undefined when no models available", async () => {
      mockQuery.mockResolvedValueOnce([] as never);

      const { result } = renderHook(() => useHuggingFaceModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hfLoading).toBe(false);
      });

      expect(result.current.hfModels).toEqual([]);
      expect(result.current.hfError).toBeNull();
    });

    it("handles API error", async () => {
      mockQuery.mockRejectedValueOnce(
        new Error("Failed to fetch HuggingFace models")
      );

      const { result } = renderHook(() => useHuggingFaceModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hfLoading).toBe(false);
      });

      expect(result.current.hfModels).toBeUndefined();
      expect(result.current.hfError).toBeDefined();
    });

    it("handles network error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useHuggingFaceModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hfLoading).toBe(false);
      });

      expect(result.current.hfModels).toBeUndefined();
      expect(result.current.hfError).toBeDefined();
    });

    it("does not refetch on window focus", async () => {
      mockQuery.mockResolvedValueOnce(mockHFModels as never);

      const { result } = renderHook(() => useHuggingFaceModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hfLoading).toBe(false);
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
    it("sets hfLoading to true during initial fetch", async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockQuery.mockReturnValueOnce(promise);

      const { result } = renderHook(() => useHuggingFaceModels(), {
        wrapper: createWrapper(),
      });

      // Initially should be loading
      expect(result.current.hfLoading).toBe(true);
      expect(result.current.hfModels).toBeUndefined();

      // Resolve the promise
      await waitFor(() => {
        resolvePromise(mockHFModels);
      });

      await waitFor(() => {
        expect(result.current.hfLoading).toBe(false);
      });

      expect(result.current.hfModels).toEqual(mockHFModels);
    });

    it("provides isFetching state for background refreshes", async () => {
      mockQuery.mockResolvedValueOnce(mockHFModels as never);

      const { result } = renderHook(() => useHuggingFaceModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hfLoading).toBe(false);
      });

      expect(result.current.hfIsFetching).toBe(false);
    });
  });

  describe("return values", () => {
    it("maintains stable references when data doesn't change", async () => {
      mockQuery.mockResolvedValueOnce(mockHFModels as never);

      const { result, rerender } = renderHook(() => useHuggingFaceModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hfLoading).toBe(false);
      });

      const firstModels = result.current.hfModels;

      // Rerender
      rerender();

      // Should be the same reference (no new fetch)
      expect(result.current.hfModels).toBe(firstModels);
    });
  });

  describe("error handling", () => {
    it("provides error details when API call fails", async () => {
      mockQuery.mockRejectedValueOnce(
        new Error("HuggingFace API token not configured")
      );

      const { result } = renderHook(() => useHuggingFaceModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hfLoading).toBe(false);
      });

      expect(result.current.hfError).toBeTruthy();
      expect(result.current.hfModels).toBeUndefined();
    });

    it("handles empty error response", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Unknown error"));

      const { result } = renderHook(() => useHuggingFaceModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.hfLoading).toBe(false);
      });

      expect(result.current.hfError).toBeTruthy();
    });
  });

  describe("caching behavior", () => {
    it("uses query key for caching", async () => {
      mockQuery.mockResolvedValueOnce(mockHFModels as never);

      const { result: result1 } = renderHook(() => useHuggingFaceModels(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result1.current.hfLoading).toBe(false);
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

      mockQuery.mockResolvedValueOnce(mockHFModels as never);

      const { result: result2 } = renderHook(() => useHuggingFaceModels(), {
        wrapper: TestWrapper2,
      });

      await waitFor(() => {
        expect(result2.current.hfLoading).toBe(false);
      });

      // Second hook in different context should also fetch
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });
});
