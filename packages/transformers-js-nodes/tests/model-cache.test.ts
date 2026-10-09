import { describe, expect, it, vi } from "vitest";
import { ModelCache } from "../src/model-cache.js";

function fakeModel(name: string) {
  return Object.assign(vi.fn(async () => name), { modelName: name });
}

describe("ModelCache", () => {
  it("reuses a loaded model for the same key", async () => {
    const cache = new ModelCache<object>(2, vi.fn());
    const load = vi.fn(async () => fakeModel("a"));
    await cache.get("a", load);
    await cache.get("a", load);
    expect(load).toHaveBeenCalledOnce();
  });

  it("evicts and disposes the least recently used idle model", async () => {
    let now = 0;
    const dispose = vi.fn();
    const cache = new ModelCache<object>(2, dispose, [], () => now, 1000);
    const a = fakeModel("a");
    const b = fakeModel("b");
    await cache.get("a", async () => a);
    await cache.get("b", async () => b);
    now = 5000;
    await cache.get("a", async () => a); // a is now most recent
    // b was last used at 0; a at 5000, within the grace period.
    now = 5500;
    await cache.get("c", async () => fakeModel("c"));
    await Promise.resolve();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledWith(b);
    expect(cache.size).toBe(2);
  });

  it("never disposes a model with a call in progress", async () => {
    let now = 0;
    const dispose = vi.fn();
    const cache = new ModelCache<object>(1, dispose, [], () => now, 1000);
    let finish: (() => void) | undefined;
    const busy = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const pipeline = (await cache.get("a", async () => busy)) as () => Promise<void>;
    const running = pipeline();
    now = 10_000;
    await cache.get("b", async () => fakeModel("b"));
    await Promise.resolve();
    expect(dispose).not.toHaveBeenCalled();
    expect(cache.size).toBe(2);

    finish?.();
    await running;
    now = 20_000;
    await cache.get("c", async () => fakeModel("c"));
    await Promise.resolve();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledWith(busy);
  });

  it("counts calls to tracked methods", async () => {
    let now = 0;
    const dispose = vi.fn();
    const cache = new ModelCache<{ generate: () => Promise<void> }>(
      1,
      dispose,
      ["generate"],
      () => now,
      1000
    );
    let finish: (() => void) | undefined;
    const tts = {
      generate: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    };
    const loaded = await cache.get("a", async () => tts);
    const running = loaded.generate();
    now = 10_000;
    await cache.get("b", async () => ({ generate: async () => {} }));
    await Promise.resolve();
    expect(dispose).not.toHaveBeenCalled();
    finish?.();
    await running;
  });

  it("forgets a failed load so the next get retries", async () => {
    const cache = new ModelCache<object>(2, vi.fn());
    await expect(
      cache.get("a", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    const model = fakeModel("a");
    await expect(cache.get("a", async () => model)).resolves.toBeDefined();
  });
});
