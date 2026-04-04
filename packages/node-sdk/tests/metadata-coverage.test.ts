/**
 * Additional metadata tests for coverage:
 *  - Non-existent root warning
 *  - Invalid JSON file warning
 *  - Non-object metadata file warning
 *  - Duplicate node_type detection
 *  - Nodes with invalid entries (non-object, missing node_type)
 *  - Skipping .git, node_modules, dist directories
 *  - Error reading a directory
 *  - Metadata files directly under root that is already a package_metadata dir
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPythonPackageMetadata } from "../src/metadata.js";

const tmpDirs: string[] = [];

function makeTmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-metadata-cov-"));
  tmpDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadPythonPackageMetadata – edge cases", () => {
  it("warns when root does not exist", () => {
    const result = loadPythonPackageMetadata({
      roots: ["/nonexistent/path/12345"]
    });
    expect(result.warnings.some((w) => w.includes("does not exist"))).toBe(
      true
    );
    expect(result.files).toEqual([]);
    expect(result.packages).toEqual([]);
  });

  it("uses cwd when no roots provided", () => {
    // Just verify it doesn't throw
    const result = loadPythonPackageMetadata({ roots: [] });
    expect(result).toBeDefined();
    expect(result.warnings).toBeDefined();
  });

  it("handles invalid JSON files with warning", () => {
    const root = makeTmpRoot();
    const metadataDir = path.join(root, "src", "nodetool", "package_metadata");
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.writeFileSync(path.join(metadataDir, "bad.json"), "{ invalid json }}}");

    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(
      result.warnings.some((w) => w.includes("Failed to parse JSON"))
    ).toBe(true);
  });

  it("warns about non-object metadata files", () => {
    const root = makeTmpRoot();
    const metadataDir = path.join(root, "src", "nodetool", "package_metadata");
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.writeFileSync(path.join(metadataDir, "array.json"), "[1,2,3]");

    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(result.warnings.some((w) => w.includes("non-object"))).toBe(true);
  });

  it("detects duplicate node_types", () => {
    const root = makeTmpRoot();
    const metadataDir1 = path.join(
      root,
      "pkg1",
      "src",
      "nodetool",
      "package_metadata"
    );
    const metadataDir2 = path.join(
      root,
      "pkg2",
      "src",
      "nodetool",
      "package_metadata"
    );
    fs.mkdirSync(metadataDir1, { recursive: true });
    fs.mkdirSync(metadataDir2, { recursive: true });

    const nodeData = {
      name: "test-pkg",
      nodes: [
        {
          title: "Dup",
          node_type: "nodetool.test.Dup",
          properties: [],
          outputs: []
        }
      ]
    };

    fs.writeFileSync(
      path.join(metadataDir1, "pkg1.json"),
      JSON.stringify(nodeData)
    );
    fs.writeFileSync(
      path.join(metadataDir2, "pkg2.json"),
      JSON.stringify(nodeData)
    );

    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(result.duplicates).toContain("nodetool.test.Dup");
  });

  it("skips invalid node entries (non-object, missing node_type)", () => {
    const root = makeTmpRoot();
    const metadataDir = path.join(root, "src", "nodetool", "package_metadata");
    fs.mkdirSync(metadataDir, { recursive: true });

    fs.writeFileSync(
      path.join(metadataDir, "pkg.json"),
      JSON.stringify({
        name: "pkg",
        nodes: [
          null,
          "string-node",
          { title: "no-type" },
          {
            title: "Valid",
            node_type: "nodetool.test.Valid",
            properties: [],
            outputs: []
          }
        ]
      })
    );

    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(result.nodesByType.size).toBe(1);
    expect(result.nodesByType.has("nodetool.test.Valid")).toBe(true);
  });

  it("respects maxDepth", () => {
    const root = makeTmpRoot();
    // Create deeply nested metadata dir beyond maxDepth
    const deepDir = path.join(
      root,
      "a",
      "b",
      "c",
      "d",
      "e",
      "src",
      "nodetool",
      "package_metadata"
    );
    fs.mkdirSync(deepDir, { recursive: true });
    fs.writeFileSync(
      path.join(deepDir, "deep.json"),
      JSON.stringify({ name: "deep", nodes: [] })
    );

    const result = loadPythonPackageMetadata({ roots: [root], maxDepth: 2 });
    expect(result.files).toEqual([]);
  });

  it("uses package file basename when name is not a string", () => {
    const root = makeTmpRoot();
    const metadataDir = path.join(root, "src", "nodetool", "package_metadata");
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.writeFileSync(
      path.join(metadataDir, "my-package.json"),
      JSON.stringify({ name: 123, nodes: [] }) // name is not a string
    );

    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].name).toBe("my-package");
  });

  it("skips .git, node_modules, and dist directories", () => {
    const root = makeTmpRoot();
    // Create metadata inside .git/nodetool/package_metadata (should be skipped)
    const gitDir = path.join(root, ".git", "nodetool", "package_metadata");
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(
      path.join(gitDir, "git.json"),
      JSON.stringify({ name: "git-pkg", nodes: [] })
    );

    // Create metadata inside node_modules
    const nmDir = path.join(
      root,
      "node_modules",
      "nodetool",
      "package_metadata"
    );
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(
      path.join(nmDir, "nm.json"),
      JSON.stringify({ name: "nm-pkg", nodes: [] })
    );

    // Create metadata inside dist
    const distDir = path.join(root, "dist", "nodetool", "package_metadata");
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(
      path.join(distDir, "dist.json"),
      JSON.stringify({ name: "dist-pkg", nodes: [] })
    );

    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(result.files).toEqual([]);
    expect(result.packages).toEqual([]);
  });

  it("handles package with all optional metadata fields", () => {
    const root = makeTmpRoot();
    const metadataDir = path.join(root, "src", "nodetool", "package_metadata");
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.writeFileSync(
      path.join(metadataDir, "full.json"),
      JSON.stringify({
        name: "full-pkg",
        description: "A description",
        version: "1.0.0",
        authors: ["Author A"],
        repo_id: "repo/full-pkg",
        nodes: [],
        examples: [{ name: "ex1" }],
        assets: [{ name: "asset1" }]
      })
    );

    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(result.packages).toHaveLength(1);
    const pkg = result.packages[0];
    expect(pkg.description).toBe("A description");
    expect(pkg.version).toBe("1.0.0");
    expect(pkg.authors).toEqual(["Author A"]);
    expect(pkg.repo_id).toBe("repo/full-pkg");
    expect(pkg.examples).toHaveLength(1);
    expect(pkg.assets).toHaveLength(1);
  });

  it("handles root that is itself a package_metadata directory", () => {
    const root = makeTmpRoot();
    const metadataDir = path.join(root, "src", "nodetool", "package_metadata");
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.writeFileSync(
      path.join(metadataDir, "direct.json"),
      JSON.stringify({ name: "direct", nodes: [] })
    );

    // Use the package_metadata dir itself as the root
    const result = loadPythonPackageMetadata({ roots: [metadataDir] });
    expect(result.files).toHaveLength(1);
  });

  it("warns when metadata dir at root level fails to read (lines 97-98)", () => {
    const root = makeTmpRoot();
    // Create a dir that ends with /nodetool/package_metadata
    const metadataDir = path.join(root, "nodetool", "package_metadata");
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.writeFileSync(
      path.join(metadataDir, "test.json"),
      JSON.stringify({ name: "test" })
    );

    // Mock readdirSync to throw for the metadata dir (chmod doesn't work as root)
    const origReaddirSync = fs.readdirSync;
    const spy = vi
      .spyOn(fs, "readdirSync")
      .mockImplementation((...args: any[]) => {
        if (String(args[0]) === metadataDir) {
          throw new Error("EACCES: permission denied");
        }
        return origReaddirSync.apply(fs, args as any);
      });

    const result = loadPythonPackageMetadata({ roots: [root] });
    spy.mockRestore();

    expect(
      result.warnings.some((w) => w.includes("Failed to scan metadata dir"))
    ).toBe(true);
  });

  it("warns when directory read fails", () => {
    const root = makeTmpRoot();
    const fakeDirPath = path.join(root, "src");
    fs.mkdirSync(fakeDirPath, { recursive: true });
    const metadataParent = path.join(fakeDirPath, "nodetool");
    fs.mkdirSync(metadataParent, { recursive: true });
    const metadataDir = path.join(metadataParent, "package_metadata");
    fs.mkdirSync(metadataDir);
    fs.writeFileSync(
      path.join(metadataDir, "test.json"),
      JSON.stringify({ name: "test", nodes: [] })
    );

    // Mock readdirSync to throw for the metadata dir (chmod doesn't work as root)
    const origReaddirSync = fs.readdirSync;
    const spy = vi
      .spyOn(fs, "readdirSync")
      .mockImplementation((...args: any[]) => {
        if (String(args[0]) === metadataDir) {
          throw new Error("EACCES: permission denied");
        }
        return origReaddirSync.apply(fs, args as any);
      });

    const result = loadPythonPackageMetadata({ roots: [root] });
    spy.mockRestore();

    // Should have a warning about failed scan
    expect(
      result.warnings.some((w) => w.includes("Failed to scan metadata dir"))
    ).toBe(true);
  });

  it("warns when a non-metadata directory read fails (lines 106-108)", () => {
    const root = makeTmpRoot();
    const subDir = path.join(root, "some-package");
    fs.mkdirSync(subDir, { recursive: true });

    // Mock readdirSync to throw for the subdirectory (chmod doesn't work as root)
    const origReaddirSync = fs.readdirSync;
    const spy = vi
      .spyOn(fs, "readdirSync")
      .mockImplementation((...args: any[]) => {
        if (String(args[0]) === subDir) {
          throw new Error("EACCES: permission denied");
        }
        return origReaddirSync.apply(fs, args as any);
      });

    const result = loadPythonPackageMetadata({ roots: [root] });
    spy.mockRestore();

    expect(
      result.warnings.some((w) => w.includes("Failed to read directory"))
    ).toBe(true);
  });

  it("deduplicates files found via multiple roots", () => {
    const root = makeTmpRoot();
    const metadataDir = path.join(root, "src", "nodetool", "package_metadata");
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.writeFileSync(
      path.join(metadataDir, "pkg.json"),
      JSON.stringify({ name: "pkg", nodes: [] })
    );

    // Pass the same root twice
    const result = loadPythonPackageMetadata({ roots: [root, root] });
    expect(result.files).toHaveLength(1);
  });
});
