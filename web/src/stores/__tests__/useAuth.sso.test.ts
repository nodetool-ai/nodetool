/**
 * @jest-environment jsdom
 */
jest.mock("../../lib/runtimeConfig", () => ({
  getRuntimeConfig: () => ({ authRedirectUrl: null, googleScopes: [] }),
  isAuthRequired: () => true,
  isSsoMode: () => true,
  isGoogleWorkspaceEnabled: () => false,
  isRuntimeConfigFromBackend: () => true
}));
jest.mock("../../stores/BASE_URL", () => ({
  BASE_URL: "http://api.example.com"
}));

import { useAuth } from "../useAuth";
import { clearSsoSession, getSsoToken } from "../../lib/ssoSession";
import { getAccessSession } from "../../lib/auth";

const tokenFor = (payload: Record<string, unknown>): string =>
  `nts_eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

describe("useAuth in SSO mode", () => {
  beforeEach(() => {
    clearSsoSession();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("signs in from the session the backend put in the fragment", async () => {
    const token = tokenFor({
      sub: "b".repeat(32),
      exp: Math.floor(Date.now() / 1000) + 600,
      email: "ada@example.com"
    });
    window.history.replaceState(null, "", `/#nodetool_sso=${token}`);
    await useAuth.getState().initialize();
    expect(useAuth.getState().state).toBe("logged_in");
    expect(useAuth.getState().user).toMatchObject({
      id: "b".repeat(32),
      email: "ada@example.com"
    });
    await expect(getAccessSession()).resolves.toEqual({
      token,
      userId: "b".repeat(32)
    });
  });

  it("shows the login screen with no session, and the error after a refusal", async () => {
    await useAuth.getState().initialize();
    expect(useAuth.getState().state).toBe("logged_out");

    window.history.replaceState(null, "", "/#nodetool_sso_error=not_allowed");
    await useAuth.getState().initialize();
    expect(useAuth.getState().state).toBe("error");
    expect(useAuth.getState().error).toBe("not_allowed");
  });

  it("returns to the login screen when the session expires", async () => {
    const realNow = Date.now();
    const token = tokenFor({ sub: "u1", exp: Math.floor(realNow / 1000) + 60 });
    window.history.replaceState(null, "", `/#nodetool_sso=${token}`);
    await useAuth.getState().initialize();
    expect(useAuth.getState().state).toBe("logged_in");

    jest.spyOn(Date, "now").mockReturnValue(realNow + 120_000);
    expect(getSsoToken()).toBeNull();
    expect(useAuth.getState().state).toBe("logged_out");
    jest.restoreAllMocks();
  });

  it("signs out by dropping the session", async () => {
    const token = tokenFor({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 600 });
    window.history.replaceState(null, "", `/#nodetool_sso=${token}`);
    await useAuth.getState().initialize();
    await useAuth.getState().signOut();
    expect(useAuth.getState().state).toBe("logged_out");
    expect(getSsoToken()).toBeNull();
  });
});
