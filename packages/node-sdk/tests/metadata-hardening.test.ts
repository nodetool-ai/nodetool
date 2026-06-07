// @ts-nocheck
/**
 * Mutation-hardening tests for metadata.ts: type normalization, the
 * NaN/Infinity sanitisation, per-field type coercion in parseMetadataFiles,
 * node_type validation + duplicate detection, and sourceFolder inference.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPythonPackageMetadata,
  normalizeTypeMetadata
} from "../src/metadata.js";

const tmpDirs: string[] = [];
function metaRoot(name: string, json: unknown): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-meta-h-"));
  tmpDirs.push(root);
  const dir = path.join(root, "src", "nodetool", "package_metadata");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${name}.json`),
    typeof json === "string" ? json : JSON.stringify(json)
  );
  return root;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("normalizeTypeMetadata", () => {
  it("recursively fills missing type_args with empty arrays", () => {
    expect(normalizeTypeMetadata({ type: "list" })).toEqual({
      type: "list",
      type_args: []
    });
  });

  it("normalizes nested type args and preserves other fields", () => {
    const result = normalizeTypeMetadata({
      type: "dict",
      optional: true,
      type_args: [{ type: "str" }, { type: "list", type_args: [{ type: "int" }] }]
    });
    expect(result).toEqual({
      type: "dict",
      optional: true,
      type_args: [
        { type: "str", type_args: [] },
        { type: "list", type_args: [{ type: "int", type_args: [] }] }
      ]
    });
  });
});

describe("parseMetadataFiles field handling", () => {
  it("sanitises NaN/Infinity to null so JSON.parse succeeds", () => {
    const root = metaRoot(
      "pkg",
      '{"name":"p","nodes":[{"node_type":"p.N","properties":[{"name":"x","type":{"type":"float","type_args":[]},"min":NaN,"max":Infinity}],"outputs":[]}]}'
    );
    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(result.warnings).toEqual([]);
    const node = result.nodesByType.get("p.N");
    expect(node?.properties[0].min).toBeNull();
    expect(node?.properties[0].max).toBeNull();
  });

  it("falls back name to the filename and drops mistyped fields", () => {
    const root = metaRoot("from_filename", {
      version: 123,
      authors: "not-an-array",
      nodes: "not-an-array"
    });
    const result = loadPythonPackageMetadata({ roots: [root] });
    const pkg = result.packages[0];
    expect(pkg.name).toBe("from_filename");
    expect(pkg.version).toBeUndefined();
    expect(pkg.authors).toBeUndefined();
    expect(pkg.nodes).toBeUndefined();
  });

  it("infers sourceFolder as the dir above /nodetool/package_metadata", () => {
    const root = metaRoot("pkg", { name: "pkg", nodes: [] });
    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(result.packages[0].sourceFolder).toBe(path.join(root, "src"));
  });

  it("skips invalid node entries but keeps valid ones", () => {
    const root = metaRoot("pkg", {
      name: "pkg",
      nodes: [
        null,
        "string-node",
        { description: "no node_type here" },
        {
          node_type: "pkg.Good",
          properties: [],
          outputs: []
        }
      ]
    });
    const result = loadPythonPackageMetadata({ roots: [root] });
    expect([...result.nodesByType.keys()]).toEqual(["pkg.Good"]);
  });

  it("normalizes node property/output type_args and reports duplicates", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-meta-dup-"));
    tmpDirs.push(dir);
    const mdir = path.join(dir, "nodetool", "package_metadata");
    fs.mkdirSync(mdir, { recursive: true });
    const nodeJson = (extra: string) =>
      `{"node_type":"dup.N","properties":[{"name":"p","type":{"type":"list"}}],"outputs":[{"name":"o","type":{"type":"str"}}]}${extra}`;
    fs.writeFileSync(
      path.join(mdir, "a.json"),
      `{"name":"a","nodes":[${nodeJson("")}]}`
    );
    fs.writeFileSync(
      path.join(mdir, "b.json"),
      `{"name":"b","nodes":[${nodeJson("")}]}`
    );
    const result = loadPythonPackageMetadata({ roots: [dir] });
    expect(result.duplicates).toEqual(["dup.N"]);
    const node = result.nodesByType.get("dup.N");
    expect(node?.properties[0].type.type_args).toEqual([]);
    expect(node?.outputs[0].type.type_args).toEqual([]);
  });
});

describe("metadata cache", () => {
  it("serves a second unchanged load from cache and re-parses on change", () => {
    const root = metaRoot("pkg", {
      name: "pkg",
      nodes: [{ node_type: "p.N", properties: [], outputs: [] }]
    });
    const r1 = loadPythonPackageMetadata({ roots: [root] });
    expect(r1.nodesByType.has("p.N")).toBe(true);
    const metaFile = r1.files[0];

    // Second load with no changes: the metadata JSON is NOT re-read (cache hit).
    const spy = vi.spyOn(fs, "readFileSync");
    const r2 = loadPythonPackageMetadata({ roots: [root] });
    expect(r2.nodesByType.has("p.N")).toBe(true);
    const reReadMeta = spy.mock.calls.some((c) => String(c[0]) === metaFile);
    expect(reReadMeta).toBe(false);
    spy.mockRestore();

    // Mutating the file invalidates the fingerprint → cache miss → re-parse.
    fs.writeFileSync(
      metaFile,
      JSON.stringify({
        name: "pkg",
        nodes: [{ node_type: "p.M", properties: [], outputs: [] }]
      })
    );
    const r3 = loadPythonPackageMetadata({ roots: [root] });
    expect(r3.nodesByType.has("p.M")).toBe(true);
    expect(r3.nodesByType.has("p.N")).toBe(false);
  });
});

describe("directory walking", () => {
  it("discovers a package_metadata directory nested under the root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-walk-"));
    tmpDirs.push(root);
    const nested = path.join(root, "pkgs", "thing", "nodetool", "package_metadata");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, "thing.json"),
      JSON.stringify({ name: "thing", nodes: [] })
    );
    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(result.packages.map((p) => p.name)).toContain("thing");
  });

  it("stops descending once maxDepth is exceeded", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-depth-"));
    tmpDirs.push(root);
    const deep = path.join(root, "a", "b", "c", "nodetool", "package_metadata");
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, "x.json"), JSON.stringify({ name: "x" }));
    expect(loadPythonPackageMetadata({ roots: [root], maxDepth: 1 }).packages).toEqual([]);
    expect(
      loadPythonPackageMetadata({ roots: [root], maxDepth: 8 }).packages
    ).toHaveLength(1);
  });

  it("ignores non-json files in a package_metadata directory", () => {
    const root = metaRoot("pkg", { name: "pkg", nodes: [] });
    const dir = path.join(root, "src", "nodetool", "package_metadata");
    fs.writeFileSync(path.join(dir, "README.md"), "not metadata");
    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(result.files.every((f) => f.endsWith(".json"))).toBe(true);
  });
});

describe("loadPythonPackageMetadata roots", () => {
  it("warns and yields nothing for a non-existent root", () => {
    const result = loadPythonPackageMetadata({
      roots: ["/no/such/dir/zzz"]
    });
    expect(result.warnings.some((w) => w.includes("does not exist"))).toBe(true);
    expect(result.files).toEqual([]);
  });

  it("merges walk warnings ahead of parse results", () => {
    const root = metaRoot("pkg", { name: "pkg", nodes: [] });
    const result = loadPythonPackageMetadata({
      roots: [root, "/no/such/dir/yyy"]
    });
    expect(result.warnings[0]).toContain("does not exist");
    expect(result.packages).toHaveLength(1);
  });
});
