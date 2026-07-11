import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  loadExampleGraph,
  resolveExampleJsonPath,
  defaultExamplePackageName,
  deriveExampleAssetsDir
} from "../src/example-workflows.js";

function mkExamplesDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt-ex-cov-"));
  const dir = path.join(root, "examples", "nodetool-base");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, name: string, data: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data), "utf8");
}

describe("resolveExampleJsonPath — edge cases", () => {
  it("returns null for an empty / whitespace ref", () => {
    const dir = mkExamplesDir();
    expect(resolveExampleJsonPath(dir, "")).toBeNull();
    expect(resolveExampleJsonPath(dir, "   ")).toBeNull();
  });

  it("resolves a ref that already ends in .json by basename", () => {
    const dir = mkExamplesDir();
    write(dir, "demo.json", { name: "Demo" });
    // A pathful .json ref is reduced to its basename.
    const resolved = resolveExampleJsonPath(dir, "sub/dir/demo.json");
    expect(resolved).toBe(path.join(dir, "demo.json"));
  });

  it("resolves by the id field when name does not match", () => {
    const dir = mkExamplesDir();
    write(dir, "byid.json", { id: "special-id", name: "Unrelated" });
    const resolved = resolveExampleJsonPath(dir, "special-id");
    expect(resolved).toBe(path.join(dir, "byid.json"));
  });

  it("skips malformed JSON files while scanning for a name match", () => {
    const dir = mkExamplesDir();
    fs.writeFileSync(path.join(dir, "broken.json"), "{ not json", "utf8");
    write(dir, "good.json", { name: "Findable" });
    const resolved = resolveExampleJsonPath(dir, "Findable");
    expect(resolved).toBe(path.join(dir, "good.json"));
  });

  it("returns null when the examples directory cannot be read", () => {
    const missing = path.join(os.tmpdir(), "nt-does-not-exist-" + Date.now());
    expect(resolveExampleJsonPath(missing, "anything")).toBeNull();
  });

  it("returns null when no file matches by name or id", () => {
    const dir = mkExamplesDir();
    write(dir, "a.json", { name: "A", id: "id-a" });
    expect(resolveExampleJsonPath(dir, "nonexistent")).toBeNull();
  });
});

describe("loadExampleGraph — branches", () => {
  it("returns null when packageName is empty and dir lookup fails", () => {
    const dir = mkExamplesDir();
    expect(loadExampleGraph("", "missing", { examplesDir: dir })).toBeNull();
  });

  it("returns null when the matched example file is malformed JSON", () => {
    const dir = mkExamplesDir();
    // File name matches the ref directly, but its contents don't parse.
    fs.writeFileSync(path.join(dir, "bad.json"), "{ oops", "utf8");
    expect(loadExampleGraph("", "bad", { examplesDir: dir })).toBeNull();
  });

  it("ignores a configured examplesDir that does not exist", () => {
    expect(
      loadExampleGraph("", "x", {
        examplesDir: path.join(os.tmpdir(), "nope-" + Date.now())
      })
    ).toBeNull();
  });
});

describe("deriveExampleAssetsDir — branches", () => {
  it("prefers the derived sibling assets dir when it has thumbnails", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt-assets-"));
    const examplesDir = path.join(root, "examples", "nodetool-base");
    const derived = path.join(root, "assets", "nodetool-base");
    fs.mkdirSync(examplesDir, { recursive: true });
    fs.mkdirSync(derived, { recursive: true });
    fs.writeFileSync(path.join(derived, "thumb.png"), "png", "utf8");

    expect(deriveExampleAssetsDir(examplesDir, null)).toBe(derived);
  });

  it("returns the derived path when neither derived nor fallback has thumbnails", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt-assets-none-"));
    const examplesDir = path.join(root, "examples", "nodetool-base");
    const derived = path.join(root, "assets", "nodetool-base");
    fs.mkdirSync(examplesDir, { recursive: true });
    // derived dir exists but has no image files
    fs.mkdirSync(derived, { recursive: true });
    fs.writeFileSync(path.join(derived, "notes.txt"), "x", "utf8");

    expect(deriveExampleAssetsDir(examplesDir, undefined)).toBe(derived);
  });

  it("ignores a fallback dir that does not exist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt-assets-fb-"));
    const examplesDir = path.join(root, "examples", "nodetool-base");
    const derived = path.join(root, "assets", "nodetool-base");
    fs.mkdirSync(examplesDir, { recursive: true });
    expect(
      deriveExampleAssetsDir(examplesDir, path.join(root, "ghost"))
    ).toBe(derived);
  });
});

describe("defaultExamplePackageName", () => {
  it("returns null when no examplesDir is configured", () => {
    expect(defaultExamplePackageName({})).toBeNull();
  });

  it("returns null when the configured examplesDir does not exist", () => {
    expect(
      defaultExamplePackageName({
        examplesDir: path.join(os.tmpdir(), "ghost-" + Date.now())
      })
    ).toBeNull();
  });
});
