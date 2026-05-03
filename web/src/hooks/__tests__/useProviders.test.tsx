import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import {
  useProviders,
  useProvidersByCapability,
  useLanguageModelProviders,
  useTTSProviders
} from "../useProviders";

jest.mock("../../lib/trpc", () => ({
  trpc: {
    models: {
      providers: { query: jest.fn() }
    }
  }
}));

const mockQuery = trpc.models.providers.query as jest.Mock;

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

describe("useProviders", () => {
  const mockProviders = [
    {
      provider: "openai",
      capabilities: ["generate_message", "text_to_embedding", "text_to_image"],
    },
    {
      provider: "anthropic",
      capabilities: ["generate_message"],
    },
    {
      provider: "openai",
      capabilities: ["text_to_speech"],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("useProviders hook", () => {
    it("fetches and returns providers", async () => {
      mockQuery.mockResolvedValueOnce(mockProviders as never);

      const { result } = renderHook(() => useProviders(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual(mockProviders);
      expect(result.current.error).toBeNull();
    });

    it("returns empty array when no providers", async () => {
      mockQuery.mockResolvedValueOnce([] as never);

      const { result } = renderHook(() => useProviders(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual([]);
    });

    it("handles API error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Failed to fetch providers"));

      const { result } = renderHook(() => useProviders(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe("capability filtering", () => {
    it("filters providers by capability", async () => {
      mockQuery.mockResolvedValueOnce(mockProviders as never);

      const { result } = renderHook(() => useProvidersByCapability("generate_message"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers.map((p) => p.provider)).toContain("openai");
      expect(result.current.providers.map((p) => p.provider)).toContain("anthropic");
    });

    it("returns empty array when no providers match capability", async () => {
      mockQuery.mockResolvedValueOnce(mockProviders as never);

      const { result } = renderHook(() => useProvidersByCapability("text_to_video"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual([]);
    });
  });

  describe("specific provider type hooks", () => {
    it("useLanguageModelProviders returns correct providers", async () => {
      mockQuery.mockResolvedValueOnce(mockProviders as never);

      const { result } = renderHook(() => useLanguageModelProviders(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers.map((p) => p.provider)).toContain("openai");
      expect(result.current.providers.map((p) => p.provider)).toContain("anthropic");
    });

    it("useTTSProviders returns correct providers", async () => {
      mockQuery.mockResolvedValueOnce(mockProviders as never);

      const { result } = renderHook(() => useTTSProviders(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(1);
      expect(result.current.providers[0].provider).toBe("openai");
    });
  });
});
