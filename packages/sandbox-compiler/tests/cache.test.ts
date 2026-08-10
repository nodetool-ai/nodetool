/**
 * The cache invalidates on content, never on version alone.
 *
 * That is the whole point of the key: a linked pack, a transitive update, and
 * an esbuild upgrade all change the bundle while `name@version` stays put.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CompiledModuleCache, computeCacheKey } from "../src/cache.js";
import { compileNpmModule } from "../src/compile.js";
import { cleanup, materializePack } from "./fixtures.js";

const workspace = mkdtempSync(join(tmpdir(), "nodetool-cache-test-"));
const cacheRoot = join(workspace, "cache");

afterAll(() => cleanup(workspace));

const baseInput = {
  npmName: "fixture-clean",
  esbuildVersion: "0.28.1",
  inputDigests: [{ path: "node_modules/fixture-clean/index.js", sha256: "abc123" }]
};

describe("computeCacheKey", () => {
  it("is stable for identical input", () => {
    expect(computeCacheKey(baseInput)).toBe(computeCacheKey(baseInput));
  });

  it("ignores the order the inputs arrive in", () => {
    const two = { ...baseInput, inputDigests: [{ path: "b", sha256: "bbb" }, { path: "a", sha256: "aaa" }] };
    const reversed = { ...baseInput, inputDigests: [{ path: "a", sha256: "aaa" }, { path: "b", sha256: "bbb" }] };
    expect(computeCacheKey(two)).toBe(computeCacheKey(reversed));
  });

  it("changes when one input's content changes", () => {
    const moved = { ...baseInput, inputDigests: [{ path: "node_modules/fixture-clean/index.js", sha256: "def456" }] };
    expect(computeCacheKey(moved)).not.toBe(computeCacheKey(baseInput));
  });

  it("changes when the esbuild version changes", () => {
    expect(computeCacheKey({ ...baseInput, esbuildVersion: "0.29.0" })).not.toBe(
      computeCacheKey(baseInput)
    );
  });

  it("changes when the dependency name changes", () => {
    expect(computeCacheKey({ ...baseInput, npmName: "other" })).not.toBe(
      computeCacheKey(baseInput)
    );
  });
});

describe("CompiledModuleCache", () => {
  it("round-trips an entry and refuses a key that is not a digest", () => {
    const cache = new CompiledModuleCache(join(cacheRoot, "roundtrip"));
    const key = computeCacheKey(baseInput);
    cache.write({
      key,
      npmName: "fixture-clean",
      compilerVersion: "1",
      esbuildVersion: "0.28.1",
      optionsDigest: "a".repeat(64),
      inputsDigest: "b".repeat(64),
      source: "export const x = 1;",
      bytes: 19,
      inputDigests: [],
      scanWarnings: [],
      probeOk: true,
      probeExports: ["x"]
    });
    expect(cache.read(key)?.source).toBe("export const x = 1;");
    expect(cache.read("../../etc/passwd")).toBeUndefined();
    expect(cache.read("not-a-digest")).toBeUndefined();
  });

  it("discards an entry whose compiler version moved", () => {
    const root = join(cacheRoot, "stale");
    const cache = new CompiledModuleCache(root);
    const key = computeCacheKey(baseInput);
    cache.write({
      key,
      npmName: "fixture-clean",
      compilerVersion: "0",
      esbuildVersion: "0.28.1",
      optionsDigest: "a".repeat(64),
      inputsDigest: "b".repeat(64),
      source: "export const x = 1;",
      bytes: 19,
      inputDigests: [],
      scanWarnings: [],
      probeOk: true,
      probeExports: []
    });
    expect(cache.read(key)).toBeUndefined();
    expect(readdirSync(root)).toHaveLength(0);
  });

  it("leaves no temp file behind after a write", () => {
    const root = join(cacheRoot, "atomic");
    const cache = new CompiledModuleCache(root);
    const key = computeCacheKey(baseInput);
    for (let i = 0; i < 5; i += 1) {
      cache.write({
        key,
        npmName: "fixture-clean",
        compilerVersion: "1",
        esbuildVersion: "0.28.1",
        optionsDigest: "a".repeat(64),
        inputsDigest: "b".repeat(64),
        source: `export const x = ${i};`,
        bytes: 19,
        inputDigests: [],
        scanWarnings: [],
        probeOk: true,
        probeExports: []
      });
    }
    expect(readdirSync(root).filter((name) => name.endsWith(".tmp"))).toHaveLength(0);
    expect(cache.read(key)?.source).toBe("export const x = 4;");
  });

  it("writes whole entries under concurrent writers", async () => {
    const root = join(cacheRoot, "concurrent");
    const key = computeCacheKey(baseInput);
    const writers = Array.from({ length: 12 }, (_, i) =>
      Promise.resolve().then(() => {
        new CompiledModuleCache(root).write({
          key,
          npmName: "fixture-clean",
          compilerVersion: "1",
          esbuildVersion: "0.28.1",
          optionsDigest: "a".repeat(64),
          inputsDigest: "b".repeat(64),
          source: `export const x = ${"y".repeat(i * 500)};`,
          bytes: 19,
          inputDigests: [],
          scanWarnings: [],
          probeOk: true,
          probeExports: []
        });
      })
    );
    await Promise.all(writers);
    const entry = new CompiledModuleCache(root).read(key);
    expect(entry).toBeDefined();
    expect(readdirSync(root).filter((name) => name.endsWith(".tmp"))).toHaveLength(0);
  });
});

describe("compileNpmModule caching", () => {
  it("hits on identical input and misses after a source change", async () => {
    const packDir = materializePack("clean", workspace);
    const cache = new CompiledModuleCache(join(cacheRoot, "pipeline"));
    const first = await compileNpmModule({ packDir, npmName: "fixture-clean", cache });
    expect(first.cached).toBe(false);

    const second = await compileNpmModule({ packDir, npmName: "fixture-clean", cache });
    expect(second.cached).toBe(true);
    expect(second.key).toBe(first.key);

    const dependency = join(packDir, "node_modules", "fixture-clean", "index.js");
    writeFileSync(dependency, `${readFileSync(dependency, "utf8")}\nexport const extra = 1;\n`);
    const third = await compileNpmModule({ packDir, npmName: "fixture-clean", cache });
    expect(third.cached).toBe(false);
    expect(third.key).not.toBe(first.key);
  });

  it("reads back synchronously through the pack pointer, and misses once inputs move", async () => {
    const packDir = materializePack("clean", join(workspace, "pointer"));
    const cache = new CompiledModuleCache(join(cacheRoot, "pointer"));
    expect(cache.readForPack(packDir, "fixture-clean")).toBeUndefined();

    await compileNpmModule({ packDir, npmName: "fixture-clean", cache });
    expect(cache.readForPack(packDir, "fixture-clean")?.probeOk).toBe(true);

    const dependency = join(packDir, "node_modules", "fixture-clean", "index.js");
    writeFileSync(dependency, `${readFileSync(dependency, "utf8")}\nexport const later = 2;\n`);
    expect(cache.readForPack(packDir, "fixture-clean")).toBeUndefined();
  });

  it("compiles again when the caller opts out of the cache", async () => {
    const packDir = materializePack("clean", join(workspace, "nocache"));
    const cache = new CompiledModuleCache(join(cacheRoot, "nocache"));
    await compileNpmModule({ packDir, npmName: "fixture-clean", cache });
    const forced = await compileNpmModule({ packDir, npmName: "fixture-clean", noCache: true });
    expect(forced.cached).toBe(false);
  });
});
