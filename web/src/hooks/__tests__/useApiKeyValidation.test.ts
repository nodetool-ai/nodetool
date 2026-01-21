import { renderHook } from "@testing-library/react";
import { useApiKeyValidation } from "../useApiKeyValidation";

jest.mock("../useSecrets", () => ({
  useSecrets: jest.fn()
}));

import { useSecrets } from "../useSecrets";

describe("useApiKeyValidation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null while secrets are loading", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: true
    });

    const { result } = renderHook(() => useApiKeyValidation("openai.chat"));
    expect(result.current).toBeNull();
  });

  it("returns null when no API key is required for namespace", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("custom.namespace"));
    expect(result.current).toBeNull();
  });

  it("returns null when required API key is set", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn((key) => key === "OPENAI_API_KEY"),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("openai.chat"));
    expect(result.current).toBeNull();
  });

  it("returns display name when required API key is missing", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("openai.chat"));
    expect(result.current).toBe("OpenAI API Key");
  });

  it("returns Anthropic display name for anthropic namespace", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("anthropic.complete"));
    expect(result.current).toBe("Anthropic API Key");
  });

  it("returns Gemini display name for google namespace", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("google.generation"));
    expect(result.current).toBe("Gemini API Key");
  });

  it("returns Gemini display name for gemini namespace", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("gemini.pro"));
    expect(result.current).toBe("Gemini API Key");
  });

  it("returns HuggingFace display name for huggingface namespace", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("huggingface.inference"));
    expect(result.current).toBe("HuggingFace Token");
  });

  it("returns Replicate display name for replicate namespace", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("replicate.prediction"));
    expect(result.current).toBe("Replicate API Token");
  });

  it("returns Aime display name for aime namespace", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("aime.process"));
    expect(result.current).toBe("Aime API Key");
  });

  it("returns Calendly display name for calendly namespace", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("calendly.scheduling"));
    expect(result.current).toBe("Calendly API Token");
  });

  it("returns FAL display name for fal namespace", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("fal.image"));
    expect(result.current).toBe("FAL API Key");
  });

  it("handles case-insensitive namespace matching", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("OPENAI.chat"));
    expect(result.current).toBe("OpenAI API Key");
  });

  it("returns raw secret key when display name not found", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => false),
      isLoading: false
    });

    const { result } = renderHook(() => useApiKeyValidation("unknown.provider"));
    expect(result.current).toBeNull();
  });

  it("throws error when isApiKeySet throws error", () => {
    (useSecrets as jest.Mock).mockReturnValue({
      isApiKeySet: jest.fn(() => {
        throw new Error("Secret not found");
      }),
      isLoading: false
    });

    expect(() => {
      renderHook(() => useApiKeyValidation("openai.chat"));
    }).toThrow("Secret not found");
  });
});
