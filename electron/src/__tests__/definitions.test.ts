import { RUNTIME_PACKAGES } from "../runtime/packages/definitions";

describe("RUNTIME_PACKAGES", () => {
  it("defines all expected package ids", () => {
    const ids = Object.keys(RUNTIME_PACKAGES);
    expect(ids).toContain("python");
    expect(ids).toContain("nodejs");
    expect(ids).toContain("ffmpeg");
    expect(ids).toContain("bash");
    expect(ids).toContain("transformers-js");
  });

  it("every package has required fields", () => {
    for (const [id, pkg] of Object.entries(RUNTIME_PACKAGES)) {
      expect(pkg.id).toBe(id);
      expect(pkg.name).toEqual(expect.any(String));
      expect(pkg.name.length).toBeGreaterThan(0);
      expect(pkg.description).toEqual(expect.any(String));
      expect(pkg.description.length).toBeGreaterThan(0);
      expect(["language", "tool", "library"]).toContain(pkg.category);
      expect(pkg.versionRange).toEqual(expect.any(String));
    }
  });

  it("every package implements the RuntimePackage interface", () => {
    for (const pkg of Object.values(RUNTIME_PACKAGES)) {
      expect(pkg.status).toEqual(expect.any(Function));
      expect(pkg.install).toEqual(expect.any(Function));
      expect(pkg.update).toEqual(expect.any(Function));
      expect(pkg.repair).toEqual(expect.any(Function));
      expect(pkg.uninstall).toEqual(expect.any(Function));
      expect(pkg.resolve).toEqual(expect.any(Function));
    }
  });

  describe("categories", () => {
    it("classifies python, nodejs, bash, ruby, lua as languages", () => {
      for (const id of ["python", "nodejs", "bash", "ruby", "lua"]) {
        expect(RUNTIME_PACKAGES[id as keyof typeof RUNTIME_PACKAGES].category).toBe("language");
      }
    });

    it("classifies ffmpeg, pandoc, pdftotext, yt-dlp as tools", () => {
      for (const id of ["ffmpeg", "pandoc", "pdftotext", "yt-dlp"]) {
        expect(RUNTIME_PACKAGES[id as keyof typeof RUNTIME_PACKAGES].category).toBe("tool");
      }
    });

    it("classifies transformers-js, claude-agent-sdk, tensorflow-js as libraries", () => {
      for (const id of ["transformers-js", "claude-agent-sdk", "tensorflow-js"]) {
        expect(RUNTIME_PACKAGES[id as keyof typeof RUNTIME_PACKAGES].category).toBe("library");
      }
    });
  });

  describe("package-specific constraints", () => {
    it("python targets version >=3.11 <3.12", () => {
      expect(RUNTIME_PACKAGES.python.versionRange).toBe(">=3.11 <3.12");
    });

    it("ffmpeg targets version >=6 <7", () => {
      expect(RUNTIME_PACKAGES.ffmpeg.versionRange).toBe(">=6 <7");
    });

    it("nodejs accepts any version (bundled with Electron)", () => {
      expect(RUNTIME_PACKAGES.nodejs.versionRange).toBe("*");
    });
  });
});
