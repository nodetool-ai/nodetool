/**
 * @jest-environment node
 */

import type { Session } from "@supabase/supabase-js";
import { stub } from "../../test-utils/doubles";

const mockUpdateUser = jest.fn();

jest.mock("../supabaseClient", () => ({
  supabase: {
    auth: { updateUser: (...args: unknown[]) => mockUpdateUser(...args) }
  }
}));

import {
  MARKETING_CONSENT_WORDING,
  applyPendingMarketingOptIn,
  buildMarketingConsent,
  hasMarketingConsent,
  markMarketingOptInPending,
  saveMarketingConsent
} from "../marketingConsent";

// The module reads sessionStorage, which the node test environment lacks.
const installSessionStorage = (): void => {
  const store = new Map<string, string>();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear()
  };
};

const sessionWith = (metadata: Record<string, unknown> = {}): Session =>
  stub<Session>({ user: { id: "u1", user_metadata: metadata } });

describe("marketing consent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installSessionStorage();
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
  });

  it("records the choice, its time, source and wording", () => {
    const now = new Date("2026-11-13T12:00:00.000Z");
    expect(buildMarketingConsent(true, "sign_in", now)).toEqual({
      marketing_emails: true,
      marketing_emails_updated_at: "2026-11-13T12:00:00.000Z",
      marketing_emails_source: "sign_in",
      marketing_emails_wording: MARKETING_CONSENT_WORDING
    });
  });

  it("reads no record as no consent", () => {
    expect(hasMarketingConsent(null)).toBe(false);
    expect(hasMarketingConsent(sessionWith().user)).toBe(false);
    expect(
      hasMarketingConsent(sessionWith({ marketing_emails: "true" }).user)
    ).toBe(false);
    expect(
      hasMarketingConsent(sessionWith({ marketing_emails: true }).user)
    ).toBe(true);
  });

  it("saves a ticked sign-in opt-in once the session returns", async () => {
    markMarketingOptInPending(true);
    await applyPendingMarketingOptIn(sessionWith());
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser.mock.calls[0][0].data).toMatchObject({
      marketing_emails: true,
      marketing_emails_source: "sign_in"
    });

    // The marker is consumed, so a later sign-in does not write again.
    await applyPendingMarketingOptIn(sessionWith());
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the box was left unchecked", async () => {
    markMarketingOptInPending(true);
    markMarketingOptInPending(false);
    await applyPendingMarketingOptIn(sessionWith({ marketing_emails: true }));
    await applyPendingMarketingOptIn(sessionWith());
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("keeps the earlier record when the person already opted in", async () => {
    markMarketingOptInPending(true);
    await applyPendingMarketingOptIn(sessionWith({ marketing_emails: true }));
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("keeps the marker until a session exists", async () => {
    markMarketingOptInPending(true);
    await applyPendingMarketingOptIn(null);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    await applyPendingMarketingOptIn(sessionWith());
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
  });

  it("does not fail the sign-in when saving fails", async () => {
    mockUpdateUser.mockResolvedValue({ data: {}, error: new Error("down") });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    markMarketingOptInPending(true);
    await expect(applyPendingMarketingOptIn(sessionWith())).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it("lets Settings withdraw consent", async () => {
    await saveMarketingConsent(false, "settings");
    expect(mockUpdateUser.mock.calls[0][0].data).toMatchObject({
      marketing_emails: false,
      marketing_emails_source: "settings"
    });
  });
});
