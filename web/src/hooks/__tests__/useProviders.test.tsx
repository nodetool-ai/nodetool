import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useProviders,
  useProvidersByCapability,
  useLanguageModelProviders,
  useImageModelProviders,
  useTTSProviders,
  useASRProviders,
  useVideoProviders,
  useEmbeddingProviders
} from "../useProviders";

const mockProviders = [
  {
    name: "OpenAI",
    display_name: "OpenAI",
    capabilities: ["generate_message", "text_to_image", "text_to_speech"],
    default_models: { generate_message: "gpt-4", text_to_image: "dalle-3" }
  },
  {
    name: "Anthropic",
    display_name: "Anthropic",
    capabilities: ["generate_message"],
    default_models: { generate_message: "claude-3-opus" }
  },
  {
    name: "HuggingFace",
    display_name: "Hugging Face",
    capabilities: ["generate_embedding", "text_to_image"],
    default_models: {}
  }
];

jest.mock("../../stores/ApiClient", () => ({
  client: {
    GET: jest.fn()
  }
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe("useProviders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty providers array when loading", () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockImplementation(() => 
      new Promise(() => {})
    );

    const { result } = renderHook(() => useProviders(), {
      wrapper: createWrapper()
    });

    expect(result.current.providers).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFetching).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it("fetches providers successfully", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockProviders,
      error: null
    });

    const { result } = renderHook(() => useProviders(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.providers).toEqual(mockProviders);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it("returns empty array on API error", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: null,
      error: new Error("API Error")
    });

    const { result } = renderHook(() => useProviders(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.providers).toEqual([]);
    expect(result.current.error).toBeDefined();
  });

  it("handles empty response data", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: null,
      error: null
    });

    const { result } = renderHook(() => useProviders(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.providers).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("calls API with correct endpoint", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockProviders,
      error: null
    });

    renderHook(() => useProviders(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(client.GET).toHaveBeenCalledWith("/api/models/providers", {});
    });
  });
});

describe("useProvidersByCapability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("filters providers by capability", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockProviders,
      error: null
    });

    const { result } = renderHook(() => 
      useProvidersByCapability("generate_message"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.providers).toHaveLength(2);
    expect(result.current.providers[0].name).toBe("OpenAI");
    expect(result.current.providers[1].name).toBe("Anthropic");
  });

  it("returns empty array when no providers match capability", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockProviders,
      error: null
    });

    const { result } = renderHook(() => 
      useProvidersByCapability("non_existent_capability"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.providers).toEqual([]);
    });
  });

  it("filters providers with multiple matching capabilities", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockProviders,
      error: null
    });

    const { result } = renderHook(() => 
      useProvidersByCapability("text_to_image"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers[0].name).toBe("OpenAI");
      expect(result.current.providers[1].name).toBe("HuggingFace");
    });
  });
});

describe("useLanguageModelProviders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("filters providers for language model generation", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockProviders,
      error: null
    });

    const { result } = renderHook(() => useLanguageModelProviders(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.providers).toHaveLength(2);
    });

    expect(result.current.providers.map(p => p.name)).toEqual([
      "OpenAI",
      "Anthropic"
    ]);
  });
});

describe("useImageModelProviders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("filters providers for image generation", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockProviders,
      error: null
    });

    const { result } = renderHook(() => useImageModelProviders(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.providers).toHaveLength(2);
    });

    expect(result.current.providers.map(p => p.name)).toEqual([
      "OpenAI",
      "HuggingFace"
    ]);
  });
});

describe("useTTSProviders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("filters providers for text-to-speech", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockProviders,
      error: null
    });

    const { result } = renderHook(() => useTTSProviders(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.providers).toHaveLength(1);
    });

    expect(result.current.providers[0].name).toBe("OpenAI");
  });
});

describe("useASRProviders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("filters providers for automatic speech recognition", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockProviders,
      error: null
    });

    const { result } = renderHook(() => useASRProviders(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.providers).toHaveLength(0);
    });
  });
});

describe("useVideoProviders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("filters providers for video generation", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockProviders,
      error: null
    });

    const { result } = renderHook(() => useVideoProviders(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.providers).toHaveLength(0);
    });
  });
});

describe("useEmbeddingProviders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("filters providers for embeddings", async () => {
    const { client } = require("../../stores/ApiClient");
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockProviders,
      error: null
    });

    const { result } = renderHook(() => useEmbeddingProviders(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.providers).toHaveLength(1);
    });

    expect(result.current.providers[0].name).toBe("HuggingFace");
  });
});
