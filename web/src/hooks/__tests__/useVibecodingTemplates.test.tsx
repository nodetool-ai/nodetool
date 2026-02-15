import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useVibecodingTemplates } from "../useVibecodingTemplates";
import { authHeader } from "../../stores/ApiClient";
import { BASE_URL } from "../../stores/BASE_URL";

// Mock the dependencies
jest.mock("../../stores/ApiClient");
jest.mock("../../stores/BASE_URL", () => ({ BASE_URL: "http://localhost:8000" }));

const mockAuthHeader = authHeader as jest.MockedFunction<typeof authHeader>;

global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

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

describe("useVibecodingTemplates", () => {
  const mockTemplates = [
    {
      id: "template-1",
      name: "Create Landing Page",
      description: "Generate a modern landing page",
      prompt: "Create a landing page with hero section"
    },
    {
      id: "template-2",
      name: "Build Form",
      description: "Generate a contact form",
      prompt: "Create a contact form with validation"
    },
    {
      id: "template-3",
      name: "Dashboard Layout",
      description: "Generate a dashboard layout",
      prompt: "Create a dashboard with sidebar and charts"
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthHeader.mockResolvedValue({
      Authorization: "Bearer test-token"
    });
  });

  describe("fetching templates", () => {
    it("fetches and returns templates successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTemplates,
      } as Response);

      const { result } = renderHook(() => useVibecodingTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.templates).toEqual(mockTemplates);
      expect(result.current.error).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/vibecoding/templates`,
        { headers: { Authorization: "Bearer test-token" } }
      );
    });

    it("returns empty when no templates available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);

      const { result } = renderHook(() => useVibecodingTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.templates).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it("handles API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response);

      const { result } = renderHook(() => useVibecodingTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.templates).toBeUndefined();
      expect(result.current.error).toBeDefined();
    });

    it("handles network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useVibecodingTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.templates).toBeUndefined();
      expect(result.current.error).toBeDefined();
    });

    it("does not refetch on window focus", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTemplates,
      } as Response);

      const { result } = renderHook(() => useVibecodingTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Simulate window focus
      window.dispatchEvent(new Event("focus"));

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should still only be called once due to refetchOnWindowFocus: false
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not retry on failure", async () => {
      mockFetch.mockRejectedValue(new Error("API error"));

      const { result } = renderHook(() => useVibecodingTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should only be called once (no retries)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBeDefined();
    });
  });

  describe("loading states", () => {
    it("sets isLoading to true during initial fetch", async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValueOnce(promise as any);

      const { result } = renderHook(() => useVibecodingTemplates(), {
        wrapper: createWrapper(),
      });

      // Initially should be loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.templates).toBeUndefined();

      // Resolve the promise
      await waitFor(() => {
        resolvePromise({ ok: true, json: async () => mockTemplates });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.templates).toEqual(mockTemplates);
    });

    it("provides isFetching state for background refreshes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTemplates,
      } as Response);

      const { result } = renderHook(() => useVibecodingTemplates(), {
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTemplates,
      } as Response);

      const { result } = renderHook(() => useVibecodingTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toHaveProperty("templates");
      expect(result.current).toHaveProperty("isLoading");
      expect(result.current).toHaveProperty("isFetching");
      expect(result.current).toHaveProperty("error");
    });

    it("maintains stable references when data doesn't change", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTemplates,
      } as Response);

      const { result, rerender } = renderHook(() => useVibecodingTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const firstTemplates = result.current.templates;

      // Rerender
      rerender();

      // Should be the same reference (no new fetch)
      expect(result.current.templates).toBe(firstTemplates);
    });
  });

  describe("error handling", () => {
    it("provides error details when fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      const { result } = renderHook(() => useVibecodingTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.templates).toBeUndefined();
    });
  });

  describe("caching behavior", () => {
    it("uses query key for caching", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTemplates,
      } as Response);

      const { result: result1 } = renderHook(() => useVibecodingTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false);
      });

      // First hook should fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);

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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTemplates,
      } as Response);

      const { result: result2 } = renderHook(() => useVibecodingTemplates(), {
        wrapper: TestWrapper2,
      });

      await waitFor(() => {
        expect(result2.current.isLoading).toBe(false);
      });

      // Second hook in different context should also fetch
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
