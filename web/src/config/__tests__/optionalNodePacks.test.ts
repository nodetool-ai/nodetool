import {
  OPTIONAL_NODE_PACKS,
  getOptionalNodePackForNamespace,
  isOptionalNamespace,
  isNamespaceHiddenByOptionalPacks
} from "../optionalNodePacks";

describe("optionalNodePacks catalog", () => {
  it("has unique, stable pack ids", () => {
    const ids = OPTIONAL_NODE_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not assign a namespace prefix to more than one pack", () => {
    const seen = new Map<string, string>();
    for (const pack of OPTIONAL_NODE_PACKS) {
      for (const ns of pack.namespaces) {
        expect(seen.has(ns)).toBe(false);
        seen.set(ns, pack.id);
      }
    }
  });

  describe("getOptionalNodePackForNamespace", () => {
    it("matches a namespace nested under a pack prefix", () => {
      expect(getOptionalNodePackForNamespace("lib.image.color")?.id).toBe(
        "imaging"
      );
      expect(getOptionalNodePackForNamespace("lib.convert.pandoc")?.id).toBe(
        "documents"
      );
      expect(getOptionalNodePackForNamespace("messaging.discord")?.id).toBe(
        "integrations"
      );
      expect(getOptionalNodePackForNamespace("nodetool.code")?.id).toBe(
        "developer"
      );
    });

    it("leaves core namespaces unowned", () => {
      expect(getOptionalNodePackForNamespace("nodetool.text")).toBeUndefined();
      expect(getOptionalNodePackForNamespace("openai.chat")).toBeUndefined();
      expect(getOptionalNodePackForNamespace("vector")).toBeUndefined();
      expect(getOptionalNodePackForNamespace("nodetool.image")).toBeUndefined();
    });

    it("does not match a namespace that merely shares a prefix substring", () => {
      // `lib.images` is not under the `lib.image` prefix.
      expect(getOptionalNodePackForNamespace("lib.images")).toBeUndefined();
    });
  });

  describe("isOptionalNamespace", () => {
    it("classifies niche vs core namespaces", () => {
      expect(isOptionalNamespace("lib.os")).toBe(true);
      expect(isOptionalNamespace("apify.scraping")).toBe(true);
      expect(isOptionalNamespace("nodetool.audio")).toBe(false);
    });
  });

  describe("isNamespaceHiddenByOptionalPacks", () => {
    it("hides optional namespaces when their pack is not enabled", () => {
      const enabled = new Set<string>();
      expect(isNamespaceHiddenByOptionalPacks("lib.pdf", enabled)).toBe(true);
      expect(isNamespaceHiddenByOptionalPacks("nodetool.text", enabled)).toBe(
        false
      );
    });

    it("reveals an optional namespace once its pack is enabled", () => {
      const enabled = new Set<string>(["documents"]);
      expect(isNamespaceHiddenByOptionalPacks("lib.pdf", enabled)).toBe(false);
      // A different optional pack stays hidden.
      expect(isNamespaceHiddenByOptionalPacks("lib.os", enabled)).toBe(true);
    });
  });
});
