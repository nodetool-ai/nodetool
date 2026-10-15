/**
 * The native messaging bridge, end to end without Chrome: a real NativeHost on a
 * real unix socket, a fake extension on its stdio, and the production socket
 * channel and CDP client as the clients.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NativeHost } from "../src/extension/native-host.js";
import { NativeMessageDecoder, encodeNativeMessage } from "../src/extension/native-framing.js";
import { createSocketChannel, isBridgeAvailable } from "../src/extension/socket-channel.js";
import { ExtensionCdpClient } from "../src/extension/client.js";

let dir: string;
let host: NativeHost;
let toHost: PassThrough;
let fromHost: PassThrough;
/** Frames the host wrote to Chrome. */
let received: Array<Record<string, unknown>>;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const extensionSend = (frame: unknown): void => void toHost.write(encodeNativeMessage(frame));

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "nt-bridge-"));
  const socketPath = path.join(dir, "host.sock");
  process.env.NODETOOL_BROWSER_BRIDGE_SOCKET = socketPath;
  toHost = new PassThrough();
  fromHost = new PassThrough();
  received = [];
  const decoder = new NativeMessageDecoder();
  fromHost.on("data", (chunk: Buffer) => {
    for (const message of decoder.push(chunk)) received.push(message as Record<string, unknown>);
  });
  host = new NativeHost({ input: toHost, output: fromHost, socketPath });
  await host.start();
});

afterEach(async () => {
  delete process.env.NODETOOL_BROWSER_BRIDGE_SOCKET;
  await host.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("native bridge", () => {
  it("restricts the socket to the current user", () => {
    expect(statSync(path.join(dir, "host.sock")).mode & 0o777).toBe(0o600);
  });

  it("reports availability while the host runs and not after", async () => {
    expect(await isBridgeAvailable()).toBe(true);
    await host.close();
    expect(await isBridgeAvailable()).toBe(false);
  });

  it("leases one tab to independent clients and routes commands and events only to its owner", async () => {
    const a = createSocketChannel();
    const b = createSocketChannel();
    const gotA: unknown[] = [];
    const gotB: unknown[] = [];
    a.onMessage((frame) => gotA.push(frame));
    b.onMessage((frame) => gotB.push(frame));
    a.send({ kind: "attach", urlMatch: "chatgpt.com" });
    await wait(100);
    extensionSend({ kind: "attached", tabId: 5 });
    await wait(100);
    b.send({ kind: "attach", urlMatch: "gemini.google.com" });
    b.send({ kind: "cdp", id: 1, method: "Page.navigate" });
    a.send({ kind: "cdp", id: 1, method: "Runtime.evaluate" });
    await wait(100);
    expect(received.filter((frame) => frame.kind === "attach")).toHaveLength(1);
    expect(received.filter((frame) => frame.kind === "cdp")).toHaveLength(1);
    expect(gotB).toContainEqual({ kind: "cdp_result", id: 1, error: { message: "Client does not own the browser tab" } });
    extensionSend({ kind: "cdp_event", method: "Page.loadEventFired", params: {} });
    await wait(100);
    expect(gotA).toContainEqual({ kind: "cdp_event", method: "Page.loadEventFired", params: {} });
    expect(gotB).not.toContainEqual({ kind: "cdp_event", method: "Page.loadEventFired", params: {} });
    a.send({ kind: "detach" });
    await wait(100);
    expect(received.filter((frame) => frame.kind === "attach")).toHaveLength(1);
    extensionSend({ kind: "detach" });
    await wait(100);
    expect(received.filter((frame) => frame.kind === "attach").at(-1)?.urlMatch).toBe("gemini.google.com");
    extensionSend({ kind: "attached", tabId: 6 });
    await wait(100);
    expect(gotB).toContainEqual({ kind: "attached", tabId: 6 });
    // Releasing Gemini permits ChatGPT to reacquire its original tab immediately.
    a.send({ kind: "attach", urlMatch: "chatgpt.com" });
    b.close();
    await wait(100);
    extensionSend({ kind: "detach" });
    await wait(100);
    expect(received.filter((frame) => frame.kind === "attach").at(-1)?.urlMatch).toBe("chatgpt.com");
    extensionSend({ kind: "attached", tabId: 5 });
    await wait(100);
    expect(gotA.filter((frame) => (frame as { kind?: string }).kind === "attached")).toHaveLength(2);
    a.close();
  });

  it("answers heartbeats itself", async () => {
    const channel = createSocketChannel();
    const got: unknown[] = [];
    channel.onMessage((f) => got.push(f));
    channel.send({ kind: "ping", ts: 42 });
    await wait(100);
    expect(got).toEqual([{ kind: "pong", ts: 42 }]);
    expect(received).toEqual([]);
    channel.close();
  });

  it("drives the production CDP client through the host", async () => {
    const cdp = new ExtensionCdpClient(createSocketChannel());
    const attach = cdp.attach(5_000);
    await wait(100);
    extensionSend({ kind: "attached", tabId: 9 });
    await attach;

    const evaluated = cdp.client.Runtime.evaluate({ expression: "1+1" });
    await wait(100);
    const command = received.find((f) => f.method === "Runtime.evaluate")!;
    extensionSend({ kind: "cdp_result", id: command.id, result: { result: { value: 2 } } });
    expect(await evaluated).toEqual({ result: { value: 2 } });
    await cdp.close();
  });

  it("keeps the connection alive only while a request is in flight", async () => {
    const inner = createSocketChannel();
    const states: boolean[] = [];
    const cdp = new ExtensionCdpClient({
      send: (frame) => inner.send(frame),
      onMessage: (cb) => inner.onMessage(cb),
      close: () => inner.close(),
      setBusy: (busy) => {
        states.push(busy);
        inner.setBusy?.(busy);
      }
    });
    const attach = cdp.attach(5_000);
    await wait(100);
    extensionSend({ kind: "attached", tabId: 1 });
    await attach;
    expect(states.at(-1)).toBe(false);

    const evaluated = cdp.client.Runtime.evaluate({ expression: "1" });
    await wait(100);
    expect(states.at(-1)).toBe(true);
    const command = received.find((f) => f.method === "Runtime.evaluate")!;
    extensionSend({ kind: "cdp_result", id: command.id, result: {} });
    await evaluated;
    expect(states.at(-1)).toBe(false);
    await cdp.close();
  });

  it("fails fast with an install hint when no host runs", async () => {
    await host.close();
    const cdp = new ExtensionCdpClient(createSocketChannel());
    await expect(cdp.attach(5_000)).rejects.toThrow("nodetool extension install");
    await cdp.close();
  });
});
