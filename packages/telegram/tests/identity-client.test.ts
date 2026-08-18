import { describe, expect, it } from "vitest";

import {
  IdentityClient,
  IdentityError,
  TOKEN_EXPIRY_SLACK_MS
} from "../src/identity-client.js";

interface Call {
  url: string;
  method: string;
  body: unknown;
  authorization: string | null;
}

interface Reply {
  status: number;
  body: unknown;
}

/** A fetch that answers scripted replies and records every request. */
function fakeFetch(replies: Reply[]): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      authorization: headers.authorization ?? null
    });
    const reply = replies.shift();
    if (reply === undefined) {
      throw new Error("fake fetch ran out of scripted replies");
    }
    return new Response(reply.body === null ? "" : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function tokenReply(token: string, expiresAtMs: number, userId = "user-7"): Reply {
  return {
    status: 200,
    body: { token, expires_at: new Date(expiresAtMs).toISOString(), user_id: userId }
  };
}

function client(fetchImpl: typeof fetch, now: () => number) {
  return new IdentityClient({
    apiUrl: "http://server:7777/",
    integrationToken: "service-token",
    fetch: fetchImpl,
    now
  });
}

describe("IdentityClient.resolve", () => {
  it("mints a token and serves later calls from cache", async () => {
    let clock = 1_000_000;
    const { fetch, calls } = fakeFetch([tokenReply("tok-1", clock + 3_600_000)]);
    const identity = client(fetch, () => clock);

    const first = await identity.resolve("12345");
    expect(first).toEqual({
      unlinked: false,
      token: "tok-1",
      userId: "user-7",
      expiresAtMs: clock + 3_600_000
    });

    clock += 60_000;
    const second = await identity.resolve("12345");
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://server:7777/api/integrations/telegram/token");
    expect(calls[0].authorization).toBe("Bearer service-token");
    expect(calls[0].body).toEqual({ external_id: "12345" });
  });

  it("re-mints once the token is inside the expiry slack", async () => {
    let clock = 1_000_000;
    const expiry = clock + 3_600_000;
    const { fetch, calls } = fakeFetch([
      tokenReply("tok-1", expiry),
      tokenReply("tok-2", expiry + 3_600_000)
    ]);
    const identity = client(fetch, () => clock);

    await identity.resolve("12345");
    // One millisecond before the slack window opens the cache still answers.
    clock = expiry - TOKEN_EXPIRY_SLACK_MS - 1;
    expect(await identity.resolve("12345")).toMatchObject({ token: "tok-1" });
    expect(calls).toHaveLength(1);

    clock = expiry - TOKEN_EXPIRY_SLACK_MS;
    expect(await identity.resolve("12345")).toMatchObject({ token: "tok-2" });
    expect(calls).toHaveLength(2);
  });

  it("reports an unlinked account rather than throwing", async () => {
    const { fetch } = fakeFetch([
      { status: 404, body: { error: "This account is not linked to a NodeTool user" } }
    ]);
    const identity = client(fetch, () => 0);

    expect(await identity.resolve("12345")).toEqual({
      unlinked: true,
      reason: "not-linked",
      message: "This account is not linked to a NodeTool user"
    });
  });

  it("reports local single-user mode as its own reason", async () => {
    const { fetch } = fakeFetch([{ status: 409, body: { error: "local single-user mode" } }]);
    const identity = client(fetch, () => 0);

    expect(await identity.resolve("12345")).toEqual({
      unlinked: true,
      reason: "local-mode",
      message: "local single-user mode"
    });
  });

  it("does not cache a 404, so linking takes effect on the next message", async () => {
    const { fetch, calls } = fakeFetch([
      { status: 404, body: { error: "nope" } },
      tokenReply("tok-1", 10_000_000)
    ]);
    const identity = client(fetch, () => 0);

    expect(await identity.resolve("12345")).toMatchObject({ unlinked: true });
    expect(await identity.resolve("12345")).toMatchObject({ token: "tok-1" });
    expect(calls).toHaveLength(2);
  });

  it("surfaces a transport failure as an IdentityError", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const identity = client(fetchImpl, () => 0);

    await expect(identity.resolve("12345")).rejects.toBeInstanceOf(IdentityError);
    await expect(identity.resolve("12345")).rejects.toThrow(/ECONNREFUSED/);
  });

  it("surfaces an unexpected status with the server's message", async () => {
    const { fetch } = fakeFetch([{ status: 401, body: { error: "Unauthorized" } }]);
    const identity = client(fetch, () => 0);

    await expect(identity.resolve("12345")).rejects.toMatchObject({
      name: "IdentityError",
      status: 401,
      message: "Unauthorized"
    });
  });

  it("forgets a token the server has refused", async () => {
    const { fetch, calls } = fakeFetch([
      tokenReply("tok-1", 10_000_000),
      tokenReply("tok-2", 10_000_000)
    ]);
    const identity = client(fetch, () => 0);

    await identity.resolve("12345");
    identity.invalidate("12345");
    expect(await identity.resolve("12345")).toMatchObject({ token: "tok-2" });
    expect(calls).toHaveLength(2);
  });
});

describe("IdentityClient link flows", () => {
  it("mints a link code and URL", async () => {
    const { fetch, calls } = fakeFetch([
      {
        status: 200,
        body: { code: "abc", url: "http://server/integrations/link?code=abc", expires_at: "2026-01-01T00:00:00Z" }
      }
    ]);
    const identity = client(fetch, () => 0);

    expect(await identity.linkStart("12345")).toEqual({
      code: "abc",
      url: "http://server/integrations/link?code=abc",
      expiresAt: "2026-01-01T00:00:00Z"
    });
    expect(calls[0].url).toBe("http://server:7777/api/integrations/telegram/link/start");
  });

  it("reports a used or expired code from /start <code>", async () => {
    const { fetch } = fakeFetch([
      { status: 410, body: { error: "This link code has expired or was already used" } }
    ]);
    const identity = client(fetch, () => 0);

    expect(await identity.completeDeepLink("12345", "abc")).toEqual({
      ok: false,
      reason: "expired",
      message: "This link code has expired or was already used"
    });
  });

  it("reports the web-minted-code direction as unsupported when the route needs a user_id", async () => {
    const { fetch, calls } = fakeFetch([
      { status: 400, body: { error: "external_id, code and user_id are required" } }
    ]);
    const identity = client(fetch, () => 0);

    expect(await identity.completeDeepLink("12345", "abc")).toEqual({
      ok: false,
      reason: "unsupported",
      message: "external_id, code and user_id are required"
    });
    expect(calls[0].body).toEqual({ external_id: "12345", code: "abc" });
  });

  it("distinguishes a code issued for a different account", async () => {
    const { fetch } = fakeFetch([
      { status: 400, body: { error: "This link code was issued for a different account" } }
    ]);
    const identity = client(fetch, () => 0);

    expect(await identity.completeDeepLink("12345", "abc")).toMatchObject({
      ok: false,
      reason: "mismatch"
    });
  });

  it("completes a code the route accepts", async () => {
    const { fetch } = fakeFetch([{ status: 200, body: { linked: true } }]);
    const identity = client(fetch, () => 0);

    expect(await identity.completeDeepLink("12345", "abc")).toEqual({ ok: true });
  });

  it("unlinks and drops the cached token", async () => {
    const { fetch, calls } = fakeFetch([
      tokenReply("tok-1", 10_000_000),
      { status: 200, body: { unlinked: true } },
      { status: 404, body: { error: "not linked" } }
    ]);
    const identity = client(fetch, () => 0);

    await identity.resolve("12345");
    expect(await identity.unlink("12345")).toBe(true);
    expect(calls[1].method).toBe("DELETE");
    expect(await identity.resolve("12345")).toMatchObject({ unlinked: true });
  });
});
