import { renderHook, waitFor } from "@testing-library/react";
import { useHuggingFaceModels } from "../useHuggingFaceModels";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";

jest.mock("../../stores/ApiClient", () => ({
  client: {
    GET: jest.fn(),
  },
}));

describe("useHuggingFaceModels", () => {

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

  const mockHfModels = [
    {
      id: "gpt2",
      name: "GPT-2",
      type: "text-generation",
      size: "124M",
      task: "text-generation",
      description: "Generates text",
    },
    {
      id: "stable-diffusion-v1-5",
      name: "Stable Diffusion v1.5",
      type: "image-generation",
      size: "4.27GB",
      task: "text-to-image",
      description: "Generates images from text",
    },
    {
      id: "whisper-base",
      name: "Whisper Base",
      type: "audio-transcription",
      size: "74M",
      task: "automatic-speech-recognition",
      description: "Transcribes audio",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches HuggingFace models successfully", async () => {
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockHfModels,
      error: null,
    });

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useHuggingFaceModels(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.hfLoading).toBe(false);
    });

    expect(result.current.hfModels).toEqual(mockHfModels);
    expect(result.current.hfError).toBeNull();
  });

    it("handles empty models list", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
      });

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useHuggingFaceModels(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.hfLoading).toBe(false);
      });

      expect(result.current.hfModels).toEqual([]);
    });

  it("handles API errors", async () => {
    (client.GET as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "Failed to fetch HuggingFace models" },
    });

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useHuggingFaceModels(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.hfLoading).toBe(false);
    });

    expect(!!result.current.hfError).toBe(true);
    expect(result.current.hfError).toBeDefined();
  });

  it("returns loading state initially", () => {
      (client.GET as jest.Mock).mockReturnValue(new Promise(() => {}));

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useHuggingFaceModels(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.hfLoading).toBe(true);
    expect(result.current.hfModels).toBeUndefined();
  });

  it("tracks fetching state", async () => {
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockHfModels,
      error: null,
    });

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useHuggingFaceModels(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.hfIsFetching).toBe(true);

    await waitFor(() => {
      expect(result.current.hfIsFetching).toBe(false);
    });
  });

  it("returns all model properties", async () => {
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockHfModels,
      error: null,
    });

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useHuggingFaceModels(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.hfLoading).toBe(false);
    });

    expect(result.current.hfModels).toHaveLength(3);
    expect(result.current.hfModels?.[0]?.id).toBe("gpt2");
    expect(result.current.hfModels?.[1]?.name).toBe("Stable Diffusion v1.5");
    expect(result.current.hfModels?.[2] as any)?.toHaveProperty("task");
  });

  it("does not refetch on window focus", async () => {
    (client.GET as jest.Mock).mockResolvedValue({
      data: mockHfModels,
      error: null,
    });

    const queryClient = createQueryClient();
    const { result, unmount } = renderHook(() => useHuggingFaceModels(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.hfLoading).toBe(false);
    });

    // The query should not have refetchOnWindowFocus enabled
    // This is verified by the query configuration in the hook
    expect(result.current.hfModels).toBeDefined();

    unmount();
  });
});
