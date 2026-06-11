import { describe, it, expect } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { BUILTIN_NODE_PACKS } from "@nodetool-ai/protocol";
import { registerBuiltInNodes } from "../src/node-registry-setup.js";

describe("registerBuiltInNodes", () => {
  it("catalog and registrars cover every built-in pack", () => {
    const registry = new NodeRegistry();
    // Throws if a catalog id has no registrar.
    registerBuiltInNodes(registry, { disabledPacks: [] });
    expect(registry.list().length).toBeGreaterThan(0);
  });

  it("skips disabled packs", () => {
    const all = new NodeRegistry();
    registerBuiltInNodes(all, { disabledPacks: [] });

    const withoutFal = new NodeRegistry();
    registerBuiltInNodes(withoutFal, { disabledPacks: ["fal"] });

    const falTypes = all.list().filter((t) => t.startsWith("fal."));
    expect(falTypes.length).toBeGreaterThan(0);
    for (const t of falTypes) {
      expect(withoutFal.has(t)).toBe(false);
    }
    // Everything else is untouched.
    expect(withoutFal.list().length).toBe(all.list().length - falTypes.length);
  });

  it("ignores disabling required packs", () => {
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, { disabledPacks: ["base"] });
    expect(
      registry.list().some((t) => t.startsWith("nodetool."))
    ).toBe(true);
  });

  it("base pack is marked required in the catalog", () => {
    expect(
      BUILTIN_NODE_PACKS.find((p) => p.id === "base")?.required
    ).toBe(true);
  });
});
