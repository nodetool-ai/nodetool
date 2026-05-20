import { describe, it, expect } from "vitest";
import { ShaderRegistry } from "../src/registry.js";
import { createDefaultRegistry, ALL_SHADERS } from "../src/pool.js";
import { passthroughV1 } from "../src/shaders/_canary/passthrough/v1/module.js";

describe("ShaderRegistry", () => {
  it("registers and resolves a module by (id, version)", () => {
    const registry = new ShaderRegistry();
    registry.register(passthroughV1);
    expect(registry.get({ id: "_canary.passthrough", version: 1 })).toBe(
      passthroughV1
    );
  });

  it("throws on duplicate (id, version)", () => {
    const registry = new ShaderRegistry();
    registry.register(passthroughV1);
    expect(() => registry.register(passthroughV1)).toThrow(/already registered/);
  });

  it("throws naming the missing module when not found", () => {
    const registry = new ShaderRegistry();
    expect(() => registry.get({ id: "color.hsb", version: 2 })).toThrow(
      /color\.hsb@2/
    );
  });

  it("resolves the highest version when no version is pinned", () => {
    const registry = new ShaderRegistry();
    registry.register(passthroughV1);
    registry.register({ ...passthroughV1, version: 3 });
    expect(registry.get({ id: "_canary.passthrough" }).version).toBe(3);
  });

  it("filters by surface and returns undefined on mismatch", () => {
    const registry = new ShaderRegistry();
    registry.register(passthroughV1);
    expect(
      registry.tryGet({ id: "_canary.passthrough", version: 1, surface: "published" })
    ).toBeUndefined();
    expect(
      registry.tryGet({ id: "_canary.passthrough", version: 1, surface: "internal" })
    ).toBe(passthroughV1);
  });

  it("lists by category", () => {
    const registry = new ShaderRegistry();
    registry.register(passthroughV1);
    expect(registry.list({ category: "_canary" })).toEqual([passthroughV1]);
    expect(registry.list({ category: "color" })).toEqual([]);
  });

  it("createDefaultRegistry preloads every catalog module", () => {
    const registry = createDefaultRegistry();
    for (const module of ALL_SHADERS) {
      expect(registry.has({ id: module.id, version: module.version })).toBe(true);
    }
  });
});
