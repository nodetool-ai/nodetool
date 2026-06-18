import { describe, it, expect, afterEach } from "vitest";
import { LocalCallbackServer } from "../../../src/providers/oauth/local-callback-server.js";
import {
  AuthorizationDeniedError,
  CallbackTimeoutError,
  StateMismatchError
} from "../../../src/providers/oauth/errors.js";

let server: LocalCallbackServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

/** Drive the real loopback server by issuing an HTTP GET to its redirect URI. */
async function hit(redirectUri: string, params: Record<string, string>): Promise<number> {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  return res.status;
}

describe("LocalCallbackServer", () => {
  it("resolves with the code when state matches", async () => {
    server = new LocalCallbackServer();
    const { redirectUri } = await server.listen();

    const waiting = server.waitForCode({ expectedState: "st-1", timeoutMs: 5000 });
    const status = await hit(redirectUri, { code: "the-code", state: "st-1" });

    expect(status).toBe(200);
    await expect(waiting).resolves.toEqual({ code: "the-code", state: "st-1" });
  });

  it("rejects with StateMismatchError on a forged state (CSRF guard)", async () => {
    server = new LocalCallbackServer();
    const { redirectUri } = await server.listen();

    const waiting = server.waitForCode({ expectedState: "expected", timeoutMs: 5000 });
    // Attach the rejection handler before triggering the callback so the
    // (correctly) rejected promise is never momentarily unhandled.
    const rejected = expect(waiting).rejects.toBeInstanceOf(StateMismatchError);
    const status = await hit(redirectUri, { code: "x", state: "attacker" });

    expect(status).toBe(400);
    await rejected;
  });

  it("rejects with AuthorizationDeniedError when the server returns access_denied", async () => {
    server = new LocalCallbackServer();
    const { redirectUri } = await server.listen();

    const waiting = server.waitForCode({ expectedState: "st", timeoutMs: 5000 });
    const rejected = expect(waiting).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await hit(redirectUri, { error: "access_denied", state: "st" });

    await rejected;
  });

  it("rejects with CallbackTimeoutError when no callback arrives", async () => {
    server = new LocalCallbackServer();
    await server.listen();
    await expect(
      server.waitForCode({ expectedState: "st", timeoutMs: 50 })
    ).rejects.toBeInstanceOf(CallbackTimeoutError);
  });

  it("exposes a loopback redirect URI with the bound port", async () => {
    server = new LocalCallbackServer({ path: "/cb" });
    const { port, redirectUri } = await server.listen();
    expect(redirectUri).toBe(`http://127.0.0.1:${port}/cb`);
  });
});
