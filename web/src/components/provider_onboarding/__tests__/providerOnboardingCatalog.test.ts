import {
  ONBOARDING_PROVIDERS,
  CAPABILITY_LABELS,
  directoryProviders,
  isOnboardingProviderAvailable,
  matchesProviderQuery,
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

it("offers the Codex sign-in for chat only, and OpenAI as an API key", () => {
  const chat = providersForCapability("generate_message");
  expect(chat.find((provider) => provider.id === "codex")).toMatchObject({ oauth: "openai", oauthOnly: true });
  expect(chat.find((provider) => provider.id === "openai")?.oauth).toBeUndefined();
  for (const capability of ["text_to_image", "text_to_speech", "generate_embedding"] as const) {
    const providers = providersForCapability(capability);
    expect(providers.some((provider) => provider.id === "openai")).toBe(true);
    expect(providers.some((provider) => provider.id === "codex")).toBe(false);
  }
});

it("offers a connectable provider for both 3D tasks", () => {
  for (const capability of ["text_to_3d", "image_to_3d"] as const) {
    expect(providersForCapability(capability).some((provider) => provider.secretKey === "MESHY_API_KEY")).toBe(true);
  }
});

// UX research study 12: the background-removal picker offered OpenAI, which
// cannot remove a background, and reopened setup after it was connected.
it("offers only the providers that run a specialized image step", () => {
  const ids = providersForCapability("text_to_image", ["remove_background"]).map(
    (provider) => provider.id
  );
  expect(ids).toEqual(expect.arrayContaining(["fal", "replicate"]));
  expect(ids).not.toContain("openai");
  expect(ids).not.toContain("gemini");
});

it("keeps every image provider for an image step that most providers run", () => {
  const ids = providersForCapability("text_to_image", ["image_to_image"]).map(
    (provider) => provider.id
  );
  expect(ids).toEqual(expect.arrayContaining(["openai", "gemini", "fal"]));
});

it("falls back to the model kind when no listed provider runs the step", () => {
  expect(providersForCapability("text_to_image", ["estimate_depth"])).toEqual(
    providersForCapability("text_to_image")
  );
});

describe("directoryProviders", () => {
  it("adds every AI provider the curated list leaves out, once", () => {
    const providers = directoryProviders();
    const keys = providers.map((p) => p.secretKey);
    expect(keys).toEqual(expect.arrayContaining(["DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "TOPAZ_API_KEY"]));
    expect(new Set(keys).size).toBe(keys.length);
    for (const curated of ONBOARDING_PROVIDERS) {
      expect(keys).not.toContain(curated.secretKey);
    }
    // OpenAI's settings card carries the ChatGPT sign-in, already curated.
    expect(keys).not.toContain("OPENAI_API_KEY");
  });

  it("leaves web search, GPU rental and service keys in Settings", () => {
    const keys = directoryProviders().map((p) => p.secretKey);
    for (const key of ["SERPAPI_API_KEY", "RUNPOD_API_KEY", "SERVER_AUTH_TOKEN", "GOOGLE_MAIL_USER"]) {
      expect(keys).not.toContain(key);
    }
  });

  it("sends multi-field credentials to Settings instead of one key field", () => {
    const byKey = new Map(directoryProviders().map((p) => [p.secretKey, p]));
    expect(byKey.get("AZURE_OPENAI_API_KEY")?.setupInSettings).toBe(true);
    expect(byKey.get("HIGGSFIELD_API_KEY_ID")?.setupInSettings).toBe(true);
    expect(byKey.get("DEEPSEEK_API_KEY")?.setupInSettings).toBe(false);
  });

  it("narrows by section for a capability", () => {
    const text = directoryProviders("generate_message").map((p) => p.secretKey);
    const image = directoryProviders("text_to_image").map((p) => p.secretKey);
    expect(text).toContain("DEEPSEEK_API_KEY");
    expect(text).not.toContain("TOPAZ_API_KEY");
    expect(image).toContain("TOPAZ_API_KEY");
    expect(image).not.toContain("DEEPSEEK_API_KEY");
    // Gateways serve both.
    expect(text).toContain("ATLASCLOUD_API_KEY");
    expect(image).toContain("ATLASCLOUD_API_KEY");
  });
});

it("matches a provider query on name and description, ignoring case", () => {
  const groq = ONBOARDING_PROVIDERS.find((p) => p.id === "groq")!;
  expect(matchesProviderQuery(groq, "  GROQ ")).toBe(true);
  expect(matchesProviderQuery(groq, "fast")).toBe(true);
  expect(matchesProviderQuery(groq, "video")).toBe(false);
  expect(matchesProviderQuery(groq, "")).toBe(true);
});
