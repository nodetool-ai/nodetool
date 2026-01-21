import { renderHook, waitFor } from "@testing-library/react";
import {
  useProviders,
  useProvidersByCapability,
  useLanguageModelProviders,
  useImageModelProviders,
  useTTSProviders,
  useASRProviders,
  useVideoProviders,
  useEmbeddingProviders,
} from "../useProviders";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";

jest.mock("../../stores/ApiClient", () => ({
  client: {
    GET: jest.fn(),
  },
}));

describe("useProviders", () => {

  const createQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });

  const createWrapper = (queryClient: QueryClient) => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return Wrapper;
  };

  const mockProviders = [
    {
      provider: "openai",
      capabilities: ["generate_message", "text_to_image", "text_to_speech"],
    },
    {
      provider: "anthropic",
      capabilities: ["generate_message"],
    },
    {
      provider: "huggingface_zai",
      capabilities: ["text_to_image", "text_to_audio", "automatic_speech_recognition"],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("useProviders", () => {
    it("fetches providers successfully", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: mockProviders,
        error: null,
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useProviders(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual(mockProviders);
      expect(result.current.error).toBeNull();
    });

    it("handles empty providers", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useProviders(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual([]);
    });

    it("handles API errors", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: "Failed to fetch providers" },
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useProviders(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(!!result.current.error).toBe(true);
      expect(result.current.providers).toEqual([]);
    });

    it("returns loading state initially", () => {
      (client.GET as jest.Mock).mockReturnValue(new Promise(() => {}));

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useProviders(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.providers).toEqual([]);
    });

    it("tracks fetching state", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: mockProviders,
        error: null,
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useProviders(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.isFetching).toBe(true);

      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });
    });
  });

  describe("useProvidersByCapability", () => {
    it("filters providers by capability", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: mockProviders,
        error: null,
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useProvidersByCapability("generate_message"), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers[0].provider).toBe("openai");
      expect(result.current.providers[1].provider).toBe("anthropic");
    });

    it("returns empty array when no providers match capability", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: mockProviders,
        error: null,
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(
        () => useProvidersByCapability("nonexistent_capability"),
        {
          wrapper: createWrapper(queryClient),
        }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual([]);
    });
  });

  describe("capability-specific hooks", () => {
    it("useLanguageModelProviders returns providers with generate_message capability", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: mockProviders,
        error: null,
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useLanguageModelProviders(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers.every((p) => p.capabilities.includes("generate_message"))).toBe(
        true
      );
    });

    it("useImageModelProviders returns providers with text_to_image capability", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: mockProviders,
        error: null,
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useImageModelProviders(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers[0].provider).toBe("openai");
      expect(result.current.providers[1].provider).toBe("huggingface_zai");
    });

    it("useTTSProviders returns providers with text_to_speech capability", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: mockProviders,
        error: null,
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useTTSProviders(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(1);
      expect(result.current.providers[0].provider).toBe("openai");
    });

    it("useASRProviders returns providers with automatic_speech_recognition capability", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: mockProviders,
        error: null,
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useASRProviders(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(1);
      expect(result.current.providers[0].provider).toBe("huggingface_zai");
    });

    it("useVideoProviders returns providers with text_to_video capability", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: mockProviders,
        error: null,
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useVideoProviders(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual([]);
    });

    it("useEmbeddingProviders returns providers with generate_embedding capability", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: mockProviders,
        error: null,
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useEmbeddingProviders(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual([]);
    });
  });
});
