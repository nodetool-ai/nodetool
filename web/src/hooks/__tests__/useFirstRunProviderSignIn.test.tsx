import { renderHook } from "@testing-library/react";

import {
  useFirstRunProviderSignIn,
  shouldOfferFirstRunSignIn,
  FIRST_RUN_SIGN_IN_REASON
} from "../useFirstRunProviderSignIn";
import { useLanguageModelProviders } from "../useProviders";
import { openProviderOnboarding } from "../../stores/ProviderOnboardingStore";
import useOnboardingStore from "../../stores/OnboardingStore";
import type { ProviderInfo } from "../../stores/ApiTypes";

jest.mock("../useProviders");
jest.mock("../../stores/ProviderOnboardingStore", () => ({
  openProviderOnboarding: jest.fn()
}));
jest.mock("../../lib/env", () => ({ isElectron: false, isLocalhost: true }));

const mockUseLanguageModelProviders = jest.mocked(useLanguageModelProviders);
const mockOpen = jest.mocked(openProviderOnboarding);

const providersResult = (
  overrides: Partial<ReturnType<typeof useLanguageModelProviders>> = {}
): ReturnType<typeof useLanguageModelProviders> => ({
  providers: [],
  isLoading: false,
  isFetching: false,
  error: null,
  ...overrides
});

const languageProvider: ProviderInfo = {
  provider: "openai",
  capabilities: ["generate_message"],
  access: "remote_api",
  display_name: "OpenAI"
} as ProviderInfo;

beforeEach(() => {
  jest.clearAllMocks();
  useOnboardingStore.setState({ providerSignInOffered: false });
  mockUseLanguageModelProviders.mockReturnValue(providersResult());
});

describe("useFirstRunProviderSignIn", () => {
  it("offers the sign-in once when nothing is configured", () => {
    const { rerender } = renderHook(() => useFirstRunProviderSignIn());
    expect(mockOpen).toHaveBeenCalledWith({
      capability: "generate_message",
      reason: FIRST_RUN_SIGN_IN_REASON
    });
    expect(useOnboardingStore.getState().providerSignInOffered).toBe(true);

    rerender();
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("names Claude and OpenAI in the offer", () => {
    expect(FIRST_RUN_SIGN_IN_REASON).toMatch(/Claude/);
    expect(FIRST_RUN_SIGN_IN_REASON).toMatch(/OpenAI/);
  });

  it("stays quiet while the providers query is still loading", () => {
    mockUseLanguageModelProviders.mockReturnValue(
      providersResult({ isLoading: true })
    );
    renderHook(() => useFirstRunProviderSignIn());
    expect(mockOpen).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState().providerSignInOffered).toBe(false);
  });

  it("stays quiet when the providers query failed", () => {
    mockUseLanguageModelProviders.mockReturnValue(
      providersResult({ error: new Error("offline") })
    );
    renderHook(() => useFirstRunProviderSignIn());
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("stays quiet when a language model provider is already configured", () => {
    mockUseLanguageModelProviders.mockReturnValue(
      providersResult({ providers: [languageProvider] })
    );
    renderHook(() => useFirstRunProviderSignIn());
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("does not ask again after the offer was already made", () => {
    useOnboardingStore.setState({ providerSignInOffered: true });
    renderHook(() => useFirstRunProviderSignIn());
    expect(mockOpen).not.toHaveBeenCalled();
  });

});

describe("shouldOfferFirstRunSignIn", () => {
  const firstRun = {
    isLocalApp: true,
    offered: false,
    isLoading: false,
    hasError: false,
    providerCount: 0
  };

  it("offers on a first local launch with nothing configured", () => {
    expect(shouldOfferFirstRunSignIn(firstRun)).toBe(true);
  });

  it("stays quiet on a hosted deployment, where the sign-ins can't finish", () => {
    expect(
      shouldOfferFirstRunSignIn({ ...firstRun, isLocalApp: false })
    ).toBe(false);
  });

  it.each([
    ["already offered", { offered: true }],
    ["still loading", { isLoading: true }],
    ["query failed", { hasError: true }],
    ["a provider is configured", { providerCount: 1 }]
  ])("stays quiet when %s", (_label, overrides) => {
    expect(shouldOfferFirstRunSignIn({ ...firstRun, ...overrides })).toBe(
      false
    );
  });
});
