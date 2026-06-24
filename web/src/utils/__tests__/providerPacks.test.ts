import {
  isNamespaceKeyGated,
  getKeyGateForNamespace,
  getRequiredKeyForBuiltinPack
} from "../providerPacks";

describe("providerPacks", () => {
  describe("isNamespaceKeyGated / getKeyGateForNamespace", () => {
    it("gates API providers that have a dedicated key", () => {
      expect(isNamespaceKeyGated("openai.chat")).toBe(true);
      expect(getKeyGateForNamespace("openai.chat")).toBe("OPENAI_API_KEY");
      expect(getKeyGateForNamespace("fal.image")).toBe("FAL_API_KEY");
      expect(getKeyGateForNamespace("replicate.image")).toBe(
        "REPLICATE_API_TOKEN"
      );
    });

    it("does not gate locally-run namespaces", () => {
      // huggingface is treated as local despite having a token.
      expect(isNamespaceKeyGated("huggingface.text")).toBe(false);
      expect(getKeyGateForNamespace("huggingface.text")).toBeNull();
      expect(getKeyGateForNamespace("transformers.text")).toBeNull();
    });

    it("does not gate core / keyless namespaces", () => {
      expect(getKeyGateForNamespace("nodetool.text")).toBeNull();
      expect(getKeyGateForNamespace("lib.os")).toBeNull();
    });
  });

  describe("getRequiredKeyForBuiltinPack", () => {
    it("maps keyed provider packs to their secret", () => {
      expect(getRequiredKeyForBuiltinPack("elevenlabs")).toBe(
        "ELEVENLABS_API_KEY"
      );
      expect(getRequiredKeyForBuiltinPack("fal")).toBe("FAL_API_KEY");
      expect(getRequiredKeyForBuiltinPack("topaz")).toBe("TOPAZ_API_KEY");
    });

    it("returns null for keyless / local packs", () => {
      expect(getRequiredKeyForBuiltinPack("transformers-js")).toBeNull();
      expect(getRequiredKeyForBuiltinPack("huggingface")).toBeNull();
    });

    it("returns null for an unknown pack id", () => {
      expect(getRequiredKeyForBuiltinPack("does-not-exist")).toBeNull();
    });
  });
});
