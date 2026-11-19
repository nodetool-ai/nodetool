/**
 * The desktop app's side of the shared cloud sign-in (TC110, TC111, TC114).
 * The helper process is a fake: two streams and an exit event.
 */
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import type { ChildProcessWithoutNullStreams } from "child_process";

const IpcChannels = { CLOUD_ACCOUNT_EVENT: "cloud-account-event" } as const;
jest.mock("../types.d", () => ({ IpcChannels }));
jest.mock("electron", () => jest.requireActual("../__mocks__/electron"));
jest.mock("../logger", () => ({ logMessage: jest.fn() }));

import {
  CloudAccount,
  canonicalHttpsOrigin,
  forwardRequest,
  isAuthorizeUrl,
  mayForward,
  stateFromHelper,
  type CloudAccountDeps,
  type FetchLike,
  type HelperHttpRequest,
} from "../cloudAccount";
import type { CloudAccountState } from "../types.d";

const ORIGIN = "https://api.nodetool.ai";

function request(overrides: Partial<HelperHttpRequest> = {}): HelperHttpRequest {
  return {
    id: 1,
    method: "POST",
    url: `${ORIGIN}/oauth/token`,
    headers: [["Content-Type", "application/x-www-form-urlencoded"]],
    body: "grant_type=refresh_token",
    timeoutMs: 1000,
    requiredOrigin: ORIGIN,
    ...overrides,
  };
}

function response(status: number, body: string, type = "basic"): Response {
  return { status, type, text: async () => body } as unknown as Response;
}

describe("canonicalHttpsOrigin", () => {
  test("keeps an HTTPS origin and drops anything else", () => {
    expect(canonicalHttpsOrigin("https://API.nodetool.ai/")).toBe(ORIGIN);
    expect(canonicalHttpsOrigin("http://api.nodetool.ai")).toBeNull();
    expect(canonicalHttpsOrigin("https://user:pw@api.nodetool.ai")).toBeNull();
    expect(canonicalHttpsOrigin("not a url")).toBeNull();
  });
});

describe("TC110: requests go to the session's server only", () => {
  test("mayForward refuses another origin, plain HTTP, credentials in the URL and a mismatched origin", () => {
    expect(mayForward(request(), ORIGIN)).toBe(true);
    expect(mayForward(request({ url: "https://evil.example/oauth/token" }), ORIGIN)).toBe(false);
    expect(mayForward(request({ url: "http://api.nodetool.ai/oauth/token" }), ORIGIN)).toBe(false);
    expect(mayForward(request({ url: "https://u:p@api.nodetool.ai/oauth/token" }), ORIGIN)).toBe(false);
    expect(mayForward(request({ requiredOrigin: "https://other.example" }), ORIGIN)).toBe(false);
    expect(mayForward(request({ method: "DELETE" }), ORIGIN)).toBe(false);
    expect(mayForward(request(), null)).toBe(false);
  });

  test("forwardRequest never calls fetch for a refused request", async () => {
    const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>();
    const result = await forwardRequest(
      request({ url: "https://evil.example/oauth/token" }),
      ORIGIN,
      fetchImpl,
      new AbortController().signal,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.status).toBe(0);
  });

  test("forwardRequest asks for manual redirects and returns a 3xx as it is", async () => {
    const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(async () =>
      response(302, ""),
    );
    const result = await forwardRequest(request(), ORIGIN, fetchImpl, new AbortController().signal);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "manual", method: "POST" });
    expect(result).toEqual({ status: 302, body: "" });
  });

  test("an opaque redirect and a failed fetch both come back as status 0", async () => {
    const opaque = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(async () =>
      response(0, "", "opaqueredirect"),
    );
    expect((await forwardRequest(request(), ORIGIN, opaque, new AbortController().signal)).status).toBe(0);
    const failing = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(async () => {
      throw new Error("offline");
    });
    expect((await forwardRequest(request(), ORIGIN, failing, new AbortController().signal)).status).toBe(0);
  });
});

describe("TC111: the browser opens the server's authorize page only", () => {
  test("isAuthorizeUrl", () => {
    expect(isAuthorizeUrl(`${ORIGIN}/oauth/authorize?client_id=x`, ORIGIN)).toBe(true);
    expect(isAuthorizeUrl(`${ORIGIN}/oauth/token`, ORIGIN)).toBe(false);
    expect(isAuthorizeUrl("https://evil.example/oauth/authorize", ORIGIN)).toBe(false);
    expect(isAuthorizeUrl("http://api.nodetool.ai/oauth/authorize", ORIGIN)).toBe(false);
    expect(isAuthorizeUrl("file:///etc/passwd", ORIGIN)).toBe(false);
    expect(isAuthorizeUrl(`${ORIGIN}/oauth/authorize`, null)).toBe(false);
  });
});

describe("stateFromHelper", () => {
  test("copies the known fields only", () => {
    const state = stateFromHelper({
      type: "state",
      state: "signedIn",
      displayName: "Ada",
      serverOrigin: ORIGIN,
      serverEndPending: false,
      cloudAvailable: true,
      keychainAvailable: true,
      message: "",
      accessToken: "ntd_secret",
    });
    expect(state).toEqual({
      state: "signedIn",
      displayName: "Ada",
      serverOrigin: ORIGIN,
      serverEndPending: false,
      cloudAvailable: true,
      keychainAvailable: true,
      message: "",
    });
    expect(stateFromHelper({ state: "anything" }).state).toBe("signedOut");
  });
});

class FakeHelper extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly received: Record<string, unknown>[] = [];

  constructor() {
    super();
    let buffer = "";
    this.stdin.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        this.received.push(JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    });
  }

  say(message: Record<string, unknown>): void {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function setup(overrides: Partial<CloudAccountDeps> = {}) {
  const helpers: FakeHelper[] = [];
  const states: CloudAccountState[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(async () =>
    response(200, '{"access_token":"ntd_secret","refresh_token":"ntr_secret"}'),
  );
  const openExternal = jest.fn(async () => {});
  const account = new CloudAccount({
    helperPath: "/app/account-helper/nodetool-account-helper",
    server: ORIGIN,
    spawnHelper: () => {
      const helper = new FakeHelper();
      helpers.push(helper);
      return helper as unknown as ChildProcessWithoutNullStreams;
    },
    fetch: fetchImpl,
    cloudFetch: jest.fn(),
    localOrigin: () => "http://127.0.0.1:7777",
    localClientToken: () => "local-token",
    openExternal,
    onState: (state) => states.push(state),
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    log: () => {},
    ...overrides,
  });
  return { account, helpers, states, timers, fetchImpl, openExternal };
}

describe("CloudAccount", () => {
  test("is unavailable without a helper and spawns nothing", () => {
    const spawnHelper = jest.fn();
    const { account } = setup({ helperPath: null, spawnHelper });
    account.start();
    expect(spawnHelper).not.toHaveBeenCalled();
    expect(account.state()).toMatchObject({ available: false, state: "signedOut" });
  });

  test("TC114: the window never receives a token, even when responses carry them", async () => {
    const { account, helpers, states, fetchImpl } = setup();
    account.start();
    const helper = helpers[0];
    helper.say({ type: "http", ...request({ id: 7 }), headers: [["Authorization", "Bearer ntd_old"]] });
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(helper.received).toContainEqual(
      expect.objectContaining({ type: "httpResponse", id: 7, status: 200 }),
    );
    helper.say({
      type: "state",
      state: "signedIn",
      displayName: "Ada",
      serverOrigin: ORIGIN,
      serverEndPending: false,
      cloudAvailable: true,
      keychainAvailable: true,
      message: "",
      refreshToken: "ntr_secret",
    });
    await settle();
    expect(states.at(-1)).toMatchObject({ available: true, state: "signedIn", displayName: "Ada" });
    expect(JSON.stringify(states)).not.toMatch(/nt[dra]_/);
  });

  test("TC110: a request to another host is answered with status 0 and never sent", async () => {
    const { account, helpers, fetchImpl } = setup();
    account.start();
    helpers[0].say({ type: "http", ...request({ id: 3, url: "https://evil.example/oauth/token" }) });
    await settle();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(helpers[0].received).toContainEqual({ type: "httpResponse", id: 3, status: 0, body: "" });
  });

  test("TC111: opens the authorize page and refuses any other URL", async () => {
    const { account, helpers, openExternal } = setup();
    account.start();
    helpers[0].say({ type: "openBrowser", url: "https://evil.example/oauth/authorize" });
    helpers[0].say({ type: "openBrowser", url: `${ORIGIN}/oauth/authorize?client_id=nodetool-native` });
    await settle();
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith(`${ORIGIN}/oauth/authorize?client_id=nodetool-native`);
    expect(helpers[0].received.filter((m) => m.type === "browserResult")).toEqual([
      { type: "browserResult", opened: false },
      { type: "browserResult", opened: true },
    ]);
  });

  test("sends the window's commands to the helper", async () => {
    const { account, helpers } = setup();
    account.start();
    account.signIn();
    account.cancelSignIn();
    account.signOut();
    await settle();
    expect(helpers[0].received.map((m) => m.type)).toEqual(["signIn", "cancelSignIn", "signOut"]);
  });

  test("restarts the helper after 1, 5 and 30 seconds, then reports it unavailable", () => {
    const { account, helpers, timers, states } = setup();
    account.start();
    for (const expected of [1000, 5000, 30000]) {
      helpers.at(-1)!.emit("exit", 1);
      expect(timers.at(-1)!.ms).toBe(expected);
      timers.at(-1)!.fn();
    }
    expect(helpers).toHaveLength(4);
    helpers.at(-1)!.emit("exit", 1);
    expect(timers).toHaveLength(3);
    expect(states.at(-1)).toMatchObject({ available: false });
  });

  test("dispose closes the helper's input and does not restart it", () => {
    const { account, helpers, timers } = setup();
    account.start();
    const ended = jest.fn();
    helpers[0].stdin.on("finish", ended);
    account.dispose();
    helpers[0].emit("exit", 0);
    expect(timers).toHaveLength(0);
    return new Promise<void>((resolve) => setImmediate(() => {
      expect(ended).toHaveBeenCalled();
      resolve();
    }));
  });
});
