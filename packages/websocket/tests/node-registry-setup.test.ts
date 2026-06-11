import { describe, it, expect } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { BUILTIN_NODE_PACKS } from "@nodetool-ai/protocol";
import { registerBuiltInNodes } from "../src/node-registry-setup.js";

function allEnabled(): Record<string, boolean> {
  return Object.fromEntries(BUILTIN_NODE_PACKS.map((p) => [p.id, true]));
}

describe("registerBuiltInNodes", () => {
  it("catalog and registrars cover every built-in pack", () => {
    const registry = new NodeRegistry();
    // Throws if a catalog id has no registrar.
    registerBuiltInNodes(registry, { enabledOverrides: allEnabled() });
    expect(registry.list().length).toBeGreaterThan(0);
  });

  it("only registers required and default-enabled packs out of the box", () => {
    const everything = new NodeRegistry();
    registerBuiltInNodes(everything, { enabledOverrides: allEnabled() });

    const defaults = new NodeRegistry();
    registerBuiltInNodes(defaults, { enabledOverrides: {} });

    // Defaults are a strict subset: opt-in packs (e.g. ElevenLabs) are absent…
    const elevenlabsTypes = everything
      .list()
      .filter((t) => t.startsWith("elevenlabs."));
    expect(elevenlabsTypes.length).toBeGreaterThan(0);
    for (const t of elevenlabsTypes) {
      expect(defaults.has(t)).toBe(false);
    }
    // …while default-enabled packs (e.g. FAL) are present.
    expect(defaults.list().some((t) => t.startsWith("fal."))).toBe(true);
    expect(defaults.list().length).toBeLessThan(everything.list().length);
  });

  it("user overrides enable opt-in packs and disable default ones", () => {
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, {
      enabledOverrides: { elevenlabs: true, fal: false }
    });
    expect(registry.list().some((t) => t.startsWith("elevenlabs."))).toBe(true);
    expect(registry.list().some((t) => t.startsWith("fal."))).toBe(false);
  });

  it("ignores disabling required packs", () => {
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, { enabledOverrides: { base: false } });
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
