import { renderHook } from "@testing-library/react";
import { useProviderApiKeyValidation } from "../useProviderApiKeyValidation";
import { useSecrets } from "../useSecrets";

jest.mock("../useSecrets");
jest.mock("../../stores/ModelMenuStore", () => ({
  requiredSecretForProvider: jest.fn((provider: string) => {
    const secretMap: Record<string, string | null> = {
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      huggingface: "HF_TOKEN",
      replicate: "REPLICATE_API_TOKEN",
      local: null,
      "no-key-provider": null,
    };
    return secretMap[provider] || null;
  }),
}));

jest.mock("../../utils/providerDisplay", () => ({
  formatGenericProviderName: jest.fn((name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }),
  isHuggingFaceProvider: jest.fn((_name: string) => _name === "huggingface"),
  getProviderBaseName: jest.fn((_name: string) => "Hugging Face",
  ),
}));

describe("useProviderApiKeyValidation", () => {
  const mockIsApiKeySet = jest.fn();
  const mockIsLoading = false;

  beforeEach(() => {
    jest.clearAllMocks();
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: mockIsApiKeySet,
      isLoading: mockIsLoading,
    });
  });

  describe("initial state", () => {
    it("returns empty array when loading", () => {
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: mockIsApiKeySet,
        isLoading: true,
      });

      const { result } = renderHook(() =>
        useProviderApiKeyValidation(["openai"])
      );

      expect(result.current).toEqual([]);
    });

    it("returns empty array for providers with no required secret", () => {
      const { result } = renderHook(() =>
        useProviderApiKeyValidation(["local", "no-key-provider"])
      );

      expect(result.current).toEqual([]);
      expect(mockIsApiKeySet).not.toHaveBeenCalled();
    });

    it("returns empty array when all providers have API keys set", () => {
      mockIsApiKeySet.mockReturnValue(true);

      const { result } = renderHook(() =>
        useProviderApiKeyValidation(["openai", "anthropic"])
      );

      expect(result.current).toEqual([]);
    });
  });

  describe("API key validation", () => {
    it("returns missing status for provider without API key", () => {
      mockIsApiKeySet.mockReturnValue(false);

      const { result } = renderHook(() =>
        useProviderApiKeyValidation(["openai"])
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0]).toEqual({
        provider: "openai",
        providerDisplayName: "Openai",
        secretKey: "OPENAI_API_KEY",
        secretDisplayName: "OpenAI API Key",
        isMissing: true,
      });
    });

    it("returns missing status for multiple providers without API keys", () => {
      mockIsApiKeySet.mockReturnValue(false);

      const { result } = renderHook(() =>
        useProviderApiKeyValidation(["openai", "anthropic"])
      );

      expect(result.current).toHaveLength(2);
      expect(result.current[0].provider).toBe("openai");
      expect(result.current[1].provider).toBe("anthropic");
    });

    it("filters out providers with API keys", () => {
      mockIsApiKeySet.mockImplementation((key: string) => key === "OPENAI_API_KEY");

      const { result } = renderHook(() =>
        useProviderApiKeyValidation(["openai", "anthropic"])
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].provider).toBe("anthropic");
    });

    it("handles huggingface provider with special display name", () => {
      mockIsApiKeySet.mockReturnValue(false);

      const { result } = renderHook(() =>
        useProviderApiKeyValidation(["huggingface"])
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].provider).toBe("huggingface");
      expect(result.current[0].providerDisplayName).toBe("Hugging Face");
      expect(result.current[0].secretKey).toBe("HF_TOKEN");
      expect(result.current[0].secretDisplayName).toBe("HuggingFace Token");
    });
  });

  describe("memoization", () => {
    it("only recalculates when providers or loading state changes", () => {
      mockIsApiKeySet.mockReturnValue(false);

      const { result, rerender } = renderHook(
        (props: { providers: string[] }) => useProviderApiKeyValidation(props.providers),
        { initialProps: { providers: ["openai"] } }
      );

      expect(result.current).toHaveLength(1);

      rerender({ providers: ["openai"] });
      expect(result.current).toHaveLength(1);

      rerender({ providers: ["anthropic"] });
      expect(result.current).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("handles empty providers array", () => {
      const { result } = renderHook(() => useProviderApiKeyValidation([]));

      expect(result.current).toEqual([]);
      expect(mockIsApiKeySet).not.toHaveBeenCalled();
    });

    it("handles unknown providers without required secrets", () => {
      (useSecrets as jest.Mock).mockReturnValue({
        isApiKeySet: mockIsApiKeySet,
        isLoading: false,
      });

      const { result } = renderHook(() =>
        useProviderApiKeyValidation(["unknown-provider"])
      );

      expect(result.current).toEqual([]);
    });

    it("handles duplicate provider names", () => {
      mockIsApiKeySet.mockReturnValue(false);

      const { result } = renderHook(() =>
        useProviderApiKeyValidation(["openai", "openai"])
      );

      expect(result.current).toHaveLength(2);
    });
  });
});
