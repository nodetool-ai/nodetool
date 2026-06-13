import { describe, it, expect, afterEach } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  BUILTIN_NODE_PACKS,
  CLOUD_PROFILE_ENV,
  isCloudNodeType
} from "@nodetool-ai/protocol";
import {
  applyBuiltinPackEnabled,
  applyCloudNodePolicy,
  registerBuiltInNodes
} from "../src/node-registry-setup.js";

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

describe("applyBuiltinPackEnabled", () => {
  it("registers and unregisters exactly the pack's node types", () => {
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, { enabledOverrides: {} });
    const before = registry.list().length;

    applyBuiltinPackEnabled(registry, "elevenlabs", true);
    const elevenlabsTypes = registry
      .list()
      .filter((t) => t.startsWith("elevenlabs."));
    expect(elevenlabsTypes.length).toBeGreaterThan(0);

    applyBuiltinPackEnabled(registry, "elevenlabs", false);
    expect(
      registry.list().some((t) => t.startsWith("elevenlabs."))
    ).toBe(false);
    expect(registry.list().length).toBe(before);
  });

  it("disabling kie leaves base's kie.* nodes intact", () => {
    // base-nodes also registers types under the `kie.` namespace; live
    // disable must remove only what kie-nodes itself registers.
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, { enabledOverrides: { kie: false } });
    const baseKieTypes = registry
      .list()
      .filter((t) => t.startsWith("kie."));

    applyBuiltinPackEnabled(registry, "kie", true);
    applyBuiltinPackEnabled(registry, "kie", false);
    expect(registry.list().filter((t) => t.startsWith("kie."))).toEqual(
      baseKieTypes
    );
  });

  it("enabling is idempotent", () => {
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, { enabledOverrides: {} });
    applyBuiltinPackEnabled(registry, "minimax", true);
    const count = registry.list().length;
    applyBuiltinPackEnabled(registry, "minimax", true);
    expect(registry.list().length).toBe(count);
  });

  it("throws for unknown pack ids", () => {
    expect(() =>
      applyBuiltinPackEnabled(new NodeRegistry(), "nope", true)
    ).toThrow(/No registrar/);
  });
});

describe("applyCloudNodePolicy", () => {
  afterEach(() => {
    delete process.env[CLOUD_PROFILE_ENV];
  });

  function fullRegistry(): NodeRegistry {
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, {
      enabledOverrides: Object.fromEntries(
        BUILTIN_NODE_PACKS.map((p) => [p.id, true])
      )
    });
    return registry;
  }

  it("is a no-op when the cloud profile is off", () => {
    delete process.env[CLOUD_PROFILE_ENV];
    const registry = fullRegistry();
    const before = registry.list().length;
    applyCloudNodePolicy(registry);
    expect(registry.list().length).toBe(before);
    // Nerdy namespaces survive without the profile.
    expect(registry.list().some((t) => t.startsWith("lib.os."))).toBe(true);
  });

  it("drops nerdy/out-of-scope nodes when the cloud profile is on", () => {
    process.env[CLOUD_PROFILE_ENV] = "cloud";
    const registry = fullRegistry();
    applyCloudNodePolicy(registry);

    const remaining = registry.list();
    expect(remaining.length).toBeGreaterThan(0);
    // Every survivor is part of the curated cloud surface…
    for (const nodeType of remaining) {
      expect(isCloudNodeType(nodeType)).toBe(true);
    }
    // …nerdy namespaces are gone…
    for (const prefix of [
      "lib.os.",
      "lib.sqlite.",
      "nodetool.data.",
      "nodetool.workspace.",
      "vector.",
      "search.google.",
      "huggingface."
    ]) {
      expect(remaining.some((t) => t.startsWith(prefix))).toBe(false);
    }
    // …the developer-flavored agents are gone…
    expect(remaining).not.toContain("nodetool.agents.ShellAgent");
    // …while the creative core stays.
    expect(remaining).toContain("nodetool.code.Code");
    expect(remaining.some((t) => t.startsWith("nodetool.image."))).toBe(true);
    expect(remaining.some((t) => t.startsWith("nodetool.audio."))).toBe(true);
  });
});
