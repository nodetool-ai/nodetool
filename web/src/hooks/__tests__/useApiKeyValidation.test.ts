import { renderHook } from "@testing-library/react";
import { useApiKeyValidation } from "../useApiKeyValidation";
import { useSecrets } from "../useSecrets";

jest.mock("../useSecrets");

const mockUseSecrets = useSecrets as jest.MockedFunction<typeof useSecrets>;

describe("useApiKeyValidation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("OpenAI namespace", () => {
    it("returns null when OpenAI API key is set", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn((key: string) => key === "OPENAI_API_KEY"),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("openai.chat"));

      expect(result.current).toBeNull();
    });

    it("returns display name when OpenAI API key is not set", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn(() => false),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("openai.chat"));

      expect(result.current).toBe("OpenAI API Key");
    });

    it("handles nested OpenAI namespaces", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn((key: string) => key === "OPENAI_API_KEY"),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("openai.completion"));

      expect(result.current).toBeNull();
    });
  });

  describe("Anthropic namespace", () => {
    it("returns null when Anthropic API key is set", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn((key: string) => key === "ANTHROPIC_API_KEY"),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("anthropic.complete"));

      expect(result.current).toBeNull();
    });

    it("returns display name when Anthropic API key is not set", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn(() => false),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("anthropic.complete"));

      expect(result.current).toBe("Anthropic API Key");
    });
  });

  describe("Google/Gemini namespace", () => {
    it("returns null when Google API key is set", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn((key: string) => key === "GEMINI_API_KEY"),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("google.generate"));

      expect(result.current).toBeNull();
    });

    it("returns display name when Google API key is not set", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn(() => false),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("gemini.chat"));

      expect(result.current).toBe("Gemini API Key");
    });
  });

  describe("HuggingFace namespace", () => {
    it("returns null when HuggingFace token is set", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn((key: string) => key === "HF_TOKEN"),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("huggingface.inference"));

      expect(result.current).toBeNull();
    });

    it("returns display name when HuggingFace token is not set", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn(() => false),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("huggingface.inference"));

      expect(result.current).toBe("HuggingFace Token");
    });
  });

  describe("Replicate namespace", () => {
    it("returns null when Replicate token is set", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn((key: string) => key === "REPLICATE_API_TOKEN"),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("replicate.predict"));

      expect(result.current).toBeNull();
    });

    it("returns display name when Replicate token is not set", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn(() => false),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("replicate.predict"));

      expect(result.current).toBe("Replicate API Token");
    });
  });

  describe("Unknown namespace", () => {
    it("returns null when no API key is required", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn(() => false),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("custom.unknown"));

      expect(result.current).toBeNull();
    });

    it("handles case-sensitive namespaces", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn(() => false),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("CUSTOM.NAMESPACE"));

      expect(result.current).toBeNull();
    });
  });

  describe("Loading state", () => {
    it("returns null while loading", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn(() => false),
        isLoading: true,
      });

      const { result } = renderHook(() => useApiKeyValidation("openai.chat"));

      expect(result.current).toBeNull();
    });
  });

  describe("AIME namespace", () => {
    it("returns correct display name for AIME", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn(() => false),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("aime.chat"));

      expect(result.current).toBe("Aime API Key");
    });
  });

  describe("Calendly namespace", () => {
    it("returns correct display name for Calendly", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn(() => false),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("calendly.events"));

      expect(result.current).toBe("Calendly API Token");
    });
  });

  describe("FAL namespace", () => {
    it("returns correct display name for FAL", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: jest.fn(() => false),
        isLoading: false,
      });

      const { result } = renderHook(() => useApiKeyValidation("fal.image"));

      expect(result.current).toBe("FAL API Key");
    });
  });

  describe("Multiple namespaces", () => {
    it("validates multiple different namespaces", () => {
      const isApiKeySetMock = jest.fn((key: string) => {
        if (key === "OPENAI_API_KEY") {return true;}
        if (key === "ANTHROPIC_API_KEY") {return false;}
        return false;
      });

      mockUseSecrets.mockReturnValue({
        secrets: [],
        isSuccess: true,
        isApiKeySet: isApiKeySetMock,
        isLoading: false,
      });

      const { result, rerender } = renderHook(
        ({ namespace }: { namespace: string }) => useApiKeyValidation(namespace),
        { initialProps: { namespace: "openai.chat" } }
      );

      if (result.current !== null) {
        expect(result.current).toBeNull();
      }

      rerender({ namespace: "anthropic.complete" });
      expect(result.current).toBe("Anthropic API Key");
    });
  });
});
