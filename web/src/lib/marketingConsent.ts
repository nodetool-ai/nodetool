import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "./supabaseClient";

const PENDING_OPT_IN_KEY = "nodetool.marketing.optInPending";

/**
 * Identifies the wording a person agreed to, so a stored consent can be traced
 * back to the text shown. Change it whenever `screen_remaining.login.marketingOptIn`
 * or `marketingEmails.description` changes meaning.
 */
export const MARKETING_CONSENT_WORDING = "launches-and-free-offers-2026-11";

export type MarketingConsentSource = "sign_in" | "settings";

/**
 * The consent record kept in the Supabase user's `user_metadata`. It is the
 * account's own profile data, so it is deleted with the account, and the
 * person can change it from Settings → Privacy at any time.
 */
export interface MarketingConsent {
  marketing_emails: boolean;
  marketing_emails_updated_at: string;
  marketing_emails_source: MarketingConsentSource;
  marketing_emails_wording: string;
}

export const buildMarketingConsent = (
  enabled: boolean,
  source: MarketingConsentSource,
  now: Date = new Date()
): MarketingConsent => ({
  marketing_emails: enabled,
  marketing_emails_updated_at: now.toISOString(),
  marketing_emails_source: source,
  marketing_emails_wording: MARKETING_CONSENT_WORDING
});

/** True only when the person has said yes. No record reads as no. */
export const hasMarketingConsent = (
  user: Pick<User, "user_metadata"> | null | undefined
): boolean => user?.user_metadata?.marketing_emails === true;

/**
 * Remember the sign-in checkbox across the OAuth redirect. Only a yes is kept:
 * leaving the box unchecked must not withdraw consent someone gave earlier.
 */
export const markMarketingOptInPending = (optIn: boolean): void => {
  try {
    if (optIn) {
      sessionStorage.setItem(PENDING_OPT_IN_KEY, "1");
    } else {
      sessionStorage.removeItem(PENDING_OPT_IN_KEY);
    }
  } catch {
    // sessionStorage is unavailable in private mode and sandboxed iframes. The
    // opt-in is then lost, which errs on the side of sending no email; the
    // person can still turn it on in Settings.
  }
};

const takePendingOptIn = (): boolean => {
  try {
    const pending = sessionStorage.getItem(PENDING_OPT_IN_KEY) === "1";
    sessionStorage.removeItem(PENDING_OPT_IN_KEY);
    return pending;
  } catch {
    return false;
  }
};

/** Store the person's choice on their account. */
export const saveMarketingConsent = async (
  enabled: boolean,
  source: MarketingConsentSource
): Promise<void> => {
  const { error } = await supabase.auth.updateUser({
    data: buildMarketingConsent(enabled, source)
  });
  if (error) {
    throw error;
  }
};

/**
 * After a sign-in returns from Google, record the opt-in the person ticked
 * before leaving. Best-effort: a failure costs the opt-in, not the sign-in.
 */
export const applyPendingMarketingOptIn = async (
  session: Session | null
): Promise<void> => {
  if (!session?.user) {
    return;
  }
  if (!takePendingOptIn()) {
    return;
  }
  if (hasMarketingConsent(session.user)) {
    return;
  }
  try {
    await saveMarketingConsent(true, "sign_in");
  } catch (error) {
    console.warn("Marketing consent: saving the sign-in opt-in failed", error);
  }
};
