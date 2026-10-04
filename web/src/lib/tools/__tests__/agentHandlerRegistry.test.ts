import { createAgentHandlerRegistry } from "../agentHandlerRegistry";

describe("agent handler readiness", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it("resolves when a ready handler is set", async () => {
    const registry = createAgentHandlerRegistry<{ ready: boolean }>();
    const pending = registry.whenReady(
      "doc",
      (handler) => handler.ready,
      new AbortController().signal
    );
    registry.set("doc", { ready: false });
    const settled = jest.fn();
    void pending.then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    registry.set("doc", { ready: true });
    expect(await pending).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
  it("resolves false on abort", async () => {
    const registry = createAgentHandlerRegistry<object>();
    const controller = new AbortController();
    const pending = registry.whenReady("doc", () => true, controller.signal);
    controller.abort();
    expect(await pending).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
  it("resolves false after the readiness timeout", async () => {
    const registry = createAgentHandlerRegistry<object>();
    const pending = registry.whenReady(
      "doc",
      () => true,
      new AbortController().signal
    );
    await jest.advanceTimersByTimeAsync(20_000);
    expect(await pending).toBe(false);
    registry.set("doc", {});
    expect(registry.has("doc")).toBe(true);
  });
});
