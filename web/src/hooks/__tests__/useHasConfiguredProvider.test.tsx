import { renderHook } from "@testing-library/react";

import {
  useHasConfiguredProvider,
  useLanguageProviderReadiness
} from "../useHasConfiguredProvider";
import { useLanguageModelsByProvider } from "../useModelsByProvider";
import type { LanguageModel } from "../../stores/ApiTypes";

jest.mock("../useModelsByProvider");

const mockUseLanguageModelsByProvider = jest.mocked(useLanguageModelsByProvider);

const languageModel = (provider: string): LanguageModel => ({
  type: "language_model",
  id: `${provider}-model`,
  name: `${provider} model`,
  provider
});

const withLanguageModels = (
  overrides: Partial<ReturnType<typeof useLanguageModelsByProvider>> = {}
): void => {
  mockUseLanguageModelsByProvider.mockReturnValue({
    models: [],
    providers: [],
    isLoading: false,
    isFetching: false,
    error: null,
    providerErrors: [],
    loadingProgress: { total: 0, loaded: 0, loading: 0 },
    allowedProviders: undefined,
    refetch: jest.fn().mockResolvedValue(undefined),
    ...overrides
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  withLanguageModels();
});

describe("useHasConfiguredProvider", () => {
  it("is false when no configured provider offers a usable language model", () => {
    const { result } = renderHook(() => useHasConfiguredProvider());
    expect(result.current).toBe(false);
  });

  it.each(["openai", "claude-agent-sdk", "ollama"])(
    "is true for a usable %s language model",
    (provider) => {
      withLanguageModels({
        models: [languageModel(provider)],
        providers: [provider]
      });
      const { result } = renderHook(() => useHasConfiguredProvider());
      expect(result.current).toBe(true);
      expect(mockUseLanguageModelsByProvider).toHaveBeenCalledWith({
        requireToolSupport: true
      });
    }
  );

  it("counts a local language model without an API secret", () => {
    withLanguageModels({
      models: [languageModel("ollama")],
      providers: ["ollama"]
    });
    const { result } = renderHook(() => useHasConfiguredProvider());
    expect(result.current).toBe(true);
  });

  it("does not count a media-only provider", () => {
    withLanguageModels({ providers: ["fal"], models: [] });
    const { result } = renderHook(() => useHasConfiguredProvider());
    expect(result.current).toBe(false);
  });

  it("does not count a configured provider with no usable language model", () => {
    withLanguageModels({ providers: ["openai"], models: [] });
    const { result } = renderHook(() => useHasConfiguredProvider());
    expect(result.current).toBe(false);
  });

  it.each([
    ["provider discovery", { isLoading: true }],
    ["model discovery", { isFetching: true }]
  ])("reports loading while %s is unresolved", (_label, state) => {
    withLanguageModels(state);
    const { result } = renderHook(() => useLanguageProviderReadiness());
    expect(result.current).toEqual({ ready: false, loading: true });
  });

  it("does not hide an unavailable discovery error as readiness", () => {
    withLanguageModels({ error: new Error("offline") });
    const { result } = renderHook(() => useLanguageProviderReadiness());
    expect(result.current).toEqual({ ready: false, loading: false });
  });
});
