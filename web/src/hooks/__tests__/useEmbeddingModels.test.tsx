import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEmbeddingModelsByProvider } from "../useEmbeddingModels";
import { useEmbeddingProviders } from "../useProviders";
import { client } from "../stores/ApiClient";

jest.mock("../useProviders");
jest.mock("../stores/ApiClient");

describe("useEmbeddingModels", () => {
  const mockProviders = [
    { provider: "openai", requiredKey: "OpenAI API Key", isEnabled: true },
    { provider: "cohere", requiredKey: "Cohere API Key", isEnabled: true }
  ];

  let queryClient: QueryClient;

  const createWrapper = () => {
    queryClient = new QueryClient({
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

  beforeEach(() => {
    jest.clearAllMocks();
    (useEmbeddingProviders as jest.Mock).mockReturnValue({
      providers: mockProviders,
      isLoading: false
    });
  });

  describe("useEmbeddingModelsByProvider", () => {
    it("returns empty models array when providers are loading", () => {
      (useEmbeddingProviders as jest.Mock).mockReturnValue({
        providers: [],
        isLoading: true
      });

      const { result } = renderHook(() => useEmbeddingModelsByProvider(), {
        wrapper: createWrapper()
      });

      expect(result.current.models).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeUndefined();
    });

    it("fetches models for all providers", async () => {
      	client.GET.mockResolvedValueOnce({
        data: [
          { id: "text-embedding-ada-002", name: "text-embedding-ada-002" }
        ]
      });

      	client.GET.mockResolvedValueOnce({
        data: [
          { id: "embed-english-v3.0", name: "embed-english-v3.0" }
        ]
      });

      const { result } = renderHook(() => useEmbeddingModelsByProvider(), {
        wrapper: createWrapper()
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(	client.GET).toHaveBeenCalledTimes(2);
      expect(result.current.models).toHaveLength(2);
      expect(result.current.models[0].id).toBe("text-embedding-ada-002");
      expect(result.current.models[1].id).toBe("embed-english-v3.0");
    });

    it("combines models from all providers", async () => {
      	client.GET.mockResolvedValueOnce({
        data: [
          { id: "model-1", name: "Model 1" },
          { id: "model-2", name: "Model 2" }
        ]
      });

      	client.GET.mockResolvedValueOnce({
        data: [
          { id: "model-3", name: "Model 3" }
        ]
      });

      const { result } = renderHook(() => useEmbeddingModelsByProvider(), {
        wrapper: createWrapper()
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.models).toHaveLength(3);
      expect(result.current.models.map(m => m.id)).toEqual([
        "model-1",
        "model-2",
        "model-3"
      ]);
    });

    it("filters models by allowedProviders option", async () => {
      	client.GET.mockResolvedValueOnce({
        data: [
          { id: "openai-model", name: "OpenAI Model" }
        ]
      });

      const { result } = renderHook(() =>
        useEmbeddingModelsByProvider({ allowedProviders: ["openai"] }), {
        wrapper: createWrapper()
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(	client.GET).toHaveBeenCalledTimes(1);
      expect(	client.GET).toHaveBeenCalledWith(
        "/api/models/embedding/{provider}",
        expect.objectContaining({
          params: expect.objectContaining({
            path: expect.objectContaining({
              provider: "openai"
            })
          })
        })
      );
      expect(result.current.models).toHaveLength(1);
      expect(result.current.models[0].id).toBe("openai-model");
    });

    it("filters providers case-insensitively", async () => {
      	client.GET.mockResolvedValueOnce({
        data: [{ id: "test-model", name: "Test Model" }]
      });

      const { result } = renderHook(() =>
        useEmbeddingModelsByProvider({ allowedProviders: ["OPENAI"] }), {
        wrapper: createWrapper()
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.models).toHaveLength(1);
    });

    it("returns error when API call fails", async () => {
      	client.GET.mockRejectedValueOnce(new Error("API Error"));

      const { result } = renderHook(() => useEmbeddingModelsByProvider(), {
        wrapper: createWrapper()
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.error.message).toBe("API Error");
    });

    it("returns error from first failed query", async () => {
      	client.GET.mockRejectedValueOnce(new Error("First Error"));
      	client.GET.mockResolvedValueOnce({
        data: [{ id: "model-1", name: "Model 1" }]
      });

      const { result } = renderHook(() => useEmbeddingModelsByProvider(), {
        wrapper: createWrapper()
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.error.message).toBe("First Error");
    });

    it("correctly reports isFetching state", async () => {
      	client.GET.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => {
          resolve({ data: [{ id: "model-1", name: "Model 1" }] });
        }, 100))
      );

      const { result } = renderHook(() => useEmbeddingModelsByProvider(), {
        wrapper: createWrapper()
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isFetching).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isFetching).toBe(false);
    });

    it("handles empty provider list", () => {
      (useEmbeddingProviders as jest.Mock).mockReturnValue({
        providers: [],
        isLoading: false
      });

      const { result } = renderHook(() => useEmbeddingModelsByProvider(), {
        wrapper: createWrapper()
      });

      expect(result.current.models).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(	client.GET).not.toHaveBeenCalled();
    });

    it("handles providers with no models", async () => {
      	client.GET.mockResolvedValueOnce({
        data: []
      });

      	client.GET.mockResolvedValueOnce({
        data: []
      });

      const { result } = renderHook(() => useEmbeddingModelsByProvider(), {
        wrapper: createWrapper()
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.models).toEqual([]);
    });

    it("handles null data from API", async () => {
      	client.GET.mockResolvedValueOnce({
        data: null
      });

      	client.GET.mockResolvedValueOnce({
        data: null
      });

      const { result } = renderHook(() => useEmbeddingModelsByProvider(), {
        wrapper: createWrapper()
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.models).toEqual([]);
    });
  });
});
