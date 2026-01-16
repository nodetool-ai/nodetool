import { renderHook } from "@testing-library/react";
import { useProviderApiKeyValidation } from "../useProviderApiKeyValidation";
import { useSecrets } from "../useSecrets";

jest.mock("../useSecrets");

const mockUseSecrets = useSecrets as jest.MockedFunction<typeof useSecrets>;

describe("useProviderApiKeyValidation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty array when isLoading is true", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: true,
      isSuccess: false,
      isApiKeySet: jest.fn()
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["openai"]));
    expect(result.current).toEqual([]);
  });

  it("returns empty array for providers that don't require API keys", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isSuccess: false,
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["ollama", "llama_cpp"]));
    expect(result.current).toEqual([]);
  });

  it("returns missing status for provider without API key", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isSuccess: false,
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["openai"]));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].provider).toBe("openai");
    expect(result.current[0].providerDisplayName).toBe("Openai");
    expect(result.current[0].secretKey).toBe("OPENAI_API_KEY");
    expect(result.current[0].secretDisplayName).toBe("OpenAI API Key");
    expect(result.current[0].isMissing).toBe(true);
  });

  it("does not include provider when API key is set", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isApiKeySet: jest.fn().mockImplementation((key: string) => key === "OPENAI_API_KEY")
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["openai"]));
    expect(result.current).toHaveLength(0);
  });

  it("includes multiple providers with missing keys", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isSuccess: false,
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["openai", "anthropic", "gemini"]));
    expect(result.current).toHaveLength(3);
  });

  it("filters out providers with valid keys from multiple", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isApiKeySet: jest.fn().mockImplementation((key: string) => key === "OPENAI_API_KEY")
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["openai", "anthropic"]));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].provider).toBe("anthropic");
  });

  it("returns empty array for empty providers list", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isApiKeySet: jest.fn()
    });

    const { result } = renderHook(() => useProviderApiKeyValidation([]));
    expect(result.current).toEqual([]);
  });

  it("handles HuggingFace provider correctly", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isSuccess: false,
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["huggingface"]));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].provider).toBe("huggingface");
    expect(result.current[0].providerDisplayName).toBe("Hugging Face");
    expect(result.current[0].secretKey).toBe("HF_TOKEN");
    expect(result.current[0].secretDisplayName).toBe("HuggingFace Token");
  });

  it("handles HuggingFace sub-provider correctly", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isSuccess: false,
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["huggingface_fireworks_ai"]));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].provider).toBe("huggingface_fireworks_ai");
    expect(result.current[0].providerDisplayName).toBe("Fireworks Ai");
  });

  it("handles replicate provider", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isSuccess: false,
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["replicate"]));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].secretKey).toBe("REPLICATE_API_TOKEN");
    expect(result.current[0].secretDisplayName).toBe("Replicate API Token");
  });

  it("handles gemini/google provider", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isSuccess: false,
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["google"]));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].secretKey).toBe("GEMINI_API_KEY");
    expect(result.current[0].secretDisplayName).toBe("Gemini API Key");
  });

  it("handles fal_ai provider", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isSuccess: false,
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["fal_ai"]));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].secretKey).toBe("FAL_API_KEY");
    expect(result.current[0].secretDisplayName).toBe("FAL API Key");
  });

  it("handles aime provider", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isSuccess: false,
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["aime"]));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].secretKey).toBe("AIME_API_KEY");
    expect(result.current[0].secretDisplayName).toBe("Aime API Key");
  });

  it("returns stable reference on re-render when dependencies unchanged", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isSuccess: false,
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result, rerender } = renderHook(() => useProviderApiKeyValidation(["openai"]));
    const firstResult = result.current;
    rerender();
    expect(result.current).toStrictEqual(firstResult);
  });

  it("updates when providers change", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isSuccess: false,
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result, rerender } = renderHook(({ providers }) => useProviderApiKeyValidation(providers), {
      initialProps: { providers: ["openai"] }
    });

    expect(result.current).toHaveLength(1);

    rerender({ providers: ["anthropic"] });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].provider).toBe("anthropic");
  });

  it("uses unknown provider name as fallback for secret display name", () => {
    mockUseSecrets.mockReturnValue({
      secrets: [],
      isLoading: false,
      isSuccess: false,
      isApiKeySet: jest.fn().mockReturnValue(false)
    });

    const { result } = renderHook(() => useProviderApiKeyValidation(["unknown_provider"]));
    expect(result.current).toHaveLength(0);
  });
});
