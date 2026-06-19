/**
 * @jest-environment node
 */

import {
  extForAsset,
  parseAssetUri,
  tokenizePromptLine,
  tokenizePrompt,
  variablesInPrompt,
  assetMediaKind,
  assetToUri
} from "../promptTokens";

describe("extForAsset edge cases", () => {
  it("returns empty string when name and content_type are both null", () => {
    expect(extForAsset({ name: null, content_type: null })).toBe("");
  });

  it("returns empty string when name and content_type are both undefined", () => {
    expect(extForAsset({})).toBe("");
  });

  it("extracts sub-type from unknown content types", () => {
    expect(extForAsset({ content_type: "application/pdf" })).toBe("pdf");
  });

  it("handles content types with + suffix", () => {
    expect(extForAsset({ content_type: "image/svg+xml" })).toBe("svg");
  });

  it("does not use a dot at the start of the name as an extension", () => {
    expect(extForAsset({ name: ".hidden" })).toBe("");
  });

  it("prefers name extension over content_type", () => {
    expect(extForAsset({ name: "photo.webp", content_type: "image/jpeg" })).toBe("webp");
  });

  it("handles name with multiple dots", () => {
    expect(extForAsset({ name: "archive.tar.gz" })).toBe("gz");
  });
});

describe("parseAssetUri edge cases", () => {
  it("handles URI without asset:// scheme", () => {
    const result = parseAssetUri("abc123.png");
    expect(result.assetId).toBe("abc123");
    expect(result.ext).toBe("png");
  });

  it("strips query parameters from URI", () => {
    const result = parseAssetUri("asset://abc123.png?w=200");
    expect(result.assetId).toBe("abc123");
    expect(result.ext).toBe("png");
  });

  it("strips hash from URI", () => {
    const result = parseAssetUri("asset://abc123.png#section");
    expect(result.assetId).toBe("abc123");
    expect(result.ext).toBe("png");
  });

  it("handles URI with no extension", () => {
    const result = parseAssetUri("asset://abc123");
    expect(result.assetId).toBe("abc123");
    expect(result.ext).toBe("");
  });

  it("handles URI with path segments", () => {
    const result = parseAssetUri("asset://folder/abc123.mp3");
    expect(result.assetId).toBe("folder/abc123");
    expect(result.ext).toBe("mp3");
  });
});

describe("assetToUri edge cases", () => {
  it("omits extension when none can be derived", () => {
    expect(assetToUri({ id: "abc123" })).toBe("asset://abc123");
  });

  it("includes extension from content_type fallback", () => {
    expect(assetToUri({ id: "abc", content_type: "audio/mpeg" })).toBe("asset://abc.mp3");
  });
});

describe("assetMediaKind edge cases", () => {
  it("is case-insensitive", () => {
    expect(assetMediaKind("PNG")).toBe("image");
    expect(assetMediaKind("MP3")).toBe("audio");
    expect(assetMediaKind("MP4")).toBe("video");
  });

  it("classifies all supported image extensions", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]) {
      expect(assetMediaKind(ext)).toBe("image");
    }
  });

  it("classifies all supported audio extensions", () => {
    for (const ext of ["mp3", "mpeg", "wav", "ogg", "m4a", "aac", "flac", "opus"]) {
      expect(assetMediaKind(ext)).toBe("audio");
    }
  });

  it("classifies all supported video extensions", () => {
    for (const ext of ["mp4", "webm", "mov", "mkv", "avi"]) {
      expect(assetMediaKind(ext)).toBe("video");
    }
  });
});

describe("tokenizePromptLine edge cases", () => {
  it("returns empty array for empty string", () => {
    expect(tokenizePromptLine("")).toEqual([]);
  });

  it("handles whitespace-only string", () => {
    expect(tokenizePromptLine("   ")).toEqual([{ kind: "text", text: "   " }]);
  });

  it("handles multiple asset URIs in one line", () => {
    const tokens = tokenizePromptLine("asset://a.png and asset://b.jpg");
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({ kind: "asset", uri: "asset://a.png", assetId: "a", ext: "png" });
    expect(tokens[1]).toEqual({ kind: "text", text: " and " });
    expect(tokens[2]).toEqual({ kind: "asset", uri: "asset://b.jpg", assetId: "b", ext: "jpg" });
  });

  it("handles multiple variables in one line", () => {
    const tokens = tokenizePromptLine("{{ a }} {{ b }}");
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({ kind: "variable", expr: "a" });
    expect(tokens[1]).toEqual({ kind: "text", text: " " });
    expect(tokens[2]).toEqual({ kind: "variable", expr: "b" });
  });

  it("trims whitespace inside variable delimiters", () => {
    const tokens = tokenizePromptLine("{{  spaced  }}");
    expect(tokens).toEqual([{ kind: "variable", expr: "spaced" }]);
  });

  it("handles asset URI with trailing ellipsis", () => {
    const tokens = tokenizePromptLine("see asset://x.jpg...");
    expect(tokens[1]).toEqual({ kind: "asset", uri: "asset://x.jpg", assetId: "x", ext: "jpg" });
    expect(tokens[2]).toEqual({ kind: "text", text: "..." });
  });
});

describe("tokenizePrompt multi-line", () => {
  it("splits lines correctly", () => {
    const result = tokenizePrompt("line one\nline two");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([{ kind: "text", text: "line one" }]);
    expect(result[1]).toEqual([{ kind: "text", text: "line two" }]);
  });

  it("handles empty lines", () => {
    const result = tokenizePrompt("first\n\nthird");
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual([]);
  });
});

describe("variablesInPrompt edge cases", () => {
  it("returns empty array for text with no variables", () => {
    expect(variablesInPrompt("just plain text")).toEqual([]);
  });

  it("deduplicates across lines", () => {
    expect(variablesInPrompt("{{ x }}\n{{ x }}")).toEqual(["x"]);
  });

  it("preserves filter expressions", () => {
    expect(variablesInPrompt("{{ name|lower }}")).toEqual(["name|lower"]);
  });

  it("handles empty prompt", () => {
    expect(variablesInPrompt("")).toEqual([]);
  });
});
