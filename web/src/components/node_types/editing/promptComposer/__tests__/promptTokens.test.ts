import {
  assetMediaKind,
  assetToUri,
  extForAsset,
  parseAssetUri,
  tokenizePrompt,
  tokenizePromptLine,
  tokensToPrompt,
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

  describe("round-trip", () => {
    it("re-serializes a multi-line prompt to canonical form", () => {
      const original =
        "Describe asset://img-1.png\nfor {{ audience }} in {{ tone }} tone";
      expect(tokensToPrompt(tokenizePrompt(original))).toBe(original);
    });

    it("canonicalizes variable spacing on round-trip", () => {
      expect(tokensToPrompt(tokenizePrompt("{{name}}"))).toBe("{{ name }}");
    });

    it("preserves blank lines", () => {
      const original = "line one\n\nline three";
      expect(tokensToPrompt(tokenizePrompt(original))).toBe(original);
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
});
