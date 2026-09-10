import {
  ONBOARDING_PROVIDERS,
  CAPABILITY_LABELS,
  isOnboardingProviderAvailable,
  providersForCapability
} from "../providerOnboardingCatalog";
import type { OnboardingCapability } from "../../../stores/ProviderOnboardingStore";

describe("providerOnboardingCatalog", () => {
  it("gives every provider a label, key, icon, and cost hint", () => {
    for (const provider of ONBOARDING_PROVIDERS) {
      expect(provider.name).toBeTruthy();
      expect(provider.secretKey).toMatch(/^[A-Z0-9_]+$/);
      expect(provider.icon).toBeTruthy();
      expect(provider.capabilities.length).toBeGreaterThan(0);
      expect(provider.keyUrl).toMatch(/^https:\/\//);
      expect(provider.costHint).toBeTruthy();
    }
  });

  it("has a friendly label for every capability", () => {
    const capabilities = new Set<OnboardingCapability>();
    for (const provider of ONBOARDING_PROVIDERS) {
      provider.capabilities.forEach((c) => capabilities.add(c));
    }
    for (const capability of capabilities) {
      expect(CAPABILITY_LABELS[capability]).toBeTruthy();
    }
  });

  it("filters providers to a requested capability", () => {
    const tts = providersForCapability("text_to_speech");
    expect(tts.length).toBeGreaterThan(0);
    expect(tts.every((p) => p.capabilities.includes("text_to_speech"))).toBe(
      true
    );
    // A chat-only provider must not appear in the text-to-speech list.
    expect(tts.some((p) => p.id === "anthropic")).toBe(false);
  });

  it("returns every available provider when no capability is given", () => {
    expect(providersForCapability()).toHaveLength(
      ONBOARDING_PROVIDERS.filter(isOnboardingProviderAvailable).length
    );
  });

  it("only offers a same-machine sign-in where it can complete", () => {
    // jsdom serves the page from localhost, where the loopback callback works.
    const claude = ONBOARDING_PROVIDERS.find((p) => p.id === "claude")!;
    expect(claude.localOnly).toBe(true);
    expect(isOnboardingProviderAvailable(claude)).toBe(true);
    expect(providersForCapability("generate_message")).toContain(claude);
  });

  it("offers the Claude subscription as an OAuth-only entry", () => {
    const claude = ONBOARDING_PROVIDERS.find((p) => p.id === "claude")!;
    expect(claude.oauth).toBe("claude");
    expect(claude.oauthOnly).toBe(true);
    expect(claude.tagline).toMatch(/no api key/i);
  });

  it("orders recommended providers first", () => {
    const ordered = providersForCapability("generate_message");
    const firstNonRecommended = ordered.findIndex((p) => !p.recommended);
    const lastRecommended = ordered
      .map((p) => Boolean(p.recommended))
      .lastIndexOf(true);
    // No recommended provider appears after a non-recommended one.
    if (firstNonRecommended !== -1) {
      expect(lastRecommended).toBeLessThan(firstNonRecommended);
    }
  });

  it("leads with one-click OAuth providers among the recommended set", () => {
    expect(ONBOARDING_PROVIDERS.some((p) => p.oauth === "openai")).toBe(true);
    expect(ONBOARDING_PROVIDERS.some((p) => p.oauth === "hf")).toBe(true);
    expect(ONBOARDING_PROVIDERS.some((p) => p.oauth === "claude")).toBe(true);
  });
});

it("offers API keys, not chat-only OpenAI OAuth, for media tasks", () => {
  for (const capability of ["text_to_image", "text_to_speech", "generate_embedding"] as const) {
    const openai = providersForCapability(capability).find((provider) => provider.id === "openai");
    expect(openai).toBeDefined();
    expect(openai?.oauth).toBeUndefined();
  }
  expect(providersForCapability("generate_message").find((provider) => provider.id === "openai")?.oauth).toBe("openai");
});

it("offers a connectable provider for both 3D tasks", () => {
  for (const capability of ["text_to_3d", "image_to_3d"] as const) {
    expect(providersForCapability(capability).some((provider) => provider.secretKey === "MESHY_API_KEY")).toBe(true);
  }
});
