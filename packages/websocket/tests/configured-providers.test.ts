import { describe, it, expect, vi } from "vitest";
import { clearProviderCache } from "@nodetool-ai/runtime";
import type { BaseProvider } from "@nodetool-ai/runtime";
import {
  ConfiguredProviderCache,
  type ProviderSet
} from "../src/configured-providers.js";

/** A provider set is only ever read by identity here. */
const providerSet = (...ids: string[]): ProviderSet =>
  Object.fromEntries(ids.map((id) => [id, { id } as unknown as BaseProvider]));

describe("ConfiguredProviderCache", () => {
  it("builds once per user and reuses the set", async () => {
    const load = vi.fn(async () => providerSet("openai"));
    const cache = new ConfiguredProviderCache({ load, now: () => 0 });

    const first = await cache.get("user-1");
    const second = await cache.get("user-1");

    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("keeps one entry per user", async () => {
    const load = vi.fn(async (userId: string) => providerSet(userId));
    const cache = new ConfiguredProviderCache({ load, now: () => 0 });

    expect(Object.keys(await cache.get("user-1"))).toEqual(["user-1"]);
    expect(Object.keys(await cache.get("user-2"))).toEqual(["user-2"]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("rebuilds after a credential write bumps the registry version", async () => {
    let built = 0;
    const cache = new ConfiguredProviderCache({
      load: async () => providerSet(built++ === 0 ? "openai" : "codex"),
      now: () => 0
    });

    expect(Object.keys(await cache.get("user-1"))).toEqual(["openai"]);
    // What an OAuth sign-in does after persisting the credential.
    clearProviderCache();
    expect(Object.keys(await cache.get("user-1"))).toEqual(["codex"]);
  });

  it("rebuilds once the entry is older than the TTL", async () => {
    let now = 0;
    const load = vi.fn(async () => providerSet("codex"));
    const cache = new ConfiguredProviderCache({
      load,
      ttlMs: 1000,
      now: () => now
    });

    await cache.get("user-1");
    now = 999;
    await cache.get("user-1");
    expect(load).toHaveBeenCalledTimes(1);

    // A cached Codex provider holds a bearer that expires without any write
    // this process sees, so age alone has to rebuild it.
    now = 1000;
    await cache.get("user-1");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
