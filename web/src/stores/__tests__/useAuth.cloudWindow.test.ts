/**
 * @jest-environment jsdom
 */
jest.mock("../../lib/runtimeConfig", () => ({
  getRuntimeConfig: () => ({ authRedirectUrl: null, googleScopes: [] }),
  isAuthRequired: () => true,
  isSsoMode: () => false,
  isGoogleWorkspaceEnabled: () => false,
  isRuntimeConfigFromBackend: () => true
}));
jest.mock("../../stores/BASE_URL", () => ({ BASE_URL: "https://api.nodetool.ai" }));
jest.mock("../../lib/cloud/cloudWindow", () => ({
  CLOUD_WINDOW: { server: "https://api.nodetool.ai", account: "u1" },
  isCloudWindow: () => true
}));

import { useAuth } from "../useAuth";
import { getAccessSession } from "../../lib/auth";

describe("useAuth in the desktop app's cloud window", () => {
  it("is signed in as the shared account, with no token in the page", async () => {
    await useAuth.getState().initialize();
    expect(useAuth.getState().state).toBe("logged_in");
    expect(useAuth.getState().user).toEqual({ id: "u1" });
    expect(useAuth.getState().session).toBeNull();
    await expect(getAccessSession()).resolves.toBeNull();
  });
});
