import { BINDING_CATALOG } from "../bindingCatalog";
import { SKETCH_ACTION_IDS } from "../actionRegistry";
import type { ShortcutScope } from "../bindingCatalog";

describe("bindingCatalog data integrity", () => {
  it("has at least one binding", () => {
    expect(BINDING_CATALOG.length).toBeGreaterThan(0);
  });

  it("every binding references a valid action id", () => {
    const validIds = new Set<string>(SKETCH_ACTION_IDS);
    for (const binding of BINDING_CATALOG) {
      expect(validIds.has(binding.actionId)).toBe(true);
    }
  });

  it("every binding has a non-empty key", () => {
    for (const binding of BINDING_CATALOG) {
      expect(binding.key.length).toBeGreaterThan(0);
    }
  });

  it("every binding has a valid scope", () => {
    const validScopes: ShortcutScope[] = [
      "global",
      "mode:transform",
      "mode:crop",
      "panel:layers"
    ];
    for (const binding of BINDING_CATALOG) {
      expect(validScopes).toContain(binding.scope);
    }
  });

  it("modifier keys are strictly boolean true or absent", () => {
    for (const binding of BINDING_CATALOG) {
      const mods = binding.modifiers;
      if (mods.ctrl !== undefined) expect(mods.ctrl).toBe(true);
      if (mods.shift !== undefined) expect(mods.shift).toBe(true);
      if (mods.alt !== undefined) expect(mods.alt).toBe(true);
    }
  });

  it("no duplicate bindings in global/mode scopes (panel:layers allows context-dependent overloads)", () => {
    const seen = new Set<string>();
    const strictScopes = new Set(["global", "mode:transform", "mode:crop"]);
    for (const binding of BINDING_CATALOG) {
      if (!strictScopes.has(binding.scope)) continue;
      const fingerprint = [
        binding.scope,
        binding.key,
        binding.modifiers.ctrl ? "ctrl" : "",
        binding.modifiers.shift ? "shift" : "",
        binding.modifiers.alt ? "alt" : ""
      ].join("|");
      expect(seen.has(fingerprint)).toBe(false);
      seen.add(fingerprint);
    }
  });

  it("every tool-switch binding is scoped to global", () => {
    const toolBindings = BINDING_CATALOG.filter((b) =>
      b.actionId.startsWith("tool-")
    );
    for (const binding of toolBindings) {
      expect(binding.scope).toBe("global");
    }
  });

  it("transform-mode bindings are scoped to mode:transform", () => {
    const transformBindings = BINDING_CATALOG.filter((b) =>
      b.actionId.startsWith("transform-")
    );
    for (const binding of transformBindings) {
      expect(binding.scope).toBe("mode:transform");
    }
  });

  it("crop-mode bindings are scoped to mode:crop", () => {
    const cropBindings = BINDING_CATALOG.filter((b) =>
      b.actionId.startsWith("crop-")
    );
    for (const binding of cropBindings) {
      expect(binding.scope).toBe("mode:crop");
    }
  });
});
