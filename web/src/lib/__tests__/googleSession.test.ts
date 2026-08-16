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

import {
  markWorkspaceGrantPending,
  syncGoogleProviderToken
} from "../googleSession";

const WORKSPACE_SCOPES = ["https://www.googleapis.com/auth/drive"];

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

const googleSession = (
  overrides: Partial<Session> = {}
): Session =>
  ({
    provider_token: "ya29.provider",
    provider_refresh_token: "refresh-1",
    user: {
      email: "alice@example.com",
      app_metadata: { provider: "google" }
    },
    ...overrides
  }) as unknown as Session;

describe("syncGoogleProviderToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGoogleEnabled = true;
    installSessionStorage();
    mockRestFetch.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  it("posts the provider tokens after a Workspace connect", async () => {
    markWorkspaceGrantPending(WORKSPACE_SCOPES);
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
    markWorkspaceGrantPending(WORKSPACE_SCOPES);
    await syncGoogleProviderToken(googleSession());
    expect(mockRestFetch).not.toHaveBeenCalled();
  });

  // Signing in no longer asks for the Workspace scopes, so a login session
  // carries a provider token good for identity alone. Posting it would register
  // a Workspace connection that cannot read anything.
  it("does not post after a plain login that asked for no Workspace scopes", async () => {
    await syncGoogleProviderToken(googleSession());
    expect(mockRestFetch).not.toHaveBeenCalled();
  });

  it("consumes the grant so a later session does not re-post", async () => {
    markWorkspaceGrantPending(WORKSPACE_SCOPES);
    await syncGoogleProviderToken(googleSession());
    await syncGoogleProviderToken(googleSession());
    expect(mockRestFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the grant when the session carries no provider token", async () => {
    markWorkspaceGrantPending(WORKSPACE_SCOPES);
    await syncGoogleProviderToken(
      googleSession({ provider_token: null } as Partial<Session>)
    );
    expect(mockRestFetch).not.toHaveBeenCalled();

    // The grant survives, so the session that does carry the token still posts.
    await syncGoogleProviderToken(googleSession());
    expect(mockRestFetch).toHaveBeenCalledTimes(1);
  });

  it("ignores a session issued by another provider", async () => {
    markWorkspaceGrantPending(WORKSPACE_SCOPES);
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
    markWorkspaceGrantPending(WORKSPACE_SCOPES);
    mockRestFetch.mockRejectedValue(new Error("network down"));
    await expect(
      syncGoogleProviderToken(googleSession())
    ).resolves.toBeUndefined();
  });
});
