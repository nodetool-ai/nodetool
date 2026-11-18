/**
 * The renderer's cloud requests, transfer calls and media in the desktop app
 * (WP1.14; TC116, TC117, TC119 and TC121, FC31 and FC32 on the main-process
 * side). The helper process is a fake: two streams and an exit event.
 */
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import type { ChildProcessWithoutNullStreams } from "child_process";

const IpcChannels = { CLOUD_ACCOUNT_EVENT: "cloud-account-event" } as const;
jest.mock("../types.d", () => ({ IpcChannels }));
jest.mock("electron", () => jest.requireActual("../__mocks__/electron"));
jest.mock("../logger", () => ({ logMessage: jest.fn() }));

import { CloudAccount, type CloudAccountDeps, type FetchLike } from "../cloudAccount";
import {
  cloudMediaPath,
  cloudMediaResponse,
  cloudRouteAllowed,
  type CloudFetchLike,
  type CloudFetchResponse,
} from "../cloudRequests";
import type { CloudResponse } from "../types.d";

const ORIGIN = "https://api.nodetool.ai";
const LOCAL = "http://127.0.0.1:7777";

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

  last(type: string): Record<string, unknown> | undefined {
    return [...this.received].reverse().find((m) => m.type === type);
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function fetched(status: number, body: string, headers: [string, string][] = []): CloudFetchResponse {
  return {
    status,
    type: "basic",
    headers: { forEach: (fn) => headers.forEach(([name, value]) => fn(value, name)) },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer,
  };
}

const SIGNED_IN = {
  type: "state",
  state: "signedIn",
  displayName: "Ada",
  serverOrigin: ORIGIN,
  serverEndPending: false,
  cloudAvailable: true,
  keychainAvailable: true,
  message: "",
};

async function signedInAccount(overrides: Partial<CloudAccountDeps> = {}) {
  const helpers: FakeHelper[] = [];
  const cloudFetch = jest.fn<ReturnType<CloudFetchLike>, Parameters<CloudFetchLike>>(async () =>
    fetched(200, '{"result":{"data":{"json":[]}}}', [
      ["Content-Type", "application/json"],
      ["Set-Cookie", "session=abc"],
    ]),
  );
  const account = new CloudAccount({
    helperPath: "/app/account-helper/nodetool-account-helper",
    server: ORIGIN,
    spawnHelper: () => {
      const helper = new FakeHelper();
      helpers.push(helper);
      return helper as unknown as ChildProcessWithoutNullStreams;
    },
    fetch: jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(),
    cloudFetch,
    localOrigin: () => LOCAL,
    localClientToken: () => "local-token",
    openExternal: async () => {},
    onState: () => {},
    setTimer: () => {},
    log: () => {},
    ...overrides,
  });
  account.start();
  helpers[0].say(SIGNED_IN);
  await settle();
  return { account, helper: helpers[0], cloudFetch };
}

describe("TC117, FC31: the list of routes", () => {
  test.each([
    ["GET", "/trpc/workflows.get?input=%7B%22id%22%3A%22a%22%7D"],
    ["POST", "/trpc/workflows.list,workflows.get?batch=1"],
    ["GET", "/api/assets/0123456789abcdef0123456789abcdef"],
    ["HEAD", "/api/assets/a1/peaks"],
    ["GET", "/api/sync/capabilities"],
  ])("allows %s %s", (method, path) => {
    expect(cloudRouteAllowed(method, path)).toBe(true);
  });

  test.each([
    ["POST", "/oauth/token"],
    ["GET", "/oauth/authorize"],
    ["POST", "/trpc/agentAccess.createToken"],
    ["POST", "/trpc/workflows.list,agentAccess.approveOauthRequest?batch=1"],
    ["POST", "/trpc/cloudTransfer.link"],
    ["GET", "/api/assets/../oauth/token"],
    ["GET", "/api/assets/%2e%2e/x"],
    ["GET", "/api/assets/a%2fb"],
    ["GET", "//evil.example/api/assets/a"],
    ["GET", "https://evil.example/api/assets/a"],
    ["GET", "/api/workflows"],
    ["GET", "/api/assets/"],
    ["POST", "/api/assets/a"],
    ["DELETE", "/trpc/workflows.delete"],
    ["GET", "/api/assets/a#b"],
    ["GET", "/api/assets/a b"],
    ["GET", "/trpc/"],
    ["GET", ""],
  ])("refuses %s %s", (method, path) => {
    expect(cloudRouteAllowed(method, path)).toBe(false);
  });
});

describe("cloud requests through the account", () => {
  test("TC116: the helper adds the credential, and the renderer's answer holds none", async () => {
    const { account, helper, cloudFetch } = await signedInAccount();
    const answer = account.request({
      method: "POST",
      path: "/trpc/workflows.update",
      headers: { "Content-Type": "application/json", Authorization: "Bearer forged", Cookie: "a=b" },
      body: '{"json":{"id":"w1"}}',
    });
    await settle();
    const request = helper.last("request")!;
    // The helper gets the route only. The body stays in the main process.
    expect(request).toEqual({
      type: "request",
      id: request.id,
      method: "POST",
      path: "/trpc/workflows.update",
      timeoutMs: 60000,
    });
    helper.say({
      type: "http",
      id: 41,
      method: "POST",
      url: `${ORIGIN}/trpc/workflows.update`,
      headers: [["Authorization", "Bearer ntd_access"]],
      body: "",
      timeoutMs: 60000,
      requiredOrigin: ORIGIN,
      request: request.id,
    });
    await settle();
    expect(cloudFetch).toHaveBeenCalledTimes(1);
    const [url, init] = cloudFetch.mock.calls[0];
    expect(url).toBe(`${ORIGIN}/trpc/workflows.update`);
    expect(init).toMatchObject({ method: "POST", redirect: "manual", body: '{"json":{"id":"w1"}}' });
    // The renderer's own Authorization and Cookie never go out.
    expect(init.headers).toEqual([
      ["content-type", "application/json"],
      ["authorization", "Bearer ntd_access"],
    ]);
    expect(helper.received).toContainEqual({ type: "httpResponse", id: 41, status: 200, body: "" });
    helper.say({ type: "response", id: request.id, status: 200, error: "" });
    const result = (await answer) as Extract<CloudResponse, { ok: true }>;
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(new TextDecoder().decode(result.body)).toBe('{"result":{"data":{"json":[]}}}');
    expect(result.headers).toEqual([["content-type", "application/json"]]);
    expect(JSON.stringify({ ...result, body: [...result.body] })).not.toMatch(/ntd_/);
  });

  test("a 401 and the helper's second send: the renderer gets the second answer", async () => {
    const { account, helper, cloudFetch } = await signedInAccount();
    cloudFetch.mockResolvedValueOnce(fetched(401, "stale")).mockResolvedValueOnce(fetched(200, "fresh"));
    const answer = account.request({ method: "GET", path: "/trpc/workflows.list", headers: {} });
    await settle();
    const id = helper.last("request")!.id;
    const http = (n: number) => ({
      type: "http",
      id: n,
      method: "GET",
      url: `${ORIGIN}/trpc/workflows.list`,
      headers: [["Authorization", `Bearer ntd_${n}`]],
      body: "",
      timeoutMs: 60000,
      requiredOrigin: ORIGIN,
      request: id,
    });
    helper.say(http(1));
    await settle();
    helper.say(http(2));
    await settle();
    helper.say({ type: "response", id, status: 200, error: "" });
    const result = await answer;
    expect(result.ok && new TextDecoder().decode(result.body)).toBe("fresh");
  });

  test("an http message that matches no pending request is answered 0 and never sent", async () => {
    const { account, helper, cloudFetch } = await signedInAccount();
    void account.request({ method: "GET", path: "/trpc/workflows.list", headers: {} });
    await settle();
    const id = helper.last("request")!.id;
    const base = {
      type: "http",
      method: "GET",
      headers: [["Authorization", "Bearer ntd_x"]],
      body: "",
      timeoutMs: 60000,
      requiredOrigin: ORIGIN,
    };
    helper.say({ ...base, id: 1, url: "https://evil.example/trpc/workflows.list", request: id });
    helper.say({ ...base, id: 2, url: `${ORIGIN}/trpc/workflows.delete`, request: id });
    helper.say({ ...base, id: 3, url: `${ORIGIN}/trpc/workflows.list`, request: 9999 });
    helper.say({ ...base, id: 4, url: `${ORIGIN}/trpc/workflows.list`, method: "POST", request: id });
    await settle();
    expect(cloudFetch).not.toHaveBeenCalled();
    for (const httpId of [1, 2, 3, 4]) {
      expect(helper.received).toContainEqual({ type: "httpResponse", id: httpId, status: 0, body: "" });
    }
  });

  test("a route off the list and a signed-out account send nothing", async () => {
    const { account, helper } = await signedInAccount();
    expect(await account.request({ method: "POST", path: "/oauth/token", headers: {} })).toEqual({
      ok: false,
      error: "REFUSED",
    });
    helper.say({ ...SIGNED_IN, state: "signedOut" });
    await settle();
    expect(await account.request({ method: "GET", path: "/trpc/workflows.list", headers: {} })).toEqual({
      ok: false,
      error: "SIGNED_OUT",
    });
    expect(helper.received.filter((m) => m.type === "request")).toHaveLength(0);
  });

  test("TC119: a sign-out ends every pending request with SIGNED_OUT and cancels it in the helper", async () => {
    const { account, helper } = await signedInAccount();
    const answers = [1, 2, 3].map(() => account.request({ method: "GET", path: "/trpc/workflows.list", headers: {} }));
    await settle();
    const ids = helper.received.filter((m) => m.type === "request").map((m) => m.id);
    helper.say({ ...SIGNED_IN, state: "signedOut" });
    await settle();
    for (const answer of answers) {
      expect(await answer).toEqual({ ok: false, error: "SIGNED_OUT" });
    }
    const cancels = helper.received.filter((m) => m.type === "requestCancel").map((m) => m.id);
    expect(cancels).toEqual(ids);
  });

  test("a helper that exits ends every pending request as offline", async () => {
    const { account, helper } = await signedInAccount();
    const answer = account.request({ method: "GET", path: "/trpc/workflows.list", headers: {} });
    await settle();
    helper.emit("exit", 1);
    expect(await answer).toEqual({ ok: false, error: "OFFLINE" });
  });
});

describe("transfer calls", () => {
  test("TC122, FC32: the call goes to this app's local server with the local client token", async () => {
    const { account, helper, cloudFetch } = await signedInAccount();
    cloudFetch.mockResolvedValueOnce(fetched(200, '{"result":{"data":{"json":{"state":"unlinked"}}}}'));
    const answer = account.transfer("cloudTransfer.link", { project_id: "p1" });
    await settle();
    const transfer = helper.last("transfer")!;
    expect(transfer).toMatchObject({
      procedure: "cloudTransfer.link",
      input: { project_id: "p1" },
      localOrigin: LOCAL,
    });
    helper.say({
      type: "http",
      id: 70,
      method: "POST",
      url: `${LOCAL}/trpc/cloudTransfer.link`,
      headers: [["Content-Type", "application/json"]],
      body: '{"project_id":"p1","origin":"https://api.nodetool.ai","account_id":"u1"}',
      timeoutMs: 120000,
      requiredOrigin: "",
      transfer: transfer.id,
    });
    await settle();
    const [url, init] = cloudFetch.mock.calls[0];
    expect(url).toBe(`${LOCAL}/trpc/cloudTransfer.link`);
    expect(init.headers).toContainEqual(["x-nodetool-local-client", "local-token"]);
    expect(helper.received).toContainEqual({
      type: "httpResponse",
      id: 70,
      status: 200,
      body: '{"result":{"data":{"json":{"state":"unlinked"}}}}',
    });
    helper.say({ type: "transferResult", id: transfer.id, status: "ok", reason: "", data: { state: "unlinked" } });
    expect(await answer).toEqual({ status: "ok", reason: "", data: { state: "unlinked" } });
  });

  test("FC32: a transfer message for another origin is refused and never sent", async () => {
    const { account, helper, cloudFetch } = await signedInAccount();
    void account.transfer("cloudTransfer.send.run", { transfer_id: "t1" });
    await settle();
    const id = helper.last("transfer")!.id;
    const base = { type: "http", method: "POST", headers: [], body: '{"access_token":"ntd_x"}', timeoutMs: 1000, requiredOrigin: "" };
    helper.say({ ...base, id: 1, url: "https://evil.example/trpc/cloudTransfer.send.run", transfer: id });
    helper.say({ ...base, id: 2, url: "http://127.0.0.1:9999/trpc/cloudTransfer.send.run", transfer: id });
    helper.say({ ...base, id: 3, url: `${LOCAL}/trpc/cloudTransfer.receive.run`, transfer: id });
    await settle();
    expect(cloudFetch).not.toHaveBeenCalled();
    expect(await account.transfer("workflows.delete", {})).toEqual({ status: "refused", reason: "INVALID", data: null });
  });

  test("no local server: the call is refused before the helper sees it", async () => {
    const { account, helper } = await signedInAccount({ localOrigin: () => null });
    expect((await account.transfer("cloudTransfer.link", {})).status).toBe("refused");
    expect(helper.last("transfer")).toBeUndefined();
  });
});

describe("TC121: nodetool-cloud: media", () => {
  test("maps the signed-in server's asset routes only", () => {
    expect(cloudMediaPath("nodetool-cloud://api.nodetool.ai/api/assets/a1", ORIGIN)).toBe("/api/assets/a1");
    expect(cloudMediaPath("nodetool-cloud://API.nodetool.ai/api/assets/a1?x=1", ORIGIN)).toBe("/api/assets/a1?x=1");
    expect(cloudMediaPath("nodetool-cloud://evil.example/api/assets/a1", ORIGIN)).toBeNull();
    expect(cloudMediaPath("nodetool-cloud://api.nodetool.ai:8443/api/assets/a1", ORIGIN)).toBeNull();
    expect(cloudMediaPath("nodetool-cloud://u:p@api.nodetool.ai/api/assets/a1", ORIGIN)).toBeNull();
    expect(cloudMediaPath("nodetool-cloud://api.nodetool.ai/trpc/workflows.list", ORIGIN)).toBeNull();
    expect(cloudMediaPath("nodetool-cloud://api.nodetool.ai/oauth/token", ORIGIN)).toBeNull();
    expect(cloudMediaPath("https://api.nodetool.ai/api/assets/a1", ORIGIN)).toBeNull();
    expect(cloudMediaPath("nodetool-cloud://api.nodetool.ai/api/assets/a1", null)).toBeNull();
  });

  function source(answer: CloudResponse) {
    const request = jest.fn(async () => answer);
    return { request, serverOrigin: () => ORIGIN };
  }

  function mediaRequest(url: string, headers: Record<string, string> = {}, method = "GET") {
    return { url, method, headers: new Headers(headers) };
  }

  test("passes the range and returns the bytes of that range", async () => {
    const bytes = new TextEncoder().encode("0123");
    const media = source({
      ok: true,
      status: 206,
      headers: [
        ["content-type", "video/mp4"],
        ["content-range", "bytes 0-3/100"],
        ["set-cookie", "x"],
      ],
      body: bytes,
    });
    const response = await cloudMediaResponse(
      mediaRequest("nodetool-cloud://api.nodetool.ai/api/assets/a1", { Range: "bytes=0-3" }),
      media,
    );
    expect(media.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/assets/a1",
      headers: { range: "bytes=0-3" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-3/100");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toBe("0123");
  });

  test("refuses another origin and a route off the list without a request", async () => {
    const media = source({ ok: false, error: "OFFLINE" });
    expect((await cloudMediaResponse(mediaRequest("nodetool-cloud://evil.example/api/assets/a1"), media)).status).toBe(404);
    expect((await cloudMediaResponse(mediaRequest("nodetool-cloud://api.nodetool.ai/trpc/x.y"), media)).status).toBe(404);
    expect(
      (await cloudMediaResponse(mediaRequest("nodetool-cloud://api.nodetool.ai/api/assets/a1", {}, "POST"), media)).status,
    ).toBe(405);
    expect(media.request).not.toHaveBeenCalled();
  });

  test("signed out answers 401, and a redirect is never followed", async () => {
    expect(
      (await cloudMediaResponse(
        mediaRequest("nodetool-cloud://api.nodetool.ai/api/assets/a1"),
        source({ ok: false, error: "SIGNED_OUT" }),
      )).status,
    ).toBe(401);
    const redirected = await cloudMediaResponse(
      mediaRequest("nodetool-cloud://api.nodetool.ai/api/assets/a1"),
      source({ ok: true, status: 302, headers: [["location", "https://evil.example/"]], body: new Uint8Array() }),
    );
    expect(redirected.status).toBe(502);
    expect(redirected.headers.get("location")).toBeNull();
  });

  test("a signed-out account loads nothing through the scheme", async () => {
    const { account, helper } = await signedInAccount();
    helper.say({ ...SIGNED_IN, state: "signedOut" });
    await settle();
    const response = await cloudMediaResponse(mediaRequest("nodetool-cloud://api.nodetool.ai/api/assets/a1"), account);
    expect(response.status).toBe(401);
    expect(helper.last("request")).toBeUndefined();
  });
});
