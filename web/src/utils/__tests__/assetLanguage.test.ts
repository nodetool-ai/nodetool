import { isTextAsset, languageFromAsset } from "../assetLanguage";

describe("languageFromAsset", () => {
  it("resolves a language from common extensions", () => {
    expect(languageFromAsset({ name: "main.ts" })).toBe("typescript");
    expect(languageFromAsset({ name: "app.py" })).toBe("python");
    expect(languageFromAsset({ name: "config.yaml" })).toBe("yaml");
    expect(languageFromAsset({ name: "query.sql" })).toBe("sql");
    expect(languageFromAsset({ name: "README.md" })).toBe("markdown");
    expect(languageFromAsset({ name: "style.scss" })).toBe("scss");
  });

  it("recognises extension-less type files", () => {
    expect(languageFromAsset({ name: "Dockerfile" })).toBe("dockerfile");
  });

  it("falls back to MIME type when the extension is unknown", () => {
    expect(
      languageFromAsset({ name: "notes", content_type: "text/plain" })
    ).toBe("plaintext");
    expect(
      languageFromAsset({ name: "data", content_type: "application/json" })
    ).toBe("json");
  });

  it("returns undefined for binary assets", () => {
    expect(
      languageFromAsset({ name: "photo.png", content_type: "image/png" })
    ).toBeUndefined();
    expect(
      languageFromAsset({ name: "clip.mp3", content_type: "audio/mpeg" })
    ).toBeUndefined();
  });
});

describe("isTextAsset", () => {
  it("is true for text formats", () => {
    expect(isTextAsset({ name: "main.ts" })).toBe(true);
    expect(isTextAsset({ name: "x", content_type: "text/csv" })).toBe(true);
  });

  it("is false for binary formats", () => {
    expect(isTextAsset({ name: "photo.png", content_type: "image/png" })).toBe(
      false
    );
  });
});
