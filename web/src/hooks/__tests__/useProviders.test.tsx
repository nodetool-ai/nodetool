import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";

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
  Wrapper.displayName = "QueryClientProviderWrapper";
  return Wrapper;
};

describe("useProviders", () => {
  const mockProviders = [
    {
      name: "openai",
      display_name: "OpenAI",
      capabilities: ["generate_message", "text_to_embedding", "text_to_image"],
      default_model: "gpt-4",
    },
    {
      name: "anthropic",
      display_name: "Anthropic",
      capabilities: ["generate_message"],
      default_model: "claude-3-opus",
    },
    {
      name: "elevenlabs",
      display_name: "ElevenLabs",
      capabilities: ["text_to_speech"],
      default_model: "eleven_multilingual_v2",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("useProviders hook", () => {
    it("fetches and returns providers", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: mockProviders,
        error: undefined,
        response: {} as Response,
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useProviders } = require("../../hooks/useProviders");
        return useProviders();
      }, {
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
        error: undefined,
        response: {} as Response,
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useProviders } = require("../../hooks/useProviders");
        return useProviders();
      }, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual([]);
    });

    it("handles API error", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: undefined,
        error: { detail: "Failed to fetch providers" },
        response: {} as Response,
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useProviders } = require("../../hooks/useProviders");
        return useProviders();
      }, {
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
        error: undefined,
        response: {} as Response,
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useProvidersByCapability } = require("../../hooks/useProviders");
        return useProvidersByCapability("generate_message");
      }, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers.map((p: { name: string }) => p.name)).toContain("openai");
      expect(result.current.providers.map((p: { name: string }) => p.name)).toContain("anthropic");
    });

    it("returns empty array when no providers match capability", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: mockProviders,
        error: undefined,
        response: {} as Response,
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useProvidersByCapability } = require("../../hooks/useProviders");
        return useProvidersByCapability("text_to_video");
      }, {
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
        error: undefined,
        response: {} as Response,
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useLanguageModelProviders } = require("../../hooks/useProviders");
        return useLanguageModelProviders();
      }, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers.map((p: { name: string }) => p.name)).toContain("openai");
      expect(result.current.providers.map((p: { name: string }) => p.name)).toContain("anthropic");
    });

    it("useTTSProviders returns correct providers", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: mockProviders,
        error: undefined,
        response: {} as Response,
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useTTSProviders } = require("../../hooks/useProviders");
        return useTTSProviders();
      }, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(1);
      expect(result.current.providers[0].name).toBe("elevenlabs");
    });
  });
});
