import type { NodeErrorDetail } from "@nodetool-ai/protocol";
import {
  promptForProviderAuth,
  resetProviderAuthPrompt
} from "../providerAuthPrompt";
import { useProviderOnboardingStore } from "../ProviderOnboardingStore";
import { useProviderSignInStore } from "../ProviderSignInStore";

const detail = (extra: Record<string, unknown> = {}) =>
  ({ code: "provider_auth", ...extra }) as unknown as NodeErrorDetail;

describe("promptForProviderAuth", () => {
  beforeEach(() => {
    useProviderOnboardingStore.getState().dismiss();
    useProviderSignInStore.getState().dismiss();
    resetProviderAuthPrompt("run-1");
    resetProviderAuthPrompt("run-2");
  });

  it("ignores errors that are not provider auth failures", () => {
    promptForProviderAuth(detail({ code: "missing_package" }), "run-1");
    expect(useProviderOnboardingStore.getState().open).toBe(false);
    expect(useProviderSignInStore.getState().provider).toBeNull();
  });

  it("opens onboarding on the failed secret key", () => {
    promptForProviderAuth(
      detail({ provider: "openai", secret_key: "OPENAI_API_KEY" }),
      "run-1"
    );
    const state = useProviderOnboardingStore.getState();
    expect(state.open).toBe(true);
    expect(state.highlightSecretKey).toBe("OPENAI_API_KEY");
    expect(state.reason).toContain("openai");
  });

  it("names a generic provider when none is reported", () => {
    promptForProviderAuth(detail(), "run-1");
    const state = useProviderOnboardingStore.getState();
    expect(state.reason).toContain("the provider");
    expect(state.highlightSecretKey).toBeUndefined();
  });

  it("prompts once per run", () => {
    promptForProviderAuth(detail(), "run-1");
    useProviderOnboardingStore.getState().dismiss();
    promptForProviderAuth(detail(), "run-1");
    expect(useProviderOnboardingStore.getState().open).toBe(false);
    promptForProviderAuth(detail(), "run-2");
    expect(useProviderOnboardingStore.getState().open).toBe(true);
  });

  it("prompts again after the run is reset", () => {
    promptForProviderAuth(detail(), "run-1");
    useProviderOnboardingStore.getState().dismiss();
    resetProviderAuthPrompt("run-1");
    promptForProviderAuth(detail(), "run-1");
    expect(useProviderOnboardingStore.getState().open).toBe(true);
  });
});
