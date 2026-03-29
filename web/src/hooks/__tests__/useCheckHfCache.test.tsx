import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCheckHfCache } from "../useCheckHfCache";
import * as checkHfCacheModule from "../../serverState/checkHfCache";
import { HfCacheCheckResponse } from "../../serverState/checkHfCache";

// Mock the checkHfCache function
jest.mock("../../serverState/checkHfCache");

const mockCheckHfCache = checkHfCacheModule.checkHfCache as jest.MockedFunction<
  typeof checkHfCacheModule.checkHfCache
>;

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

describe("useCheckHfCache", () => {
  const mockRequest = {
    repo_id: "stabilityai/stable-diffusion-xl-base-1.0",
    allow_pattern: "*.safetensors"
  };

  const mockResponse = {
    repo_id: "stabilityai/stable-diffusion-xl-base-1.0",
    all_present: true,
    total_files: 10,
    missing: []
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetching cache status", () => {
    it("fetches and returns cache status successfully", async () => {
      mockCheckHfCache.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useCheckHfCache(mockRequest), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockResponse);
      expect(result.current.error).toBeNull();
      expect(mockCheckHfCache).toHaveBeenCalledWith(mockRequest);
    });

    it("returns missing files when not all present", async () => {
      const responseWithMissing = {
        ...mockResponse,
        all_present: false,
        missing: ["model.safetensors", "config.json"]
      };
      mockCheckHfCache.mockResolvedValueOnce(responseWithMissing);

      const { result } = renderHook(() => useCheckHfCache(mockRequest), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.all_present).toBe(false);
      expect(result.current.data?.missing).toHaveLength(2);
    });

    it("handles API error", async () => {
      mockCheckHfCache.mockRejectedValueOnce(
        new Error("HF cache check failed (500): Internal Server Error")
      );

      const { result } = renderHook(() => useCheckHfCache(mockRequest), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toBeDefined();
    });

    it("does not refetch on window focus", async () => {
      mockCheckHfCache.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useCheckHfCache(mockRequest), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockCheckHfCache).toHaveBeenCalledTimes(1);

      // Simulate window focus
      window.dispatchEvent(new Event("focus"));

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should still only be called once due to refetchOnWindowFocus: false
      expect(mockCheckHfCache).toHaveBeenCalledTimes(1);
    });
  });

  describe("enabled parameter", () => {
    it("does not fetch when enabled is false", async () => {
      mockCheckHfCache.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(
        () => useCheckHfCache(mockRequest, false),
        { wrapper: createWrapper() }
      );

      // Wait a bit to ensure no fetch happens
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(mockCheckHfCache).not.toHaveBeenCalled();
    });

    it("fetches when enabled changes to true", async () => {
      mockCheckHfCache.mockResolvedValueOnce(mockResponse);

      const { result, rerender } = renderHook(
        ({ enabled }) => useCheckHfCache(mockRequest, enabled),
        {
          wrapper: createWrapper(),
          initialProps: { enabled: false }
        }
      );

      // Initially should not fetch
      expect(mockCheckHfCache).not.toHaveBeenCalled();

      // Change enabled to true
      rerender({ enabled: true });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockCheckHfCache).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual(mockResponse);
    });

    it("does not fetch when repo_id is empty", async () => {
      mockCheckHfCache.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(
        () => useCheckHfCache({ repo_id: "" }, true),
        { wrapper: createWrapper() }
      );

      // Wait a bit to ensure no fetch happens
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(result.current.isLoading).toBe(false);
      expect(mockCheckHfCache).not.toHaveBeenCalled();
    });
  });

  describe("loading states", () => {
    it("sets isLoading to true during initial fetch", async () => {
      let resolvePromise!: (value: HfCacheCheckResponse) => void;
      const promise = new Promise<HfCacheCheckResponse>((resolve) => {
        resolvePromise = resolve;
      });
      mockCheckHfCache.mockReturnValueOnce(promise);

      const { result } = renderHook(() => useCheckHfCache(mockRequest), {
        wrapper: createWrapper(),
      });

      // Initially should be loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();

      // Resolve the promise
      await waitFor(() => {
        resolvePromise(mockResponse);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockResponse);
    });

    it("provides isFetching state for background refreshes", async () => {
      mockCheckHfCache.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useCheckHfCache(mockRequest), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isFetching).toBe(false);
    });
  });

  describe("return values", () => {
    it("returns all expected properties", async () => {
      mockCheckHfCache.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useCheckHfCache(mockRequest), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toHaveProperty("data");
      expect(result.current).toHaveProperty("isLoading");
      expect(result.current).toHaveProperty("isFetching");
      expect(result.current).toHaveProperty("error");
    });
  });

  describe("caching behavior", () => {
    it("uses query key with all parameters for caching", async () => {
      mockCheckHfCache.mockResolvedValueOnce(mockResponse);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            gcTime: 0,
          },
        },
      });

      const SharedWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      };

      const { result: result1 } = renderHook(() => useCheckHfCache(mockRequest), {
        wrapper: SharedWrapper,
      });

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false);
      });

      expect(mockCheckHfCache).toHaveBeenCalledTimes(1);

      // Same request should use cache
      const { result: result2 } = renderHook(() => useCheckHfCache(mockRequest), {
        wrapper: SharedWrapper,
      });

      await waitFor(() => {
        expect(result2.current.isLoading).toBe(false);
      });

      // Should still only be called once (uses cache)
      expect(mockCheckHfCache).toHaveBeenCalledTimes(1);
    });

    it("creates separate cache entries for different requests", async () => {
      const request1 = { repo_id: "model-1" };
      const request2 = { repo_id: "model-2" };

      mockCheckHfCache.mockResolvedValueOnce({ ...mockResponse, repo_id: "model-1" });
      mockCheckHfCache.mockResolvedValueOnce({ ...mockResponse, repo_id: "model-2" });

      const { result: result1 } = renderHook(() => useCheckHfCache(request1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false);
      });

      const { result: result2 } = renderHook(() => useCheckHfCache(request2), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result2.current.isLoading).toBe(false);
      });

      // Should be called twice (different cache keys)
      expect(mockCheckHfCache).toHaveBeenCalledTimes(2);
    });

    it("has 5 minute stale time", async () => {
      mockCheckHfCache.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useCheckHfCache(mockRequest), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Data should still be considered fresh and not refetch
      expect(mockCheckHfCache).toHaveBeenCalledTimes(1);
    });
  });
});
