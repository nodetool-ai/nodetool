import {
  useProviderOnboardingStore,
  openProviderOnboarding
} from "../ProviderOnboardingStore";

describe("ProviderOnboardingStore", () => {
  beforeEach(() => {
    useProviderOnboardingStore.getState().dismiss();
  });

  it("starts closed with no context", () => {
    const state = useProviderOnboardingStore.getState();
    expect(state.open).toBe(false);
    expect(state.capability).toBeUndefined();
    expect(state.reason).toBeUndefined();
    expect(state.highlightSecretKey).toBeUndefined();
  });

  it("opens with capability and reason context", () => {
    useProviderOnboardingStore.getState().show({
      capability: "text_to_image",
      reason: "Need an image model"
    });
    const state = useProviderOnboardingStore.getState();
    expect(state.open).toBe(true);
    expect(state.capability).toBe("text_to_image");
    expect(state.reason).toBe("Need an image model");
  });

  it("carries a highlighted secret key through the imperative opener", () => {
    openProviderOnboarding({ highlightSecretKey: "FAL_API_KEY" });
    expect(useProviderOnboardingStore.getState().highlightSecretKey).toBe(
      "FAL_API_KEY"
    );
  });

  it("clears all context on dismiss", () => {
    openProviderOnboarding({
      capability: "generate_message",
      reason: "x",
      highlightSecretKey: "OPENAI_API_KEY"
    });
    useProviderOnboardingStore.getState().dismiss();
    const state = useProviderOnboardingStore.getState();
    expect(state.open).toBe(false);
    expect(state.capability).toBeUndefined();
    expect(state.reason).toBeUndefined();
    expect(state.highlightSecretKey).toBeUndefined();
  });
});
