import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/promises before importing module
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFile } from "fs/promises";
import {
  parseImageSpec,
  loadImageSpec,
  ImageBuildSpecSchema,
} from "../src/image-spec.js";
import type { ImageBuildSpec } from "../src/image-spec.js";

const mockedReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// parseImageSpec – defaults
// ---------------------------------------------------------------------------

describe("parseImageSpec defaults", () => {
  it("should return defaults for empty object", () => {
    const spec = parseImageSpec({});
    expect(spec.mode).toBe("fullstack");
    expect(spec.apt_packages).toEqual([]);
    expect(spec.python).toBeUndefined();
    expect(spec.cuda).toBeUndefined();
  });

  it("should accept an empty object", () => {
    expect(() => parseImageSpec({})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseImageSpec – mode
// ---------------------------------------------------------------------------

describe("parseImageSpec mode", () => {
  it("should accept fullstack mode", () => {
    const spec = parseImageSpec({ mode: "fullstack" });
    expect(spec.mode).toBe("fullstack");
  });

  it("should accept backend mode", () => {
    const spec = parseImageSpec({ mode: "backend" });
    expect(spec.mode).toBe("backend");
  });

  it("should reject invalid mode", () => {
    expect(() => parseImageSpec({ mode: "invalid" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseImageSpec – apt_packages
// ---------------------------------------------------------------------------

describe("parseImageSpec apt_packages", () => {
  it("should accept a list of package names", () => {
    const spec = parseImageSpec({ apt_packages: ["curl", "git", "wget"] });
    expect(spec.apt_packages).toEqual(["curl", "git", "wget"]);
  });

  it("should default to empty array", () => {
    const spec = parseImageSpec({});
    expect(spec.apt_packages).toEqual([]);
  });

  it("should reject non-array apt_packages", () => {
    expect(() => parseImageSpec({ apt_packages: "curl" })).toThrow();
  });

  it("should reject non-string elements", () => {
    expect(() => parseImageSpec({ apt_packages: [123] })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseImageSpec – python config
// ---------------------------------------------------------------------------

describe("parseImageSpec python config", () => {
  it("should accept valid python config with version only", () => {
    const spec = parseImageSpec({ python: { version: "3.11" } });
    expect(spec.python).toBeDefined();
    expect(spec.python!.version).toBe("3.11");
    expect(spec.python!.packages).toEqual([]);
    expect(spec.python!.index_url).toBe("https://pypi.org/simple");
    expect(spec.python!.extra_index_urls).toEqual([]);
  });

  it("should accept python config with packages", () => {
    const spec = parseImageSpec({
      python: { version: "3.10", packages: ["numpy", "torch"] },
    });
    expect(spec.python!.packages).toEqual(["numpy", "torch"]);
  });

  it("should accept python config with custom index_url", () => {
    const spec = parseImageSpec({
      python: {
        version: "3.11",
        index_url: "https://download.pytorch.org/whl/cu121",
      },
    });
    expect(spec.python!.index_url).toBe("https://download.pytorch.org/whl/cu121");
  });

  it("should accept python config with extra_index_urls", () => {
    const spec = parseImageSpec({
      python: {
        version: "3.11",
        extra_index_urls: [
          "https://download.pytorch.org/whl/cu121",
          "https://pypi.ngc.nvidia.com",
        ],
      },
    });
    expect(spec.python!.extra_index_urls).toHaveLength(2);
  });

  it("should reject python version not in X.Y format", () => {
    expect(() => parseImageSpec({ python: { version: "3" } })).toThrow();
    expect(() => parseImageSpec({ python: { version: "3.11.1" } })).toThrow();
    expect(() => parseImageSpec({ python: { version: "python3.11" } })).toThrow();
  });

  it("should reject missing python version", () => {
    expect(() => parseImageSpec({ python: {} })).toThrow();
  });

  it("should reject python with non-string packages", () => {
    expect(() =>
      parseImageSpec({ python: { version: "3.11", packages: [123] } })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseImageSpec – cuda
// ---------------------------------------------------------------------------

describe("parseImageSpec cuda", () => {
  it("should accept X.Y format", () => {
    const spec = parseImageSpec({ cuda: "12.1" });
    expect(spec.cuda).toBe("12.1");
  });

  it("should accept X.Y.Z format", () => {
    const spec = parseImageSpec({ cuda: "12.1.0" });
    expect(spec.cuda).toBe("12.1.0");
  });

  it("should reject single number", () => {
    expect(() => parseImageSpec({ cuda: "12" })).toThrow();
  });

  it("should reject non-numeric cuda version", () => {
    expect(() => parseImageSpec({ cuda: "twelve.one" })).toThrow();
  });

  it("should reject four-part version", () => {
    expect(() => parseImageSpec({ cuda: "12.1.0.1" })).toThrow();
  });

  it("should be optional", () => {
    const spec = parseImageSpec({});
    expect(spec.cuda).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseImageSpec – full configuration
// ---------------------------------------------------------------------------

describe("parseImageSpec full configuration", () => {
  it("should accept a complete spec with all fields", () => {
    const spec = parseImageSpec({
      mode: "backend",
      apt_packages: ["ffmpeg", "libsm6"],
      python: {
        version: "3.11",
        packages: ["torch", "transformers"],
        index_url: "https://download.pytorch.org/whl/cu121",
        extra_index_urls: ["https://pypi.org/simple"],
      },
      cuda: "12.1",
    });

    expect(spec.mode).toBe("backend");
    expect(spec.apt_packages).toEqual(["ffmpeg", "libsm6"]);
    expect(spec.python!.version).toBe("3.11");
    expect(spec.python!.packages).toEqual(["torch", "transformers"]);
    expect(spec.cuda).toBe("12.1");
  });

  it("should strip unknown fields", () => {
    const spec = parseImageSpec({
      mode: "fullstack",
      unknown_field: "should be stripped",
    });
    expect(spec.mode).toBe("fullstack");
    expect((spec as Record<string, unknown>)["unknown_field"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseImageSpec – error cases
// ---------------------------------------------------------------------------

describe("parseImageSpec error cases", () => {
  it("should throw for null input", () => {
    expect(() => parseImageSpec(null)).toThrow();
  });

  it("should throw for string input", () => {
    expect(() => parseImageSpec("invalid")).toThrow();
  });

  it("should throw for number input", () => {
    expect(() => parseImageSpec(42)).toThrow();
  });

  it("should throw for array input", () => {
    expect(() => parseImageSpec([1, 2, 3])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ImageBuildSpecSchema
// ---------------------------------------------------------------------------

describe("ImageBuildSpecSchema", () => {
  it("should be exported", () => {
    expect(ImageBuildSpecSchema).toBeDefined();
  });

  it("should parse via safeParse", () => {
    const result = ImageBuildSpecSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should fail safeParse for invalid mode", () => {
    const result = ImageBuildSpecSchema.safeParse({ mode: "bad" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadImageSpec
// ---------------------------------------------------------------------------

describe("loadImageSpec", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should load and parse a valid YAML file", async () => {
    mockedReadFile.mockResolvedValue(
      "mode: backend\napt_packages:\n  - curl\n  - git\n"
    );

    const spec = await loadImageSpec("/path/to/spec.yaml");
    expect(spec.mode).toBe("backend");
    expect(spec.apt_packages).toEqual(["curl", "git"]);
    expect(mockedReadFile).toHaveBeenCalledWith("/path/to/spec.yaml", "utf-8");
  });

  it("should handle an empty YAML file", async () => {
    mockedReadFile.mockResolvedValue("");
    const spec = await loadImageSpec("/path/to/empty.yaml");
    expect(spec.mode).toBe("fullstack");
    expect(spec.apt_packages).toEqual([]);
  });

  it("should handle a YAML file with null content", async () => {
    mockedReadFile.mockResolvedValue("---\n");
    const spec = await loadImageSpec("/path/to/null.yaml");
    expect(spec.mode).toBe("fullstack");
  });

  it("should parse a full YAML spec", async () => {
    const yamlContent = [
      "mode: fullstack",
      "apt_packages:",
      "  - ffmpeg",
      "  - libsm6",
      "python:",
      "  version: '3.11'",
      "  packages:",
      "    - torch",
      "    - transformers",
      "  index_url: https://download.pytorch.org/whl/cu121",
      "  extra_index_urls:",
      "    - https://pypi.org/simple",
      "cuda: '12.1'",
    ].join("\n");

    mockedReadFile.mockResolvedValue(yamlContent);
    const spec = await loadImageSpec("/path/to/full.yaml");

    expect(spec.mode).toBe("fullstack");
    expect(spec.apt_packages).toEqual(["ffmpeg", "libsm6"]);
    expect(spec.python!.version).toBe("3.11");
    expect(spec.python!.packages).toEqual(["torch", "transformers"]);
    expect(spec.cuda).toBe("12.1");
  });

  it("should reject invalid YAML content", async () => {
    mockedReadFile.mockResolvedValue("mode: invalid_mode");
    await expect(loadImageSpec("/path/to/bad.yaml")).rejects.toThrow();
  });

  it("should propagate file read errors", async () => {
    mockedReadFile.mockRejectedValue(new Error("ENOENT: file not found"));
    await expect(loadImageSpec("/nonexistent.yaml")).rejects.toThrow(
      "ENOENT: file not found"
    );
  });
});
