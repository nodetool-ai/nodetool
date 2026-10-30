import { describe, expect, it, vi } from "vitest";
import { createCatalogPackSource, loadBundledPackSource, setDefaultPackSource } from "../src/index.js";

describe("HTTP-independent pack host", () => {
  it("does not initialize providers until the composing host requests it", async () => {
    const registerProviders = vi.fn(async () => {});
    const policy = { production: true };
    const source = createCatalogPackSource({ registerProviders });
    expect(registerProviders).not.toHaveBeenCalled();
    await source.registerProviders(policy);
    expect(registerProviders).toHaveBeenCalledWith(policy);
  });
  it("supports a catalog without agent or provider integration", async () => {
    await expect(createCatalogPackSource().registerProviders({})).resolves.toBeUndefined();
  });
  it("preserves configured provider startup failures and their cause", async () => {
    const cause = new Error("Missing configured provider dependency");
    const failure = new Error("Provider startup failed", { cause });
    const source = createCatalogPackSource({ registerProviders: async () => { throw failure; } });
    await expect(source.registerProviders({})).rejects.toBe(failure);
  });
  it("lets an explicit host source take precedence over a default factory", async () => {
    const source = createCatalogPackSource();
    const fallback = vi.fn(() => createCatalogPackSource());
    expect(await loadBundledPackSource(fallback)).not.toBe(source);
    expect(fallback).toHaveBeenCalledTimes(1);
    setDefaultPackSource(source);
    expect(await loadBundledPackSource(fallback)).toBe(source);
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
