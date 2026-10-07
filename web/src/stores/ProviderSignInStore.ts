import { create } from "zustand";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";

import type { OAuthProvider } from "../hooks/useOAuthConnection";

/** A provider whose credential is an account sign-in, not an API key. */
export interface SignInProvider {
  /** The OAuth flow that renews the sign-in. */
  oauth: OAuthProvider;
  /** Product name for the dialog copy. */
  label: string;
  /** The account the user signs in with. */
  account: string;
}

/** Runtime provider id -> the sign-in that renews its credential. */
export const SIGN_IN_PROVIDERS: Readonly<Record<string, SignInProvider>> = {
  [PROVIDER_IDS.CODEX]: {
    oauth: "openai",
    label: "Codex",
    account: "ChatGPT"
  },
  [PROVIDER_IDS.CLAUDE_AGENT_SDK]: {
    oauth: "claude",
    label: "Claude",
    account: "Claude"
  }
};

interface ProviderSignInState {
  /** The provider to sign in to again, or null when the dialog is shut. */
  provider: SignInProvider | null;
  show: (provider: SignInProvider) => void;
  dismiss: () => void;
}

/**
 * Drives the dialog that renews an expired account sign-in. A provider that
 * runs on a subscription login has no key to fix, so a refused credential
 * needs one button that starts the login again.
 */
export const useProviderSignInStore = create<ProviderSignInState>((set) => ({
  provider: null,
  show: (provider) => set({ provider }),
  dismiss: () => set({ provider: null })
}));

/**
 * Open the sign-in dialog for a runtime provider id. Returns false when the
 * provider does not sign in with an account.
 */
export const openProviderSignIn = (providerId: string): boolean => {
  const provider = SIGN_IN_PROVIDERS[providerId];
  if (!provider) {
    return false;
  }
  useProviderSignInStore.getState().show(provider);
  return true;
};

export default useProviderSignInStore;
