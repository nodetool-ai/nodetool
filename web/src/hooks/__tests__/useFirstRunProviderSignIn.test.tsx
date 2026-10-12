import { renderHook } from "@testing-library/react";

import {
  useFirstRunProviderSignIn,
  shouldOfferFirstRunSignIn
} from "../useFirstRunProviderSignIn";
import { useSecrets } from "../useSecrets";
import { openSubscriptionOnboarding } from "../../stores/SubscriptionOnboardingStore";
import useOnboardingStore from "../../stores/OnboardingStore";
import type { SecretResponse } from "../../stores/ApiTypes";

jest.mock("../useSecrets");
jest.mock("../../stores/SubscriptionOnboardingStore", () => ({
  openSubscriptionOnboarding: jest.fn()
}));
jest.mock("../../lib/env", () => ({ isElectron: false, isLocalhost: true }));

const mockUseSecrets = jest.mocked(useSecrets);
const mockOpen = jest.mocked(openSubscriptionOnboarding);

const secret = (key: string, isConfigured: boolean): SecretResponse =>
  ({ key, is_configured: isConfigured }) as SecretResponse;

const secretsResult = (
  overrides: Partial<ReturnType<typeof useSecrets>> = {}
): ReturnType<typeof useSecrets> => ({
  // The list also carries unconfigured catalog rows, which must not count.
  secrets: [secret("OPENAI_API_KEY", false)],
  isLoading: false,
  isSuccess: true,
  isApiKeySet: () => false,
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  useOnboardingStore.setState({ providerSignInOffered: false });
  mockUseSecrets.mockReturnValue(secretsResult());
});

describe("useFirstRunProviderSignIn", () => {
  it("opens the subscription onboarding once when no key is stored", () => {
    const { rerender } = renderHook(() => useFirstRunProviderSignIn());
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(useOnboardingStore.getState().providerSignInOffered).toBe(true);

    rerender();
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("stays quiet while the secrets query is still loading", () => {
    mockUseSecrets.mockReturnValue(
      secretsResult({ secrets: [], isLoading: true, isSuccess: false })
    );
    renderHook(() => useFirstRunProviderSignIn());
    expect(mockOpen).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState().providerSignInOffered).toBe(false);
  });

  it("stays quiet when the secrets query failed", () => {
    mockUseSecrets.mockReturnValue(
      secretsResult({ secrets: [], isSuccess: false })
    );
    renderHook(() => useFirstRunProviderSignIn());
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("stays quiet when an API key is already stored", () => {
    mockUseSecrets.mockReturnValue(
      secretsResult({ secrets: [secret("ANTHROPIC_API_KEY", true)] })
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
    configuredKeyCount: 0
  };

  it("offers on a first local launch with no key stored", () => {
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
    ["a key is stored", { configuredKeyCount: 1 }]
  ])("stays quiet when %s", (_label, overrides) => {
    expect(shouldOfferFirstRunSignIn({ ...firstRun, ...overrides })).toBe(
      false
    );
  });
});
