/**
 * The workflow socket of a cloud document (D25, WP1.14). The account is a
 * fake. One test runs a real `ws` server to check the upgrade header and
 * the frames both ways.
 */
import { EventEmitter } from "events";
import type { AddressInfo } from "net";
import WebSocket, { WebSocketServer } from "ws";

jest.mock("../types.d", () => ({}));

import {
  CloudSockets,
  MAX_SOCKETS_PER_WINDOW,
  SESSION_ENDED_CLOSE_CODE,
  cloudSocketUrl,
  type CloudSocketEvent,
  type CloudSocketsDeps,
  type SocketLike,
} from "../cloudSocket";
import type { SocketTokenResult } from "../cloudRequests";
import type { CloudAccountState } from "../types.d";

const ORIGIN = "https://api.nodetool.ai";

class FakeSocket extends EventEmitter implements SocketLike {
  readyState = 0;
  bufferedAmount = 0;
  readonly sent: (Uint8Array | string)[] = [];
  closedWith: [number | undefined, string | undefined] | null = null;
  terminated = false;

  constructor(
    readonly url: string,
    readonly headers: Record<string, string>,
  ) {
    super();
  }

  send(data: Uint8Array | string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closedWith = [code, reason];
    this.readyState = 2;
  }

  terminate(): void {
    this.terminated = true;
    this.readyState = 3;
  }

  accept(): void {
    this.readyState = 1;
    this.emit("open");
  }
}

function setup(token: () => Promise<SocketTokenResult> = async () => ({ ok: true, token: "ntd_socket" })) {
  let state: CloudAccountState["state"] = "signedIn";
  const sockets: FakeSocket[] = [];
  const events: [number, CloudSocketEvent][] = [];
  const socketToken = jest.fn(token);
  const deps: CloudSocketsDeps = {
    account: {
      state: () => ({ state }) as CloudAccountState,
      serverOrigin: () => ORIGIN,
      socketToken,
    },
    connect: (url, headers) => {
      const socket = new FakeSocket(url, headers);
      sockets.push(socket);
      return socket;
    },
    deliver: (owner, event) => events.push([owner, event]),
    log: () => {},
  };
  const relay = new CloudSockets(deps);
  return {
    relay,
    sockets,
    events,
    socketToken,
    signOut: () => {
      state = "signedOut";
      relay.signedOut();
    },
  };
}

test("the socket URL is /ws on the canonical HTTPS origin only", () => {
  expect(cloudSocketUrl(ORIGIN)).toBe("wss://api.nodetool.ai/ws");
  expect(cloudSocketUrl("https://api.nodetool.ai:8443")).toBe("wss://api.nodetool.ai:8443/ws");
  expect(cloudSocketUrl("http://api.nodetool.ai")).toBeNull();
  expect(cloudSocketUrl("https://api.nodetool.ai/")).toBeNull();
  expect(cloudSocketUrl("https://u:p@api.nodetool.ai")).toBeNull();
  expect(cloudSocketUrl(null)).toBeNull();
});

test("TC116: the token goes in the upgrade header only, and no event holds it", async () => {
  const { relay, sockets, events } = setup();
  const opened = await relay.open(7);
  expect(opened).toEqual({ ok: true, id: 1 });
  expect(sockets[0].url).toBe("wss://api.nodetool.ai/ws");
  expect(sockets[0].headers).toEqual({ Authorization: "Bearer ntd_socket" });
  sockets[0].accept();
  sockets[0].emit("message", Buffer.from([0x81, 0xa1, 0x61]), true);
  sockets[0].emit("message", Buffer.from("text"), false);
  sockets[0].emit("close", 1000, Buffer.from("done"));
  expect(events).toEqual([
    [7, { id: 1, kind: "open" }],
    [7, { id: 1, kind: "message", data: new Uint8Array([0x81, 0xa1, 0x61]) }],
    [7, { id: 1, kind: "message", data: "text" }],
    [7, { id: 1, kind: "close", code: 1000, reason: "done" }],
  ]);
  expect(JSON.stringify(events)).not.toMatch(/ntd_/);
  expect(relay.count()).toBe(0);
});

test("only the window that opened a socket can send on it or close it", async () => {
  const { relay, sockets } = setup();
  const opened = await relay.open(7);
  const id = opened.ok ? opened.id : 0;
  expect(relay.send(7, id, new Uint8Array([1]))).toBe(false); // not open yet
  sockets[0].accept();
  expect(relay.send(8, id, new Uint8Array([1]))).toBe(false);
  relay.close(8, id);
  expect(sockets[0].closedWith).toBeNull();
  expect(relay.send(7, id, new Uint8Array([2]))).toBe(true);
  expect(sockets[0].sent).toEqual([new Uint8Array([2])]);
  relay.close(7, id);
  expect(sockets[0].closedWith).toEqual([1000, "closed"]);
  expect(relay.send(7, id, new Uint8Array([3]))).toBe(false);
});

test("a full send buffer refuses the renderer's frame", async () => {
  const { relay, sockets } = setup();
  await relay.open(7);
  sockets[0].accept();
  sockets[0].bufferedAmount = 64 * 1024 * 1024;
  expect(relay.send(7, 1, new Uint8Array([1]))).toBe(false);
});

test("a window holds a bounded number of sockets, and its sockets close when it goes away", async () => {
  const { relay, sockets, events } = setup();
  for (let i = 0; i < MAX_SOCKETS_PER_WINDOW; i += 1) {
    expect((await relay.open(7)).ok).toBe(true);
  }
  expect(await relay.open(7)).toEqual({ ok: false, error: "BUSY" });
  expect((await relay.open(8)).ok).toBe(true);
  sockets.forEach((s) => s.accept());
  relay.closeOwner(7);
  expect(sockets.slice(0, MAX_SOCKETS_PER_WINDOW).every((s) => s.closedWith?.[0] === 1001)).toBe(true);
  expect(sockets[MAX_SOCKETS_PER_WINDOW].closedWith).toBeNull();
  expect(relay.count()).toBe(1);
  expect(events.filter(([, e]) => e.kind === "close")).toEqual([]);
});

test("a sign-out closes every socket from this side and tells its window", async () => {
  const { relay, sockets, events, signOut } = setup();
  await relay.open(7);
  await relay.open(8);
  sockets[0].accept();
  signOut();
  expect(sockets[0].closedWith).toEqual([SESSION_ENDED_CLOSE_CODE, "signed_out"]);
  // Still connecting: dropped at once.
  expect(sockets[1].terminated).toBe(true);
  expect(events.filter(([, e]) => e.kind === "close")).toEqual([
    [7, { id: 1, kind: "close", code: SESSION_ENDED_CLOSE_CODE, reason: "signed_out" }],
    [8, { id: 2, kind: "close", code: SESSION_ENDED_CLOSE_CODE, reason: "signed_out" }],
  ]);
  // The socket's own close event afterwards delivers nothing more.
  sockets[0].emit("close", 1005, Buffer.from(""));
  expect(events.filter(([, e]) => e.kind === "close")).toHaveLength(2);
  expect(await relay.open(7)).toEqual({ ok: false, error: "SIGNED_OUT" });
});

test("a sign-out while the token is on its way opens nothing", async () => {
  let give: (result: SocketTokenResult) => void = () => {};
  const { relay, sockets, signOut } = setup(() => new Promise((resolve) => (give = resolve)));
  const opening = relay.open(7);
  signOut();
  give({ ok: true, token: "ntd_late" });
  expect(await opening).toEqual({ ok: false, error: "SIGNED_OUT" });
  expect(sockets).toHaveLength(0);
});

test("no token: nothing opens", async () => {
  const { relay, sockets } = setup(async () => ({ ok: false, error: "OFFLINE" }));
  expect(await relay.open(7)).toEqual({ ok: false, error: "OFFLINE" });
  expect(sockets).toHaveLength(0);
  expect(relay.count()).toBe(0);
});

test("the server's 4401 close reaches the window", async () => {
  const { relay, sockets, events } = setup();
  await relay.open(7);
  sockets[0].accept();
  sockets[0].emit("close", SESSION_ENDED_CLOSE_CODE, Buffer.from("session_revoked"));
  expect(events.at(-1)).toEqual([7, { id: 1, kind: "close", code: 4401, reason: "session_revoked" }]);
});

describe("with a real ws server", () => {
  let server: WebSocketServer;
  let port = 0;
  let upgradeAuth: string | undefined;

  beforeAll(async () => {
    server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    server.on("connection", (socket, request) => {
      upgradeAuth = request.headers.authorization;
      socket.on("message", (data, isBinary) => socket.send(data, { binary: isBinary }));
    });
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("the upgrade carries the bearer token and binary frames go both ways", async () => {
    const events: CloudSocketEvent[] = [];
    let opened: () => void = () => {};
    let echoed: () => void = () => {};
    const relay = new CloudSockets({
      account: {
        state: () => ({ state: "signedIn" }) as CloudAccountState,
        serverOrigin: () => ORIGIN,
        socketToken: async () => ({ ok: true, token: "ntd_real" }),
      },
      // The real URL is wss on the cloud origin. The test server is local.
      connect: (url, headers) => {
        expect(url).toBe("wss://api.nodetool.ai/ws");
        return new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers, followRedirects: false });
      },
      deliver: (_owner, event) => {
        events.push(event);
        if (event.kind === "open") opened();
        if (event.kind === "message") echoed();
      },
      log: () => {},
    });
    const waitOpen = new Promise<void>((resolve) => (opened = resolve));
    const result = await relay.open(1);
    expect(result.ok).toBe(true);
    await waitOpen;
    expect(upgradeAuth).toBe("Bearer ntd_real");
    const waitEcho = new Promise<void>((resolve) => (echoed = resolve));
    expect(relay.send(1, 1, new Uint8Array([0x82, 0x01, 0x02]))).toBe(true);
    await waitEcho;
    expect(events[1]).toEqual({ id: 1, kind: "message", data: new Uint8Array([0x82, 0x01, 0x02]) });
    relay.dispose();
  });
});
