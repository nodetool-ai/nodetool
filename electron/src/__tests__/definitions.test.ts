import { RUNTIME_PACKAGE_NAMES } from "@nodetool-ai/protocol/missing-runtime-package";
import { RUNTIME_PACKAGES } from "../runtime/packages/definitions";

describe("RUNTIME_PACKAGES", () => {
  it("defines all expected package ids", () => {
    const ids = Object.keys(RUNTIME_PACKAGES);
    expect(ids).toContain("python");
    expect(ids).toContain("nodejs");
    expect(ids).toContain("ffmpeg");
    expect(ids).toContain("transformers-js");
  });

  it("names the same packages the backend's missing-package errors name", () => {
    const names = Object.fromEntries(
      Object.values(RUNTIME_PACKAGES).map((pkg) => [pkg.id, pkg.name])
    );
    expect(names).toEqual(RUNTIME_PACKAGE_NAMES);
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
    it("classifies python, nodejs as languages", () => {
      for (const id of ["python", "nodejs"]) {
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

describe("transformers-js runtime versions", () => {
  // `^x.y.z` only, which is what the ranges below use.
  function satisfiesCaret(version: string, range: string): boolean {
    const match = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
    if (!match) {
      throw new Error(`Unsupported range ${range}`);
    }
    const want = match.slice(1).map(Number);
    const have = version.split(".").map(Number);
    if (have[0] !== want[0]) {
      return false;
    }
    for (let i = 1; i < 3; i += 1) {
      if (have[i] !== want[i]) {
        return have[i] > want[i];
      }
    }
    return true;
  }

  const pkg = RUNTIME_PACKAGES["transformers-js"] as { npmPackages: string[] };
  const transformersVersion = pkg.npmPackages
    .find((spec) => spec.startsWith("@huggingface/transformers@"))
    ?.split("@")[2];

  it("installs a @huggingface/transformers that kokoro-js 1.2.1 accepts, so npm keeps one copy and one cache", () => {
    expect(pkg.npmPackages).toContain("kokoro-js@1.2.1");
    // kokoro-js@1.2.1 dependencies: "@huggingface/transformers": "^3.5.1"
    expect(satisfiesCaret(transformersVersion ?? "", "^3.5.1")).toBe(true);
  });

  it("installs a version inside the range transformers-js-nodes declares", () => {
    const nodesPackage = require("../../../packages/transformers-js-nodes/package.json") as {
      devDependencies: Record<string, string>;
    };
    expect(
      satisfiesCaret(transformersVersion ?? "", nodesPackage.devDependencies["@huggingface/transformers"])
    ).toBe(true);
  });
});
