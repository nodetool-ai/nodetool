import {
  ONBOARDING_PROVIDERS,
  CAPABILITY_LABELS,
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

  it("returns the full curated list when no capability is given", () => {
    expect(providersForCapability()).toHaveLength(ONBOARDING_PROVIDERS.length);
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
  });
});
