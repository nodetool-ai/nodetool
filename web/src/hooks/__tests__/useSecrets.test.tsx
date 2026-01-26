import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSecrets } from "../useSecrets";
import useSecretsStore from "../../stores/SecretsStore";
import { SecretResponse } from "../../stores/ApiTypes";

// Mock the SecretsStore
jest.mock("../../stores/SecretsStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn()
  }
}));

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

describe("useSecrets", () => {
  const mockSecrets: SecretResponse[] = [
    {
      id: "1",
      user_id: "user1",
      key: "openai_api_key",
      description: "OpenAI API key",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      is_configured: true
    },
    {
      id: "2",
      user_id: "user1",
      key: "anthropic_api_key",
      description: "Anthropic API key",
      created_at: "2024-01-02T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
      is_configured: true
    },
    {
      id: "3",
      user_id: "user1",
      key: "huggingface_token",
      description: "HuggingFace token",
      created_at: "2024-01-03T00:00:00Z",
      updated_at: "2024-01-03T00:00:00Z",
      is_configured: false
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetching secrets", () => {
    it("fetches and returns secrets successfully", async () => {
      const mockFetchSecrets = jest.fn().mockResolvedValue(mockSecrets);
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets: mockFetchSecrets
      });

      const { result } = renderHook(() => useSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.secrets).toEqual(mockSecrets);
      expect(result.current.isSuccess).toBe(true);
      expect(mockFetchSecrets).toHaveBeenCalled();
    });

    it("returns empty array when no secrets", async () => {
      const mockFetchSecrets = jest.fn().mockResolvedValue([]);
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets: mockFetchSecrets
      });

      const { result } = renderHook(() => useSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.secrets).toEqual([]);
      expect(result.current.isSuccess).toBe(true);
    });

    it("handles fetch error", async () => {
      const mockFetchSecrets = jest.fn().mockRejectedValue(new Error("Failed to fetch"));
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets: mockFetchSecrets
      });

      const { result } = renderHook(() => useSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.secrets).toEqual([]);
      expect(result.current.isSuccess).toBe(false);
    });

    it("caches data for 30 seconds (staleTime)", async () => {
      const mockFetchSecrets = jest.fn().mockResolvedValue(mockSecrets);
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets: mockFetchSecrets
      });

      const { result, rerender } = renderHook(() => useSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First call should fetch
      expect(mockFetchSecrets).toHaveBeenCalledTimes(1);

      // Rerender should use cached data (within staleTime)
      rerender();
      
      // Should still only be called once due to caching
      expect(mockFetchSecrets).toHaveBeenCalledTimes(1);
    });
  });

  describe("isApiKeySet callback", () => {
    it("returns true when API key exists", async () => {
      const mockFetchSecrets = jest.fn().mockResolvedValue(mockSecrets);
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets: mockFetchSecrets
      });

      const { result } = renderHook(() => useSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isApiKeySet("openai_api_key")).toBe(true);
      expect(result.current.isApiKeySet("anthropic_api_key")).toBe(true);
    });

    it("returns true even when API key is not configured", async () => {
      const mockFetchSecrets = jest.fn().mockResolvedValue(mockSecrets);
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets: mockFetchSecrets
      });

      const { result } = renderHook(() => useSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // isApiKeySet checks if key exists, not if it's configured
      expect(result.current.isApiKeySet("huggingface_token")).toBe(true);
    });

    it("returns false when API key does not exist", async () => {
      const mockFetchSecrets = jest.fn().mockResolvedValue(mockSecrets);
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets: mockFetchSecrets
      });

      const { result } = renderHook(() => useSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isApiKeySet("nonexistent_key")).toBe(false);
      expect(result.current.isApiKeySet("")).toBe(false);
    });

    it("returns false when secrets array is empty", async () => {
      const mockFetchSecrets = jest.fn().mockResolvedValue([]);
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets: mockFetchSecrets
      });

      const { result } = renderHook(() => useSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isApiKeySet("any_key")).toBe(false);
    });

    it("memoizes callback based on secrets", async () => {
      const mockFetchSecrets = jest.fn().mockResolvedValue(mockSecrets);
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets: mockFetchSecrets
      });

      const { result, rerender } = renderHook(() => useSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const firstCallback = result.current.isApiKeySet;

      // Rerender without changing secrets
      rerender();

      // Callback should be the same reference
      expect(result.current.isApiKeySet).toBe(firstCallback);
    });
  });

  describe("loading states", () => {
    it("sets isLoading to true during fetch", async () => {
      const mockFetchSecrets = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockSecrets), 100))
      );
      (useSecretsStore.getState as jest.Mock).mockReturnValue({
        fetchSecrets: mockFetchSecrets
      });

      const { result } = renderHook(() => useSecrets(), {
        wrapper: createWrapper(),
      });

      // Initially should be loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isSuccess).toBe(false);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isSuccess).toBe(true);
    });
  });
});
