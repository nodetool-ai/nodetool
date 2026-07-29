import {
  assetMediaKind,
  assetToUri,
  entityToUri,
  extForAsset,
  parseAssetUri,
  parseEntityUri,
  tokenizePrompt,
  tokenizePromptLine,
  variablesInPrompt
} from "../promptTokens";

describe("promptTokens", () => {
  describe("tokenizePromptLine", () => {
    it("returns a single text token for plain text", () => {
      expect(tokenizePromptLine("hello world")).toEqual([
        { kind: "text", text: "hello world" }
      ]);
    });

    it("splits an asset mention from surrounding text", () => {
      expect(tokenizePromptLine("see asset://abc.png here")).toEqual([
        { kind: "text", text: "see " },
        { kind: "asset", uri: "asset://abc.png", assetId: "abc", ext: "png" },
        { kind: "text", text: " here" }
      ]);
    });

    it("splits a variable reference", () => {
      expect(tokenizePromptLine("Hi {{ name }}!")).toEqual([
        { kind: "text", text: "Hi " },
        { kind: "variable", expr: "name" },
        { kind: "text", text: "!" }
      ]);
    });

    it("preserves a filter expression inside a variable", () => {
      expect(tokenizePromptLine("{{ title|upper }}")).toEqual([
        { kind: "variable", expr: "title|upper" }
      ]);
    });

    it("does not consume a trailing sentence period into the asset URI", () => {
      expect(tokenizePromptLine("look at asset://x.jpg.")).toEqual([
        { kind: "text", text: "look at " },
        { kind: "asset", uri: "asset://x.jpg", assetId: "x", ext: "jpg" },
        { kind: "text", text: "." }
      ]);
    });

    it("handles adjacent asset and variable tokens", () => {
      expect(tokenizePromptLine("asset://a.png{{ v }}")).toEqual([
        { kind: "asset", uri: "asset://a.png", assetId: "a", ext: "png" },
        { kind: "variable", expr: "v" }
      ]);
    });
  });

  describe("asset helpers", () => {
    it("derives an extension from the asset name", () => {
      expect(extForAsset({ name: "photo.JPEG", content_type: "image/jpeg" })).toBe(
        "jpeg"
      );
    });

    it("falls back to the content type when the name has no extension", () => {
      expect(extForAsset({ name: "clip", content_type: "audio/mpeg" })).toBe(
        "mp3"
      );
    });

    it("builds an asset URN", () => {
      expect(
        assetToUri({ id: "abc123", name: "x.png", content_type: "image/png" })
      ).toBe("asset://abc123.png");
    });

    it("parses an asset URN back to id + ext", () => {
      expect(parseAssetUri("asset://abc123.png")).toEqual({
        assetId: "abc123",
        ext: "png"
      });
    });

    it("classifies media kinds by extension", () => {
      expect(assetMediaKind("png")).toBe("image");
      expect(assetMediaKind("mp3")).toBe("audio");
      expect(assetMediaKind("mp4")).toBe("video");
      expect(assetMediaKind("txt")).toBe("other");
    });
  });

  describe("variablesInPrompt", () => {
    it("collects distinct variable names", () => {
      expect(
        variablesInPrompt("{{ a }} and {{ b }} and {{ a }}")
      ).toEqual(["a", "b"]);
    });
  });

  describe("entity mentions", () => {
    it("splits an entity mention from surrounding text", () => {
      expect(tokenizePromptLine("shot of entity://ent1 at dusk")).toEqual([
        { kind: "text", text: "shot of " },
        { kind: "entity", uri: "entity://ent1", entityId: "ent1" },
        { kind: "text", text: " at dusk" }
      ]);
    });

    it("treats trailing dots as sentence punctuation", () => {
      expect(tokenizePromptLine("meet entity://ent1.")).toEqual([
        { kind: "text", text: "meet " },
        { kind: "entity", uri: "entity://ent1", entityId: "ent1" },
        { kind: "text", text: "." }
      ]);
    });

    it("keeps asset, entity, and variable tokens on one line", () => {
      expect(
        tokenizePromptLine("entity://e asset://a.png {{ v }}")
      ).toEqual([
        { kind: "entity", uri: "entity://e", entityId: "e" },
        { kind: "text", text: " " },
        { kind: "asset", uri: "asset://a.png", assetId: "a", ext: "png" },
        { kind: "text", text: " " },
        { kind: "variable", expr: "v" }
      ]);
    });

    it("round-trips the entity URN helpers", () => {
      expect(entityToUri({ id: "abc" })).toBe("entity://abc");
      expect(parseEntityUri("entity://abc")).toBe("abc");
    });
  });
});
