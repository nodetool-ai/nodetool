import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { useProviders, useProvidersByCapability, useLanguageModelProviders, useTTSProviders } from "../useProviders";

jest.mock("../../stores/ApiClient");

const mockClient = client as jest.Mocked<typeof client>;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "QueryClientWrapper";
  return Wrapper;
};

describe("useProviders", () => {
  const mockProviders = [
    {
      provider: "openai" as const,
      capabilities: ["generate_message", "text_to_embedding", "text_to_image"],
    },
    {
      provider: "anthropic" as const,
      capabilities: ["generate_message"],
    },
    {
      provider: "elevenlabs" as const,
      capabilities: ["text_to_speech"],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("useProviders hook", () => {
    it("fetches and returns providers", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: mockProviders,
        error: null,
      } as any);

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
      mockClient.GET.mockResolvedValueOnce({
        data: [],
        error: null,
      } as any);

      const { result } = renderHook(() => useProviders(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual([]);
    });

    it("handles API error", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: null,
        error: { detail: "Failed to fetch providers" },
      } as any);

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
      mockClient.GET.mockResolvedValueOnce({
        data: mockProviders,
        error: null,
      } as any);

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
      mockClient.GET.mockResolvedValueOnce({
        data: mockProviders,
        error: null,
      } as any);

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
      mockClient.GET.mockResolvedValueOnce({
        data: mockProviders,
        error: null,
      } as any);

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
      mockClient.GET.mockResolvedValueOnce({
        data: mockProviders,
        error: null,
      } as any);

      const { result } = renderHook(() => useTTSProviders(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(1);
      expect(result.current.providers[0].provider).toBe("elevenlabs");
    });
  });
});
