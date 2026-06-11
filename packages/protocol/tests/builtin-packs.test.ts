import { describe, it, expect } from "vitest";
import {
  BUILTIN_NODE_PACKS,
  findBuiltinPackForNodeType,
  resolveBuiltinPackEnabled
} from "../src/builtin-packs.js";

describe("BUILTIN_NODE_PACKS catalog", () => {
  it("has unique ids and non-empty namespaces", () => {
    const ids = BUILTIN_NODE_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pack of BUILTIN_NODE_PACKS) {
      expect(pack.namespaces.length).toBeGreaterThan(0);
    }
  });

  it("base is required; the essentials are enabled by default", () => {
    const byId = new Map(BUILTIN_NODE_PACKS.map((p) => [p.id, p]));
    expect(byId.get("base")?.required).toBe(true);
    for (const id of ["huggingface", "fal", "replicate", "kie"]) {
      expect(byId.get(id)?.defaultEnabled).toBe(true);
    }
  });
});

describe("resolveBuiltinPackEnabled", () => {
  const optIn = { id: "x", name: "X", description: "", namespaces: ["x"] };
  const def = { ...optIn, defaultEnabled: true };
  const req = { ...optIn, required: true };

  it("falls back to the install default without an override", () => {
    expect(resolveBuiltinPackEnabled(optIn)).toBe(false);
    expect(resolveBuiltinPackEnabled(def)).toBe(true);
  });

  it("explicit overrides win over defaults", () => {
    expect(resolveBuiltinPackEnabled(optIn, true)).toBe(true);
    expect(resolveBuiltinPackEnabled(def, false)).toBe(false);
  });

  it("required packs are always enabled", () => {
    expect(resolveBuiltinPackEnabled(req, false)).toBe(true);
  });
});

describe("findBuiltinPackForNodeType", () => {
  it("maps a node type to the optional pack that provides it", () => {
    expect(findBuiltinPackForNodeType("elevenlabs.tts.TextToSpeech")?.id).toBe(
      "elevenlabs"
    );
    expect(findBuiltinPackForNodeType("fal.image.FluxDev")?.id).toBe("fal");
  });

  it("skips required packs (their node types are never missing)", () => {
    expect(findBuiltinPackForNodeType("nodetool.text.Concat")).toBeUndefined();
    expect(findBuiltinPackForNodeType("lib.json.ParseJson")).toBeUndefined();
  });

  it("maps the shared kie namespace to the kie pack", () => {
    // base-nodes also registers under `kie.`, but base is required, so the
    // optional kie pack is the only enable-able candidate.
    expect(findBuiltinPackForNodeType("kie.image.Imagen4")?.id).toBe("kie");
  });

  it("returns undefined for unknown namespaces", () => {
    expect(findBuiltinPackForNodeType("acme.cool.Node")).toBeUndefined();
    expect(findBuiltinPackForNodeType("")).toBeUndefined();
  });
});
