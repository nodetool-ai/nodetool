import { languageFromAsset, isTextAsset, previewKind } from "./assetLanguage";

describe("assetLanguage", () => {
  describe("languageFromAsset", () => {
    it("resolves language from common extensions", () => {
      expect(languageFromAsset({ name: "app.ts" })).toBe("typescript");
      expect(languageFromAsset({ name: "app.tsx" })).toBe("typescript");
      expect(languageFromAsset({ name: "index.js" })).toBe("javascript");
      expect(languageFromAsset({ name: "style.css" })).toBe("css");
      expect(languageFromAsset({ name: "data.json" })).toBe("json");
      expect(languageFromAsset({ name: "readme.md" })).toBe("markdown");
      expect(languageFromAsset({ name: "config.yaml" })).toBe("yaml");
      expect(languageFromAsset({ name: "script.py" })).toBe("python");
      expect(languageFromAsset({ name: "query.sql" })).toBe("sql");
    });

    it("resolves Dockerfile by basename", () => {
      expect(languageFromAsset({ name: "Dockerfile" })).toBe("dockerfile");
      expect(languageFromAsset({ name: "path/to/Dockerfile" })).toBe("dockerfile");
    });

    it("is case-insensitive for filenames", () => {
      expect(languageFromAsset({ name: "APP.TS" })).toBe("typescript");
      expect(languageFromAsset({ name: "README.MD" })).toBe("markdown");
    });

    it("falls back to content_type when extension is unknown", () => {
      expect(languageFromAsset({ name: "data", content_type: "application/json" })).toBe("json");
      expect(languageFromAsset({ name: "data", content_type: "application/xml" })).toBe("xml");
      expect(languageFromAsset({ name: "data", content_type: "text/plain" })).toBe("plaintext");
    });

    it("returns undefined for binary/unknown types", () => {
      expect(languageFromAsset({ name: "photo.png" })).toBeUndefined();
      expect(languageFromAsset({ name: "video.mp4" })).toBeUndefined();
      expect(languageFromAsset({ name: "archive.zip" })).toBeUndefined();
      expect(languageFromAsset({ name: "data", content_type: "application/octet-stream" })).toBeUndefined();
    });

    it("handles null/empty name and content_type", () => {
      expect(languageFromAsset({})).toBeUndefined();
      expect(languageFromAsset({ name: null, content_type: null })).toBeUndefined();
      expect(languageFromAsset({ name: "" })).toBeUndefined();
    });

    it("handles shell scripts", () => {
      expect(languageFromAsset({ name: "deploy.sh" })).toBe("shell");
      expect(languageFromAsset({ name: "init.bash" })).toBe("shell");
      expect(languageFromAsset({ name: "rc.zsh" })).toBe("shell");
    });
  });

  describe("isTextAsset", () => {
    it("returns true for text assets", () => {
      expect(isTextAsset({ name: "code.ts" })).toBe(true);
      expect(isTextAsset({ name: "notes.md" })).toBe(true);
      expect(isTextAsset({ name: "data.csv" })).toBe(true);
    });

    it("returns false for binary assets", () => {
      expect(isTextAsset({ name: "image.png" })).toBe(false);
      expect(isTextAsset({ name: "model.bin" })).toBe(false);
    });
  });

  describe("previewKind", () => {
    it("returns 'markdown' for markdown files", () => {
      expect(previewKind({ name: "readme.md" })).toBe("markdown");
      expect(previewKind({ name: "docs.markdown" })).toBe("markdown");
    });

    it("returns 'csv' for csv/tsv files", () => {
      expect(previewKind({ name: "data.csv" })).toBe("csv");
      expect(previewKind({ name: "data.tsv" })).toBe("csv");
    });

    it("returns 'code' for syntax-highlighted languages", () => {
      expect(previewKind({ name: "app.ts" })).toBe("code");
      expect(previewKind({ name: "style.css" })).toBe("code");
      expect(previewKind({ name: "data.json" })).toBe("code");
    });

    it("returns 'text' for plain text", () => {
      expect(previewKind({ name: "notes.txt" })).toBe("text");
      expect(previewKind({ name: "output.log" })).toBe("text");
    });
  });
});
