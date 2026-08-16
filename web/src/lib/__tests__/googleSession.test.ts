/**
 * @jest-environment node
 */

import type { Session } from "@supabase/supabase-js";

const mockRestFetch = jest.fn();
let mockGoogleEnabled = true;

jest.mock("../rest-fetch", () => ({
  restFetch: (...args: unknown[]) => mockRestFetch(...args)
}));

jest.mock("../runtimeConfig", () => ({
  isGoogleWorkspaceEnabled: () => mockGoogleEnabled,
  getRuntimeConfig: () => ({
    googleScopes: ["https://www.googleapis.com/auth/drive"]
  })
}));

import { syncGoogleProviderToken } from "../googleSession";
import { stub } from "../../test-utils/doubles";

const googleSession = (
  overrides: Partial<Session> = {}
): Session =>
  stub<Session>({
    provider_token: "ya29.provider",
    provider_refresh_token: "refresh-1",
    user: {
      email: "alice@example.com",
      app_metadata: { provider: "google" }
    },
    ...overrides
  });

describe("syncGoogleProviderToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGoogleEnabled = true;
    mockRestFetch.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  it("posts the provider tokens to the backend", async () => {
    await syncGoogleProviderToken(googleSession());

    expect(mockRestFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockRestFetch.mock.calls[0];
    expect(path).toBe("/api/oauth/google/session");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.access_token).toBe("ya29.provider");
    expect(body.refresh_token).toBe("refresh-1");
    expect(body.email).toBe("alice@example.com");
    expect(body.scope).toBe("https://www.googleapis.com/auth/drive");
  });

  it("does nothing without a session", async () => {
    await syncGoogleProviderToken(null);
    expect(mockRestFetch).not.toHaveBeenCalled();
  });

  it("does nothing when the backend has the integration disabled", async () => {
    mockGoogleEnabled = false;
    await syncGoogleProviderToken(googleSession());
    expect(mockRestFetch).not.toHaveBeenCalled();
  });

  it("ignores a session issued by another provider", async () => {
    await syncGoogleProviderToken(
      googleSession({
        user: {
          email: "alice@example.com",
          app_metadata: { provider: "github" }
        }
      } as Partial<Session>)
    );
    expect(mockRestFetch).not.toHaveBeenCalled();
  });

  it("swallows a backend failure so login still completes", async () => {
    mockRestFetch.mockRejectedValue(new Error("network down"));
    await expect(
      syncGoogleProviderToken(googleSession())
    ).resolves.toBeUndefined();
  });
});
