import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRecommendedTaskModels } from "../useRecommendedTaskModels";

jest.mock("../stores/BASE_URL", () => ({
  BASE_URL: "http://localhost:7777",
}));

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

describe("useRecommendedTaskModels", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("image task", () => {
    it("returns empty array when fetch fails", async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Server Error"),
        })
      ) as jest.Mock;

      const { result } = renderHook(() => useRecommendedTaskModels("image"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain("Failed to fetch recommended image models");
    });

    it("returns image models mapped from unified format", async () => {
      const mockModels = [
        { id: "model-1", name: "SDXL", type: "hf.diffusion", tags: ["image"] },
        { id: "model-2", name: "Stable Diffusion", type: "hf.diffusion", tags: [] },
      ];

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModels),
        })
      ) as jest.Mock;

      const { result } = renderHook(() => useRecommendedTaskModels("image"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data?.[0]).toEqual({
        type: "image_model",
        id: "model-1",
        name: "SDXL",
        provider: "huggingface",
      });
    });
  });

  describe("language task", () => {
    it("returns language models mapped from unified format", async () => {
      const mockModels = [
        { id: "llama-7b", name: "Llama 7B", type: "mlx", tags: ["language"] },
        { id: "gemma-2b", name: "Gemma 2B", type: "hf.text2text", tags: [] },
      ];

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModels),
        })
      ) as jest.Mock;

      const { result } = renderHook(() => useRecommendedTaskModels("language"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data?.[0]).toEqual({
        type: "language_model",
        id: "llama-7b",
        name: "Llama 7B",
        provider: "mlx",
      });
      expect(result.current.data?.[1]).toEqual({
        type: "language_model",
        id: "gemma-2b",
        name: "Gemma 2B",
        provider: "huggingface",
      });
    });
  });

  describe("asr task", () => {
    it("returns ASR models mapped from unified format", async () => {
      const mockModels = [
        { id: "whisper-base", name: "Whisper Base", type: "hf.asr", tags: [] },
      ];

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModels),
        })
      ) as jest.Mock;

      const { result } = renderHook(() => useRecommendedTaskModels("asr"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0]).toEqual({
        type: "asr_model",
        id: "whisper-base",
        name: "Whisper Base",
        provider: "huggingface",
      });
    });
  });

  describe("tts task", () => {
    it("returns TTS models mapped from unified format", async () => {
      const mockModels = [
        { id: "bark", name: "Bark", type: "hf.speech", tags: [] },
      ];

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModels),
        })
      ) as jest.Mock;

      const { result } = renderHook(() => useRecommendedTaskModels("tts"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0]).toEqual({
        type: "tts_model",
        id: "bark",
        name: "Bark",
        provider: "huggingface",
        voices: [],
        selected_voice: "",
      });
    });
  });

  describe("provider inference", () => {
    it("infers mlx provider from mlx type", async () => {
      const mockModels = [
        { id: "model-1", type: "mlx", tags: [] },
      ];

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModels),
        })
      ) as jest.Mock;

      const { result } = renderHook(() => useRecommendedTaskModels("language"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.[0].provider).toBe("mlx");
    });

    it("infers huggingface from hf.* type", async () => {
      const mockModels = [
        { id: "model-1", type: "hf.text2text", tags: [] },
      ];

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModels),
        })
      ) as jest.Mock;

      const { result } = renderHook(() => useRecommendedTaskModels("language"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.[0].provider).toBe("huggingface");
    });

    it("infers llama_cpp provider", async () => {
      const mockModels = [
        { id: "model-1", type: "llama_cpp", tags: [] },
      ];

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModels),
        })
      ) as jest.Mock;

      const { result } = renderHook(() => useRecommendedTaskModels("language"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.[0].provider).toBe("llama_cpp");
    });

    it("infers vllm provider", async () => {
      const mockModels = [
        { id: "model-1", type: "vllm", tags: [] },
      ];

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModels),
        })
      ) as jest.Mock;

      const { result } = renderHook(() => useRecommendedTaskModels("language"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.[0].provider).toBe("vllm");
    });
  });

  describe("model name handling", () => {
    it("uses repo_id as name when name is missing", async () => {
      const mockModels = [
        { id: "model-1", repo_id: "user/repo-name", type: "hf.text2text", tags: [] },
      ];

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockModels),
        })
      ) as jest.Mock;

      const { result } = renderHook(() => useRecommendedTaskModels("language"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.[0].name).toBe("user/repo-name");
    });
  });
});
