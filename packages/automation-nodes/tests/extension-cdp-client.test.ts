/**
 * Unit tests for {@link ExtensionCdpClient} using a fake in-process channel.
 *
 * Covers the two shapes `CdpPage` relies on:
 *   - command(params) => Promise, with response id-matching and error rejection;
 *   - event(cb) => unsubscribe, with dispatch to registered listeners.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExtensionCdpClient,
  type ExtensionChannel
} from "../src/lib/extension-cdp-client.js";
import type {
  ExtensionFrame,
  ExtensionHostToExtFrame
} from "../src/lib/extension-protocol.js";

/**
 * A fake channel that records outbound frames and lets a test inject inbound
 * ones. Mirrors the in-process bridge surface the real client consumes.
 */
class FakeChannel implements ExtensionChannel {
  readonly sent: ExtensionHostToExtFrame[] = [];
  private handler: ((frame: ExtensionFrame) => void) | null = null;
  closed = false;

  send(frame: ExtensionHostToExtFrame): void {
    this.sent.push(frame);
  }

  onMessage(handler: (frame: ExtensionFrame) => void): void {
    this.handler = handler;
  }

  close(): void {
    this.closed = true;
  }

  /** Simulate an ext→host inbound frame. */
  inject(frame: ExtensionFrame): void {
    this.handler?.(frame);
  }
}

function makeClient(): { channel: FakeChannel; client: ExtensionCdpClient } {
  const channel = new FakeChannel();
  const client = new ExtensionCdpClient(channel);
  return { channel, client };
}

describe("ExtensionCdpClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a cdp command frame and resolves on the matching result", async () => {
    const { channel, client } = makeClient();

    const promise = client.client.Page.navigate({ url: "https://example.com" });

    const cmd = channel.sent.find((f) => f.kind === "cdp");
    expect(cmd).toMatchObject({
      kind: "cdp",
      id: 1,
      method: "Page.navigate",
      params: { url: "https://example.com" }
    });

    channel.inject({ kind: "cdp_result", id: 1, result: { frameId: "abc" } });

    await expect(promise).resolves.toEqual({ frameId: "abc" });
    await client.close();
  });

  it("matches results to the correct pending id when commands interleave", async () => {
    const { channel, client } = makeClient();

    const first = client.client.Runtime.evaluate({ expression: "1" });
    const second = client.client.Runtime.evaluate({ expression: "2" });

    const ids = channel.sent.filter((f) => f.kind === "cdp").map((f) => f.id);
    expect(ids).toEqual([1, 2]);

    // Resolve out of order.
    channel.inject({ kind: "cdp_result", id: 2, result: { result: { value: 2 } } });
    channel.inject({ kind: "cdp_result", id: 1, result: { result: { value: 1 } } });

    await expect(first).resolves.toEqual({ result: { value: 1 } });
    await expect(second).resolves.toEqual({ result: { value: 2 } });
    await client.close();
  });

  it("rejects with the error message on a cdp_result error", async () => {
    const { channel, client } = makeClient();

    const promise = client.client.DOM.enable();
    channel.inject({
      kind: "cdp_result",
      id: 1,
      error: { message: "Cannot find context" }
    });

    await expect(promise).rejects.toThrow("Cannot find context");
    await client.close();
  });

  it("dispatches cdp events to a subscribed listener and returns an unsubscribe", async () => {
    const { channel, client } = makeClient();

    const seen: Array<Record<string, unknown>> = [];
    const off = client.client.Page.loadEventFired((params) => {
      seen.push(params);
    });
    expect(typeof off).toBe("function");

    channel.inject({
      kind: "cdp_event",
      method: "Page.loadEventFired",
      params: { timestamp: 42 }
    });
    expect(seen).toEqual([{ timestamp: 42 }]);

    off();
    channel.inject({
      kind: "cdp_event",
      method: "Page.loadEventFired",
      params: { timestamp: 99 }
    });
    expect(seen).toEqual([{ timestamp: 42 }]);

    await client.close();
  });

  it("supports dynamic event member access (computed event name)", async () => {
    const { channel, client } = makeClient();

    const seen: Array<Record<string, unknown>> = [];
    const eventName = "domContentEventFired";
    const off = client.client.Page[eventName](
      (params: Record<string, unknown>) => seen.push(params)
    );

    channel.inject({
      kind: "cdp_event",
      method: "Page.domContentEventFired",
      params: { timestamp: 7 }
    });
    expect(seen).toEqual([{ timestamp: 7 }]);

    off();
    await client.close();
  });

  it("sends an attach frame and resolves attach() on `attached`", async () => {
    const { channel, client } = makeClient();

    const promise = client.attach(1000);
    expect(channel.sent.some((f) => f.kind === "attach")).toBe(true);

    channel.inject({ kind: "attached", tabId: 5 });
    await expect(promise).resolves.toBeUndefined();
    await client.close();
  });

  it("rejects all pending commands on a fatal error frame", async () => {
    const { channel, client } = makeClient();

    const a = client.client.Runtime.evaluate({ expression: "x" });
    const b = client.client.Runtime.evaluate({ expression: "y" });

    channel.inject({ kind: "error", message: "debugger detached" });

    await expect(a).rejects.toThrow("debugger detached");
    await expect(b).rejects.toThrow("debugger detached");
    await client.close();
  });

  it("rejects pending commands and closes the channel on heartbeat timeout", async () => {
    vi.useFakeTimers();
    const channel = new FakeChannel();
    const client = new ExtensionCdpClient(channel);

    const pending = client.client.Runtime.evaluate({ expression: "z" });
    const assertion = expect(pending).rejects.toThrow("heartbeat timed out");

    // First tick: a ping is sent, awaiting pong.
    vi.advanceTimersByTime(15_000);
    expect(channel.sent.some((f) => f.kind === "ping")).toBe(true);

    // Second tick with no pong: connection is declared dead.
    vi.advanceTimersByTime(15_000);
    expect(channel.closed).toBe(true);

    await assertion;
  });

  it("clears awaiting-pong state when a pong arrives", () => {
    vi.useFakeTimers();
    const channel = new FakeChannel();
    const client = new ExtensionCdpClient(channel);

    vi.advanceTimersByTime(15_000);
    const ping = channel.sent.find((f) => f.kind === "ping");
    expect(ping).toBeDefined();

    channel.inject({ kind: "pong", ts: ping && ping.kind === "ping" ? ping.ts : 0 });

    // A subsequent tick should send a new ping rather than declaring death.
    vi.advanceTimersByTime(15_000);
    expect(channel.closed).toBe(false);
    expect(channel.sent.filter((f) => f.kind === "ping").length).toBe(2);

    void client;
  });
});
