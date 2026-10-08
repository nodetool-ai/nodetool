import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("../src/binding.js", () => ({
  loadWhisperNode: async () => ({ initWhisper: mocks.init })
}));
import { ContextCache } from "../src/context-cache.js";
afterEach(() => {
  vi.useRealTimers();
  mocks.init.mockReset();
});
it("releases the least recently used idle model", async () => {
  const releases = [
    vi.fn(async () => {}),
    vi.fn(async () => {}),
    vi.fn(async () => {})
  ];
  for (const release of releases) {
    mocks.init.mockResolvedValueOnce({ release });
  }
  const cache = new ContextCache();
  try {
    for (const name of ["a", "b", "c"]) {
      await cache.withContext(name, "default", false, async () => {});
    }
    expect(releases[0]).toHaveBeenCalledOnce();
    expect(releases[1]).not.toHaveBeenCalled();
  } finally {
    await cache.dispose();
  }
});
it("releases idle contexts but keeps active contexts alive", async () => {
  vi.useFakeTimers();
  const release = vi.fn(async () => {});
  mocks.init.mockResolvedValue({ release });
  const cache = new ContextCache(2, 1000);
  let finish: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const task = cache.withContext("a", "default", false, async () => held);
  await vi.advanceTimersByTimeAsync(2000);
  expect(release).not.toHaveBeenCalled();
  finish?.();
  await task;
  await vi.advanceTimersByTimeAsync(1000);
  expect(release).toHaveBeenCalledOnce();
  await cache.dispose();
});
it("retries failed model loads", async () => {
  mocks.init
    .mockRejectedValueOnce(new Error("load failed"))
    .mockResolvedValueOnce({ release: async () => {} });
  const cache = new ContextCache();
  try {
    await expect(
      cache.withContext("a", "default", false, async () => {})
    ).rejects.toThrow("load failed");
    await cache.withContext("a", "default", false, async () => {});
    expect(mocks.init).toHaveBeenCalledTimes(2);
  } finally {
    await cache.dispose();
  }
});
it("waits before loading a third model while two contexts are busy", async () => {
  const release = vi.fn(async () => {});
  mocks.init.mockResolvedValue({ release });
  const cache = new ContextCache();
  let finish: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let started: (() => void) | undefined;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const a = cache.withContext("a", "default", false, async () => {
    started?.();
    await wait;
  });
  await start;
  const b = cache.withContext("b", "default", false, async () => wait);
  const c = cache.withContext("c", "default", false, async () => {});
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(mocks.init).toHaveBeenCalledTimes(2);
  expect(release).not.toHaveBeenCalled();
  finish?.();
  await Promise.all([a, b, c]);
  expect(mocks.init).toHaveBeenCalledTimes(3);
  expect(release).toHaveBeenCalledOnce();
  await cache.dispose();
});
it("evicts an idle model instead of waiting for a busy older one", async () => {
  const releases = { a: vi.fn(async () => {}), b: vi.fn(async () => {}) };
  mocks.init
    .mockResolvedValueOnce({ release: releases.a })
    .mockResolvedValueOnce({ release: releases.b })
    .mockResolvedValue({ release: async () => {} });
  const cache = new ContextCache();
  let finish: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let started: (() => void) | undefined;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  // A loads first and stays busy; B loads later and goes idle.
  const a = cache.withContext("a", "default", false, async () => {
    started?.();
    await wait;
  });
  await start;
  await cache.withContext("b", "default", false, async () => {});
  // C must evict idle B and run while A is still busy.
  await cache.withContext("c", "default", false, async () => {});
  expect(releases.b).toHaveBeenCalledOnce();
  expect(releases.a).not.toHaveBeenCalled();
  finish?.();
  await a;
  await cache.dispose();
});
