/**
 * The preview polls a video asset whose proxy is still being made, and asks
 * to resolve it again once the proxy is ready.
 */
import { watchVideoProxy } from "../videoProxyWatch";

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("watchVideoProxy", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("polls until the proxy is ready, then calls onReady once", async () => {
    const states = ["queued", "running", "ready"];
    const fetchAsset = jest.fn(async () => ({
      proxy_status: states.shift()
    }));
    const onReady = jest.fn();
    watchVideoProxy("a", { fetchAsset, onReady, pollMs: 100 });
    // A second watch of the same asset shares the first.
    watchVideoProxy("a", { fetchAsset, onReady, pollMs: 100 });

    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(100);
      await flush();
    }
    expect(fetchAsset).toHaveBeenCalledTimes(3);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith("a");
    jest.advanceTimersByTime(1000);
    await flush();
    expect(fetchAsset).toHaveBeenCalledTimes(3);
  });

  it("stops without onReady when the proxy fails or the preview unmounts", async () => {
    const onReady = jest.fn();
    const failed = jest.fn(async () => ({ proxy_status: "failed" }));
    watchVideoProxy("b", { fetchAsset: failed, onReady, pollMs: 100 });
    jest.advanceTimersByTime(100);
    await flush();
    expect(failed).toHaveBeenCalledTimes(1);

    const controller = new AbortController();
    const pending = jest.fn(async () => ({ proxy_status: "running" }));
    watchVideoProxy("c", {
      fetchAsset: pending,
      onReady,
      pollMs: 100,
      signal: controller.signal
    });
    jest.advanceTimersByTime(100);
    await flush();
    controller.abort();
    jest.advanceTimersByTime(1000);
    await flush();
    expect(pending).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("gives up after maxPolls", async () => {
    const fetchAsset = jest.fn(async () => ({ proxy_status: "running" }));
    watchVideoProxy("d", { fetchAsset, onReady: jest.fn(), pollMs: 10, maxPolls: 3 });
    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(10);
      await flush();
    }
    expect(fetchAsset).toHaveBeenCalledTimes(3);
  });
});
