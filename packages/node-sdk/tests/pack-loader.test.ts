import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeRegistry } from "../src/registry.js";
import {
  discoverPacks,
  loadInstalledPacks,
  PACK_API_VERSION
} from "../src/pack-loader.js";

let root: string;
let nodeModules: string;

function writePack(
  dirName: string,
  pkg: Record<string, unknown>,
  entrySource: string,
  entryFile = "index.js"
): void {
  const pkgDir = join(nodeModules, dirName);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify(pkg));
  writeFileSync(join(pkgDir, entryFile), entrySource);
}

const NODE_SOURCE = `
class HelloNode {
  static nodeType = "acme.Hello";
  static title = "Hello";
  static description = "";
  static metadataOutputTypes = { output: "str" };
  static getDeclaredProperties() { return []; }
  static getDeclaredOutputs() { return {}; }
  static toDescriptor() { return { outputs: {} }; }
  async process() { return {}; }
}
export function register(registry) {
  registry.register(HelloNode);
}
`;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pack-loader-"));
  nodeModules = join(root, "node_modules");
  mkdirSync(nodeModules, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("discoverPacks", () => {
  it("finds packages with a nodetool field", () => {
    writePack(
      "acme-nodes",
      {
        name: "acme-nodes",
        version: "1.0.0",
        main: "index.js",
        nodetool: { apiVersion: 1 }
      },
      NODE_SOURCE
    );
    const packs = discoverPacks([nodeModules]);
    expect(packs).toHaveLength(1);
    expect(packs[0]!.name).toBe("acme-nodes");
    expect(packs[0]!.registerExport).toBe("register");
  });

  it("ignores packages without a nodetool field", () => {
    writePack("plain", { name: "plain", main: "index.js" }, NODE_SOURCE);
    expect(discoverPacks([nodeModules])).toHaveLength(0);
  });

  it("discovers scoped packages", () => {
    writePack(
      join("@acme", "nodes"),
      { name: "@acme/nodes", main: "index.js", nodetool: {} },
      NODE_SOURCE
    );
    const packs = discoverPacks([nodeModules]);
    expect(packs.map((p) => p.name)).toEqual(["@acme/nodes"]);
  });
});

describe("loadInstalledPacks", () => {
  it("registers nodes from a discovered pack", async () => {
    writePack(
      "acme-nodes",
      { name: "acme-nodes", main: "index.js", nodetool: { apiVersion: 1 } },
      NODE_SOURCE
    );
    const registry = new NodeRegistry();
    const results = await loadInstalledPacks(registry, {
      searchPaths: [nodeModules]
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.ok).toBe(true);
    expect(registry.has("acme.Hello")).toBe(true);
  });

  it("calls a custom register export named in the manifest", async () => {
    writePack(
      "acme-nodes",
      {
        name: "acme-nodes",
        main: "index.js",
        nodetool: { register: "registerAcmeNodes" }
      },
      NODE_SOURCE.replace("export function register", "export function registerAcmeNodes")
    );
    const registry = new NodeRegistry();
    await loadInstalledPacks(registry, { searchPaths: [nodeModules] });
    expect(registry.has("acme.Hello")).toBe(true);
  });

  it("skips packs requiring a newer API version", async () => {
    writePack(
      "future-nodes",
      {
        name: "future-nodes",
        main: "index.js",
        nodetool: { apiVersion: PACK_API_VERSION + 1 }
      },
      NODE_SOURCE
    );
    const registry = new NodeRegistry();
    const results = await loadInstalledPacks(registry, {
      searchPaths: [nodeModules]
    });
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.error?.message).toMatch(/pack API/);
    expect(registry.has("acme.Hello")).toBe(false);
  });

  it("isolates failures so one bad pack does not block others", async () => {
    writePack(
      "broken",
      { name: "broken", main: "index.js", nodetool: {} },
      "export function register() { throw new Error('boom'); }"
    );
    writePack(
      "good",
      { name: "good", main: "index.js", nodetool: {} },
      NODE_SOURCE
    );
    const registry = new NodeRegistry();
    const results = await loadInstalledPacks(registry, {
      searchPaths: [nodeModules]
    });
    expect(results).toHaveLength(2);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(registry.has("acme.Hello")).toBe(true);
  });
});
