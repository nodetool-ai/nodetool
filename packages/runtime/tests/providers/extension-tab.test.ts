import { afterEach, describe, expect, it, vi } from "vitest";
import { createExtensionTab } from "../../src/providers/extension-tab.js";
const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@nodetool-ai/browser", () => ({ createExtensionPage: mocks.open }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe("extension tab opening", () => {
  it("does not run abandoned navigation when a timed-out open resolves", async () => {
    vi.useFakeTimers();
    let resolve!: (handle: unknown) => void;
    const close = vi.fn().mockResolvedValue(undefined);
    const goto = vi.fn();
    mocks.open.mockReturnValue(new Promise((done) => { resolve = done; }));
    const tab = createExtensionTab("chatgpt.com");
    const pending = tab.navigate("https://chatgpt.com/");
    const rejected = expect(pending).rejects.toThrow("did not answer");
    await vi.advanceTimersByTimeAsync(45_000);
    await rejected;
    resolve({ page: { evaluate: vi.fn().mockResolvedValue("chatgpt.com"), goto }, close });
    await vi.advanceTimersByTimeAsync(1);
    expect(goto).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("dispatches trusted CDP mouse events via clickAt", async () => {
    const dispatchMouseEvent = vi.fn().mockResolvedValue(undefined);
    const setWebLifecycleState = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    mocks.open.mockResolvedValue({
      page: { evaluate: vi.fn().mockResolvedValue("flow.google.com"), goto: vi.fn() },
      client: {
        Page: { setWebLifecycleState },
        Input: { dispatchMouseEvent }
      },
      close
    });
    const tab = createExtensionTab("flow.google.com");
    await tab.clickAt?.(420, 680);
    expect(setWebLifecycleState).toHaveBeenCalledWith({ state: "active" });
    expect(dispatchMouseEvent).toHaveBeenNthCalledWith(1, { type: "mouseMoved", x: 420, y: 680 });
    expect(dispatchMouseEvent).toHaveBeenNthCalledWith(2, {
      type: "mousePressed",
      x: 420,
      y: 680,
      button: "left",
      clickCount: 1
    });
    expect(dispatchMouseEvent).toHaveBeenNthCalledWith(3, {
      type: "mouseReleased",
      x: 420,
      y: 680,
      button: "left",
      clickCount: 1
    });
    await tab.release?.();
  });
});
