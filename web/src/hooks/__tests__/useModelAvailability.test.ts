import { renderHook } from "@testing-library/react";
import { useModelAvailability } from "../useModelAvailability";

const mockIsApiKeySet = jest.fn();

jest.mock("../../stores/ModelPreferencesStore", () => ({
  __esModule: true,
  default: jest.fn(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ enabledProviders: mockEnabledProviders })
  )
}));

jest.mock("../useSecrets", () => ({
  useSecrets: () => ({ isApiKeySet: mockIsApiKeySet })
}));

jest.mock("../../stores/ModelMenuStore", () => ({
  requiredSecretForProvider: (provider?: string) => {
    const p = (provider || "").toLowerCase();
    if (p.includes("openai")) return "OPENAI_API_KEY";
    if (p.includes("anthropic")) return "ANTHROPIC_API_KEY";
    if (p.includes("ollama")) return null;
    return null;
  },
  ModelSelectorModel: {}
}));

let mockEnabledProviders: Record<string, boolean> = {};

describe("useModelAvailability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnabledProviders = {};
    mockIsApiKeySet.mockReturnValue(true);
  });

  it("returns available when provider is enabled and key is set", () => {
    mockEnabledProviders = { openai: true };
    mockIsApiKeySet.mockReturnValue(true);

    const { result } = renderHook(() => useModelAvailability());
    const check = result.current({ provider: "openai" });

    expect(check.available).toBe(true);
    expect(check.providerEnabled).toBe(true);
    expect(check.hasKey).toBe(true);
  });

  it("returns unavailable when provider is disabled", () => {
    mockEnabledProviders = { openai: false };
    mockIsApiKeySet.mockReturnValue(true);

    const { result } = renderHook(() => useModelAvailability());
    const check = result.current({ provider: "openai" });

    expect(check.available).toBe(false);
    expect(check.providerEnabled).toBe(false);
    expect(check.hasKey).toBe(true);
  });

  it("returns unavailable when API key is not set", () => {
    mockEnabledProviders = { openai: true };
    mockIsApiKeySet.mockReturnValue(false);

    const { result } = renderHook(() => useModelAvailability());
    const check = result.current({ provider: "openai" });

    expect(check.available).toBe(false);
    expect(check.providerEnabled).toBe(true);
    expect(check.hasKey).toBe(false);
  });

  it("treats providers without a required secret as having a key", () => {
    mockEnabledProviders = {};
    mockIsApiKeySet.mockReturnValue(false);

    const { result } = renderHook(() => useModelAvailability());
    const check = result.current({ provider: "ollama" });

    expect(check.hasKey).toBe(true);
  });

  it("defaults to enabled when provider is not in enabledProviders map", () => {
    mockEnabledProviders = {};
    mockIsApiKeySet.mockReturnValue(true);

    const { result } = renderHook(() => useModelAvailability());
    const check = result.current({ provider: "anthropic" });

    expect(check.providerEnabled).toBe(true);
  });

  it("normalizes gemini/google provider key", () => {
    mockEnabledProviders = { gemini: false };
    mockIsApiKeySet.mockReturnValue(true);

    const { result } = renderHook(() => useModelAvailability());
    const check = result.current({ provider: "google" });

    expect(check.providerEnabled).toBe(false);
  });
});
