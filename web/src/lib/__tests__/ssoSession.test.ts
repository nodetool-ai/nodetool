/**
 * @jest-environment jsdom
 */
jest.mock("../../stores/BASE_URL", () => ({
  BASE_URL: "http://api.example.com"
}));

import {
  captureSsoRedirect,
  clearSsoSession,
  getSsoToken,
  getSsoUser,
  onSsoSessionExpired
} from "../ssoSession";

const NOW = 1_800_000_000_000;

/** A session token as the server shapes it. The signature is the server's to check. */
const tokenFor = (payload: Record<string, unknown>): string =>
  `nts_eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

const validToken = tokenFor({
  sub: "a".repeat(32),
  exp: NOW / 1000 + 3600,
  email: "ada@example.com",
  name: "Ada"
});

describe("ssoSession", () => {
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(NOW);
    clearSsoSession();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("takes the session out of the fragment and strips it from the URL", () => {
    window.history.replaceState(null, "", `/workspace?x=1#nodetool_sso=${validToken}`);
    expect(captureSsoRedirect()).toBeNull();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname + window.location.search).toBe("/workspace?x=1");
    expect(getSsoToken()).toBe(validToken);
    expect(getSsoUser()).toEqual({
      id: "a".repeat(32),
      email: "ada@example.com",
      name: "Ada"
    });
  });

  it("keeps the session across reloads through local storage", () => {
    window.history.replaceState(null, "", `/#nodetool_sso=${validToken}`);
    captureSsoRedirect();
    expect(window.localStorage.getItem("nodetool.ssoSession")).toBe(validToken);
  });

  it("returns the failure code and strips it", () => {
    window.history.replaceState(null, "", "/#nodetool_sso_error=not_allowed");
    expect(captureSsoRedirect()).toBe("not_allowed");
    expect(window.location.hash).toBe("");
    expect(getSsoToken()).toBeNull();
  });

  it("ignores a fragment that is not ours", () => {
    window.history.replaceState(null, "", "/#section-2");
    expect(captureSsoRedirect()).toBeNull();
    expect(window.location.hash).toBe("#section-2");
  });

  it("drops an expired session and tells listeners", () => {
    const expired = tokenFor({ sub: "u1", exp: NOW / 1000 - 1 });
    window.localStorage.setItem("nodetool.ssoSession", expired);
    const listener = jest.fn();
    const unsubscribe = onSsoSessionExpired(listener);
    expect(getSsoToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("nodetool.ssoSession")).toBeNull();
    unsubscribe();
  });

  it("refuses a token of another kind", () => {
    window.history.replaceState(null, "", "/#nodetool_sso=eyJhbGciOi.payload.sig");
    expect(captureSsoRedirect()).toBe("invalid_session");
    expect(getSsoToken()).toBeNull();
  });
});
