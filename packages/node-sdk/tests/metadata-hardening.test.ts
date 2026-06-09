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
      description: 456,
      repo_id: 789,
      authors: "not-an-array",
      nodes: "not-an-array"
    });
    const result = loadPythonPackageMetadata({ roots: [root] });
    const pkg = result.packages[0];
    expect(pkg.name).toBe("from_filename");
    expect(pkg.version).toBeUndefined();
    expect(pkg.description).toBeUndefined();
    expect(pkg.repo_id).toBeUndefined();
    expect(pkg.authors).toBeUndefined();
    expect(pkg.nodes).toBeUndefined();
  });

  it.each([
    ["null", "null"],
    ["a number", "42"]
  ])("warns and skips a metadata file that is %s", (_label, body) => {
    const root = metaRoot("weird", body);
    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(result.warnings.some((w) => w.includes("Skipping non-object"))).toBe(true);
    expect(result.packages).toEqual([]);
  });

  it("normalizes a node that omits its properties/outputs arrays", () => {
    const root = metaRoot("pkg", {
      name: "pkg",
      nodes: [{ node_type: "p.Sparse" }]
    });
    const node = loadPythonPackageMetadata({ roots: [root] }).nodesByType.get("p.Sparse");
    expect(node?.properties).toEqual([]);
    expect(node?.outputs).toEqual([]);
  });

  it("reports no duplicates for distinct node types", () => {
    const root = metaRoot("pkg", {
      name: "pkg",
      nodes: [
        { node_type: "p.A", properties: [], outputs: [] },
        { node_type: "p.B", properties: [], outputs: [] }
      ]
    });
    expect(loadPythonPackageMetadata({ roots: [root] }).duplicates).toEqual([]);
  });

  it("returns duplicates sorted", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-dups-"));
    tmpDirs.push(dir);
    const mdir = path.join(dir, "nodetool", "package_metadata");
    fs.mkdirSync(mdir, { recursive: true });
    fs.writeFileSync(
      path.join(mdir, "a.json"),
      JSON.stringify({ name: "a", nodes: [{ node_type: "z.Dup", properties: [], outputs: [] }, { node_type: "a.Dup", properties: [], outputs: [] }] })
    );
    fs.writeFileSync(
      path.join(mdir, "b.json"),
      JSON.stringify({ name: "b", nodes: [{ node_type: "z.Dup", properties: [], outputs: [] }, { node_type: "a.Dup", properties: [], outputs: [] }] })
    );
    expect(loadPythonPackageMetadata({ roots: [dir] }).duplicates).toEqual(["a.Dup", "z.Dup"]);
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

describe("full package parsing", () => {
  it("maps every package field with the correct types", () => {
    const root = metaRoot("full", {
      name: "full-pkg",
      description: "a package",
      version: "1.2.3",
      authors: ["Ada", "Grace"],
      repo_id: "owner/full",
      nodes: [{ node_type: "full.N", properties: [], outputs: [] }],
      examples: [{ id: "ex" }],
      assets: [{ id: "as" }]
    });
    const pkg = loadPythonPackageMetadata({ roots: [root] }).packages[0];
    expect(pkg).toEqual({
      name: "full-pkg",
      description: "a package",
      version: "1.2.3",
      authors: ["Ada", "Grace"],
      repo_id: "owner/full",
      nodes: [{ node_type: "full.N", properties: [], outputs: [] }],
      examples: [{ id: "ex" }],
      assets: [{ id: "as" }],
      sourceFolder: path.join(root, "src")
    });
  });

  it("sorts discovered files and reported duplicates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-sort-"));
    tmpDirs.push(root);
    const dir = path.join(root, "nodetool", "package_metadata");
    fs.mkdirSync(dir, { recursive: true });
    for (const name of ["z", "a", "m"]) {
      fs.writeFileSync(
        path.join(dir, `${name}.json`),
        JSON.stringify({ name, nodes: [] })
      );
    }
    const files = loadPythonPackageMetadata({ roots: [root] }).files;
    expect(files).toEqual([...files].sort());
    expect(files.map((f) => path.basename(f))).toEqual(["a.json", "m.json", "z.json"]);
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

  it("includes a metadata dir whose parent sits at exactly maxDepth (boundary)", () => {
    // root(0)/d1(1)/nodetool(2): walk recurses to nodetool at depth 2 and scans
    // its package_metadata when depth (2) > maxDepth (2) is false — but it would
    // be excluded if the guard were depth >= maxDepth.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-bound-"));
    tmpDirs.push(root);
    const dir = path.join(root, "d1", "nodetool", "package_metadata");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "x.json"), JSON.stringify({ name: "x", nodes: [] }));
    expect(loadPythonPackageMetadata({ roots: [root], maxDepth: 2 }).packages).toHaveLength(1);
    expect(loadPythonPackageMetadata({ roots: [root], maxDepth: 1 }).packages).toEqual([]);
  });

  it("scans a root that is itself a package_metadata directory", () => {
    const root = metaRoot("direct", { name: "direct", nodes: [] });
    const pmDir = path.join(root, "src", "nodetool", "package_metadata");
    fs.writeFileSync(path.join(pmDir, "ignore.txt"), "not json");
    const result = loadPythonPackageMetadata({ roots: [pmDir] });
    expect(result.packages.map((p) => p.name)).toContain("direct");
    // the non-json file must not be picked up.
    expect(result.files.every((f) => f.endsWith(".json"))).toBe(true);
  });

  it("scans a non-src package_metadata root (just /nodetool/package_metadata)", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-nonsrc-"));
    tmpDirs.push(base);
    const pmDir = path.join(base, "nodetool", "package_metadata");
    fs.mkdirSync(pmDir, { recursive: true });
    fs.writeFileSync(path.join(pmDir, "p.json"), JSON.stringify({ name: "nonsrc", nodes: [] }));
    const result = loadPythonPackageMetadata({ roots: [pmDir] });
    expect(result.packages.map((p) => p.name)).toContain("nonsrc");
  });

  it("returns discovered files sorted across roots", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-fsort-"));
    tmpDirs.push(base);
    // Process z_root before a_root, but the result must be path-sorted.
    const roots: string[] = [];
    for (const name of ["z_root", "a_root"]) {
      const pmDir = path.join(base, name, "nodetool", "package_metadata");
      fs.mkdirSync(pmDir, { recursive: true });
      fs.writeFileSync(path.join(pmDir, "x.json"), JSON.stringify({ name, nodes: [] }));
      roots.push(path.join(base, name));
    }
    const files = loadPythonPackageMetadata({ roots }).files;
    expect(files).toEqual([...files].sort());
    expect(files[0]).toContain(`${path.sep}a_root${path.sep}`);
  });

  it("does not recurse into regular files in a non-metadata directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-file-"));
    tmpDirs.push(root);
    fs.writeFileSync(path.join(root, "stray.txt"), "hello");
    const result = loadPythonPackageMetadata({ roots: [root] });
    expect(result.warnings.some((w) => w.includes("Failed to read directory"))).toBe(false);
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
