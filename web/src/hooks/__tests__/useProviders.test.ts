import { renderHook, waitFor } from "@testing-library/react";
import { useProviders, useProvidersByCapability, useLanguageModelProviders, useImageModelProviders, useTTSProviders, useASRProviders, useVideoProviders, useEmbeddingProviders } from "../useProviders";
import { client } from "../../stores/ApiClient";

jest.mock("../../stores/ApiClient");

describe("useProviders", () => {
  const mockProviders = [
    {
      id: "provider-1",
      name: "OpenAI",
      capabilities: ["generate_message", "text_to_image", "text_to_speech"],
      api_key_required: true
    },
    {
      id: "provider-2",
      name: "HuggingFace",
      capabilities: ["generate_embedding", "text_to_image"],
      api_key_required: false
    },
    {
      id: "provider-3",
      name: "Anthropic",
      capabilities: ["generate_message"],
      api_key_required: true
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("useProviders", () => {
    it("should return empty array when no data", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: undefined, error: null });

      const { result } = renderHook(() => useProviders());

      expect(result.current.providers).toEqual([]);
      expect(result.current.isLoading).toBe(true);
    });

    it("should return providers on success", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: mockProviders, error: null });

      const { result } = renderHook(() => useProviders());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual(mockProviders);
      expect(result.current.error).toBeNull();
    });

    it("should handle API error", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: undefined, error: new Error("API Error") });

      const { result } = renderHook(() => useProviders());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual([]);
      expect(result.current.error).toBeInstanceOf(Error);
    });

    it("should indicate when fetching", async () => {
      (client.GET as jest.Mock).mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ data: mockProviders, error: null }), 100);
      }));

      const { result } = renderHook(() => useProviders());

      expect(result.current.isFetching).toBe(true);

      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });
    });
  });

  describe("useProvidersByCapability", () => {
    it("should filter providers by capability", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: mockProviders, error: null });

      const { result } = renderHook(() => useProvidersByCapability("generate_message"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers.map(p => p.id)).toEqual(["provider-1", "provider-3"]);
    });

    it("should return empty array when no providers match capability", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: mockProviders, error: null });

      const { result } = renderHook(() => useProvidersByCapability("text_to_video"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual([]);
    });

    it("should pass through loading and error states", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: mockProviders, error: null });

      const { result } = renderHook(() => useProvidersByCapability("generate_embedding"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
      });
    });
  });

  describe("capability-specific hooks", () => {
    it("useLanguageModelProviders should filter for generate_message", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: mockProviders, error: null });

      const { result } = renderHook(() => useLanguageModelProviders());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers[0].capabilities).toContain("generate_message");
    });

    it("useImageModelProviders should filter for text_to_image", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: mockProviders, error: null });

      const { result } = renderHook(() => useImageModelProviders());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers[0].capabilities).toContain("text_to_image");
    });

    it("useTTSProviders should filter for text_to_speech", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: mockProviders, error: null });

      const { result } = renderHook(() => useTTSProviders());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(1);
      expect(result.current.providers[0].capabilities).toContain("text_to_speech");
    });

    it("useASRProviders should filter for automatic_speech_recognition", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: mockProviders, error: null });

      const { result } = renderHook(() => useASRProviders());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(0);
    });

    it("useVideoProviders should filter for text_to_video", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: mockProviders, error: null });

      const { result } = renderHook(() => useVideoProviders());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(0);
    });

    it("useEmbeddingProviders should filter for generate_embedding", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: mockProviders, error: null });

      const { result } = renderHook(() => useEmbeddingProviders());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(1);
      expect(result.current.providers[0].capabilities).toContain("generate_embedding");
    });
  });

  describe("error handling", () => {
    it("should handle empty providers array", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: [], error: null });

      const { result } = renderHook(() => useProviders());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual([]);
      expect(result.current.providers).toHaveLength(0);
    });

    it("should handle null error response", async () => {
      (client.GET as jest.Mock).mockResolvedValue({ data: mockProviders, error: null });

      const { result } = renderHook(() => useProviders());

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });
  });
});
