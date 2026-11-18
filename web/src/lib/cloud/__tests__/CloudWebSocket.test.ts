import { CloudWebSocket, cloudSocketFactory, type CloudSocketBridge } from "../CloudWebSocket";
import { WebSocketManager } from "../../websocket/WebSocketManager";
import { pack, unpack } from "msgpackr";

type Listener = Parameters<CloudSocketBridge["onEvent"]>[0];

function fakeBridge(openResult: Awaited<ReturnType<CloudSocketBridge["open"]>> = { ok: true, id: 5 }) {
  const listeners = new Set<Listener>();
  const sent: [number, Uint8Array | string][] = [];
  const closed: number[] = [];
  let resolveOpen: (value: typeof openResult) => void = () => {};
  const bridge: CloudSocketBridge = {
    open: jest.fn(() => new Promise((resolve) => (resolveOpen = resolve))),
    send: jest.fn(async (id, data) => {
      sent.push([id, data]);
      return true;
    }),
    close: jest.fn(async (id) => {
      closed.push(id);
    }),
    onEvent: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    }
  };
  return {
    bridge,
    sent,
    closed,
    listeners,
    emit: (event: Parameters<Listener>[0]) => listeners.forEach((l) => l(event)),
    finishOpen: () => resolveOpen(openResult)
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("CloudWebSocket", () => {
  it("opens through the bridge, delivers binary frames as ArrayBuffer and sends bytes", async () => {
    const fake = fakeBridge();
    const socket = new CloudWebSocket("ws://ignored/ws", fake.bridge);
    const opened = jest.fn();
    const messages: unknown[] = [];
    socket.onopen = opened;
    socket.onmessage = (event) => messages.push(event.data);
    fake.finishOpen();
    await flush();
    // Another socket's events are ignored.
    fake.emit({ id: 6, kind: "open" });
    expect(opened).not.toHaveBeenCalled();
    fake.emit({ id: 5, kind: "open" });
    expect(socket.readyState).toBe(CloudWebSocket.OPEN);
    expect(opened).toHaveBeenCalledTimes(1);
    fake.emit({ id: 5, kind: "message", data: new Uint8Array([1, 2, 3]) });
    expect(messages[0]).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(messages[0] as ArrayBuffer)]).toEqual([1, 2, 3]);
    socket.send(new Uint8Array([9]));
    expect(fake.sent).toEqual([[5, new Uint8Array([9])]]);
  });

  it("keeps events that arrive before the id is known", async () => {
    const fake = fakeBridge();
    const socket = new CloudWebSocket("", fake.bridge);
    const opened = jest.fn();
    socket.onopen = opened;
    fake.emit({ id: 5, kind: "open" });
    fake.finishOpen();
    await flush();
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("a refused open ends with an error and an unclean close", async () => {
    const fake = fakeBridge({ ok: false, error: "SIGNED_OUT" });
    const socket = new CloudWebSocket("", fake.bridge);
    const onerror = jest.fn();
    const closes: CloseEvent[] = [];
    socket.onerror = onerror;
    socket.onclose = (event) => closes.push(event);
    fake.finishOpen();
    await flush();
    expect(onerror).toHaveBeenCalled();
    expect(closes[0].code).toBe(1006);
    expect(closes[0].wasClean).toBe(false);
    expect(fake.listeners.size).toBe(0);
  });

  it("the server's 4401 close reaches the manager's handler", async () => {
    const fake = fakeBridge();
    const socket = new CloudWebSocket("", fake.bridge);
    const closes: CloseEvent[] = [];
    socket.onclose = (event) => closes.push(event);
    fake.finishOpen();
    await flush();
    fake.emit({ id: 5, kind: "open" });
    fake.emit({ id: 5, kind: "close", code: 4401, reason: "session_revoked" });
    expect(closes.map((e) => [e.code, e.reason])).toEqual([[4401, "session_revoked"]]);
    expect(() => socket.send("x")).toThrow();
  });

  it("a close while opening closes the socket the main process opened", async () => {
    const fake = fakeBridge();
    const socket = new CloudWebSocket("", fake.bridge);
    socket.close();
    expect(socket.readyState).toBe(CloudWebSocket.CLOSED);
    fake.finishOpen();
    await flush();
    expect(fake.closed).toEqual([5]);
  });

  it("drives WebSocketManager: a MsgPack frame goes out and one comes back", async () => {
    const fake = fakeBridge();
    const manager = new WebSocketManager({
      url: "wss://ignored/ws",
      reconnect: false,
      heartbeatInterval: 0,
      createSocket: cloudSocketFactory(fake.bridge)
    });
    const received: unknown[] = [];
    manager.on("message", (data) => received.push(data));
    const connecting = manager.connect();
    fake.finishOpen();
    await flush();
    fake.emit({ id: 5, kind: "open" });
    await connecting;
    manager.send({ type: "run_job", concurrent: true });
    expect(unpack(fake.sent[0][1] as Uint8Array)).toEqual({ type: "run_job", concurrent: true });
    fake.emit({ id: 5, kind: "message", data: new Uint8Array(pack({ type: "job_update", status: "running" })) });
    await flush();
    expect(received).toEqual([{ type: "job_update", status: "running" }]);
    manager.disconnect();
    expect(fake.closed).toEqual([5]);
  });
});
