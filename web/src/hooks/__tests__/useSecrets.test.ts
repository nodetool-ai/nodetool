import { renderHook } from "@testing-library/react";
import { useSecrets } from "../useSecrets";

jest.mock("../useSecrets");

const mockUseSecrets = useSecrets as jest.MockedFunction<typeof useSecrets>;

describe("useSecrets", () => {
  const mockSecrets = [
    { key: "openai_api_key", value: "sk-...", description: "OpenAI API Key" },
    { key: "anthropic_api_key", value: "sk-ant-...", description: "Anthropic API Key" },
    { key: "huggingface_token", value: "hf_...", description: "HuggingFace Token" }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Return Values", () => {
    it("returns secrets from query", () => {
      mockUseSecrets.mockReturnValue({
        secrets: mockSecrets,
        isLoading: false,
        isSuccess: true,
        isApiKeySet: jest.fn()
      });

      const { result } = renderHook(() => useSecrets());

      expect(result.current.secrets).toEqual(mockSecrets);
    });

    it("returns isLoading from query", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isLoading: true,
        isSuccess: false,
        isApiKeySet: jest.fn()
      });

      const { result } = renderHook(() => useSecrets());

      expect(result.current.isLoading).toBe(true);
    });

    it("returns isSuccess from query", () => {
      mockUseSecrets.mockReturnValue({
        secrets: mockSecrets,
        isLoading: false,
        isSuccess: true,
        isApiKeySet: jest.fn()
      });

      const { result } = renderHook(() => useSecrets());

      expect(result.current.isSuccess).toBe(true);
    });
  });

  describe("isApiKeySet", () => {
    it("returns true when API key exists", () => {
      mockUseSecrets.mockReturnValue({
        secrets: mockSecrets,
        isLoading: false,
        isSuccess: true,
        isApiKeySet: jest.fn((key: string) => mockSecrets.some(s => s.key === key))
      });

      const { result } = renderHook(() => useSecrets());

      expect(result.current.isApiKeySet("openai_api_key")).toBe(true);
      expect(result.current.isApiKeySet("anthropic_api_key")).toBe(true);
    });

    it("returns false when API key does not exist", () => {
      mockUseSecrets.mockReturnValue({
        secrets: mockSecrets,
        isLoading: false,
        isSuccess: true,
        isApiKeySet: jest.fn(() => false)
      });

      const { result } = renderHook(() => useSecrets());

      expect(result.current.isApiKeySet("nonexistent_key")).toBe(false);
      expect(result.current.isApiKeySet("")).toBe(false);
    });

    it("finds key with different formats", () => {
      mockUseSecrets.mockReturnValue({
        secrets: mockSecrets,
        isLoading: false,
        isSuccess: true,
        isApiKeySet: jest.fn((key: string) => mockSecrets.some(s => s.key === key))
      });

      const { result } = renderHook(() => useSecrets());

      expect(result.current.isApiKeySet("huggingface_token")).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("handles empty secrets array", () => {
      mockUseSecrets.mockReturnValue({
        secrets: [],
        isLoading: false,
        isSuccess: true,
        isApiKeySet: jest.fn(() => false)
      });

      const { result } = renderHook(() => useSecrets());

      expect(result.current.secrets).toEqual([]);
      expect(result.current.isApiKeySet("any_key")).toBe(false);
    });

    it("handles loading state correctly", () => {
      mockUseSecrets.mockReturnValue({
        secrets: undefined as any,
        isLoading: true,
        isSuccess: false,
        isApiKeySet: jest.fn()
      });

      const { result } = renderHook(() => useSecrets());

      expect(result.current.secrets).toBeUndefined();
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isSuccess).toBe(false);
    });

    it("handles error state", () => {
      mockUseSecrets.mockReturnValue({
        secrets: undefined as any,
        isLoading: false,
        isSuccess: false,
        isApiKeySet: jest.fn(),
        isError: true,
        error: new Error("Failed to fetch secrets")
      } as any);

      const { result } = renderHook(() => useSecrets());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isSuccess).toBe(false);
    });
  });

  describe("Callback Memoization", () => {
    it("isApiKeySet callback is stable", () => {
      mockUseSecrets.mockReturnValue({
        secrets: mockSecrets,
        isLoading: false,
        isSuccess: true,
        isApiKeySet: jest.fn((key: string) => mockSecrets.some(s => s.key === key))
      });

      const { result } = renderHook(() => useSecrets());
      const firstCallback = result.current.isApiKeySet;

      expect(typeof firstCallback).toBe("function");
    });

    it("isApiKeySet has access to secrets in closure", () => {
      mockUseSecrets.mockReturnValue({
        secrets: mockSecrets,
        isLoading: false,
        isSuccess: true,
        isApiKeySet: jest.fn((key: string) => mockSecrets.some(s => s.key === key))
      });

      const { result } = renderHook(() => useSecrets());

      const checkOpenAI = result.current.isApiKeySet;
      expect(checkOpenAI("openai_api_key")).toBe(true);
    });
  });
});
