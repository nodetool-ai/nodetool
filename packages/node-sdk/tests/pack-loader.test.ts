import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeRegistry } from "../src/registry.js";
import {
  defaultPackSearchPaths,
  discoverPacks,
  loadInstalledPacks,
  readBuiltinPackOverrides,
  resolvePackTrust,
  writeBuiltinPackOverrides,
  writePackTrustConfig,
  PACK_API_VERSION
} from "../src/pack-loader.js";
import { readFileSync } from "node:fs";
import { join as joinPath } from "node:path";

let root: string;
let nodeModules: string;
const savedEnv: Record<string, string | undefined> = {};

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

function nodeSource(nodeType = "acme.Hello"): string {
  return `
class HelloNode {
  static nodeType = "${nodeType}";
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
}

const NODE_SOURCE = nodeSource();

// Force deterministic trust resolution regardless of host env / config file.
const TRUST_ALL = { allowlist: ["*"] };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pack-loader-"));
  nodeModules = join(root, "node_modules");
  mkdirSync(nodeModules, { recursive: true });
  for (const key of [
    "NODETOOL_ENV",
    "NODETOOL_PACKS_ALLOWLIST",
    "NODETOOL_PACKS_CONFIG"
  ]) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  // Point config file at a nonexistent path so the real ~/.config isn't read.
  process.env["NODETOOL_PACKS_CONFIG"] = join(root, "no-such-packs.json");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
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
      searchPaths: [nodeModules],
      trust: TRUST_ALL
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("loaded");
    expect(results[0]!.registered).toEqual(["acme.Hello"]);
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
      NODE_SOURCE.replace(
        "export function register",
        "export function registerAcmeNodes"
      )
    );
    const registry = new NodeRegistry();
    await loadInstalledPacks(registry, {
      searchPaths: [nodeModules],
      trust: TRUST_ALL
    });
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
      searchPaths: [nodeModules],
      trust: TRUST_ALL
    });
    expect(results[0]!.status).toBe("skipped");
    expect(results[0]!.reason).toMatch(/pack API/);
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
      searchPaths: [nodeModules],
      trust: TRUST_ALL
    });
    expect(results).toHaveLength(2);
    expect(results.filter((r) => r.status === "loaded")).toHaveLength(1);
    expect(results.filter((r) => r.status === "error")).toHaveLength(1);
    expect(registry.has("acme.Hello")).toBe(true);
  });
});

describe("trust / allowlist", () => {
  it("skips packs not on the allowlist when allowUnlisted is false", async () => {
    writePack(
      "acme-nodes",
      { name: "acme-nodes", main: "index.js", nodetool: {} },
      NODE_SOURCE
    );
    const registry = new NodeRegistry();
    const results = await loadInstalledPacks(registry, {
      searchPaths: [nodeModules],
      trust: { allowlist: [], allowUnlisted: false }
    });
    expect(results[0]!.status).toBe("skipped");
    expect(results[0]!.reason).toMatch(/allowlist/);
    expect(registry.has("acme.Hello")).toBe(false);
  });

  it("loads an explicitly allowlisted pack even when allowUnlisted is false", async () => {
    writePack(
      "acme-nodes",
      { name: "acme-nodes", main: "index.js", nodetool: {} },
      NODE_SOURCE
    );
    const registry = new NodeRegistry();
    await loadInstalledPacks(registry, {
      searchPaths: [nodeModules],
      trust: { allowlist: ["acme-nodes"], allowUnlisted: false }
    });
    expect(registry.has("acme.Hello")).toBe(true);
  });

  it("defaults to allowUnlisted=false in production", () => {
    process.env["NODETOOL_ENV"] = "production";
    expect(resolvePackTrust().allowUnlisted).toBe(false);
  });

  it("defaults to allowUnlisted=true outside production", () => {
    delete process.env["NODETOOL_ENV"];
    expect(resolvePackTrust().allowUnlisted).toBe(true);
  });

  it("reads the allowlist from NODETOOL_PACKS_ALLOWLIST", () => {
    process.env["NODETOOL_PACKS_ALLOWLIST"] = "@acme/a, @acme/b";
    expect(resolvePackTrust().allowlist).toEqual(["@acme/a", "@acme/b"]);
  });
});

describe("registry guards", () => {
  it("does not let a pack shadow an existing node type", async () => {
    writePack(
      "acme-nodes",
      { name: "acme-nodes", main: "index.js", nodetool: {} },
      NODE_SOURCE
    );
    const registry = new NodeRegistry();
    // Pre-register a node with the same type (simulating a built-in).
    class Builtin {
      static nodeType = "acme.Hello";
      static title = "Builtin";
      static description = "";
      static metadataOutputTypes = { output: "str" };
      static getDeclaredProperties() {
        return [];
      }
      static getDeclaredOutputs() {
        return {};
      }
      static toDescriptor() {
        return { outputs: {} };
      }
      async process() {
        return {};
      }
    }
    registry.register(Builtin as never);

    const results = await loadInstalledPacks(registry, {
      searchPaths: [nodeModules],
      trust: TRUST_ALL
    });
    expect(results[0]!.status).toBe("loaded");
    expect(results[0]!.registered).toEqual([]);
    expect(results[0]!.skippedNodes).toEqual([
      { nodeType: "acme.Hello", reason: "collision" }
    ]);
    // Built-in class is preserved.
    expect(registry.getClass("acme.Hello")).toBe(Builtin);
  });

  it("blocks registration under a reserved namespace", async () => {
    writePack(
      "evil-nodes",
      { name: "evil-nodes", main: "index.js", nodetool: {} },
      nodeSource("nodetool.text.Override")
    );
    const registry = new NodeRegistry();
    const results = await loadInstalledPacks(registry, {
      searchPaths: [nodeModules],
      trust: TRUST_ALL
    });
    expect(results[0]!.status).toBe("loaded");
    expect(results[0]!.registered).toEqual([]);
    expect(results[0]!.skippedNodes).toEqual([
      { nodeType: "nodetool.text.Override", reason: "reserved-namespace" }
    ]);
    expect(registry.has("nodetool.text.Override")).toBe(false);
  });
});

describe("writePackTrustConfig", () => {
  it("round-trips via resolvePackTrust", () => {
    const path = joinPath(root, "packs.json");
    process.env["NODETOOL_PACKS_CONFIG"] = path;
    writePackTrustConfig(
      { allowlist: ["@acme/a", "@acme/b"], allowUnlisted: false },
      path
    );
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      allow: string[];
      allowUnlisted: boolean;
    };
    expect(parsed.allow).toEqual(["@acme/a", "@acme/b"]);
    expect(parsed.allowUnlisted).toBe(false);
    const resolved = resolvePackTrust();
    expect(resolved.allowlist).toEqual(["@acme/a", "@acme/b"]);
    expect(resolved.allowUnlisted).toBe(false);
  });

  it("creates parent directories as needed", () => {
    const path = joinPath(root, "nested", "dir", "packs.json");
    writePackTrustConfig({ allowlist: [], allowUnlisted: true }, path);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      allow: [],
      allowUnlisted: true
    });
  });

  it("preserves built-in pack overrides already in the file", () => {
    const path = joinPath(root, "packs.json");
    process.env["NODETOOL_PACKS_CONFIG"] = path;
    writeFileSync(
      path,
      JSON.stringify({ enabledBuiltins: ["kie"], disabledBuiltins: ["fal"] })
    );
    writePackTrustConfig({ allowlist: ["@acme/a"], allowUnlisted: false }, path);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      enabledBuiltins: ["kie"],
      disabledBuiltins: ["fal"],
      allow: ["@acme/a"],
      allowUnlisted: false
    });
  });
});

describe("built-in pack overrides", () => {
  it("defaults to an empty map", () => {
    expect(readBuiltinPackOverrides()).toEqual({});
  });

  it("round-trips overrides in both directions, sorted", () => {
    const path = joinPath(root, "packs.json");
    process.env["NODETOOL_PACKS_CONFIG"] = path;
    writeBuiltinPackOverrides(
      { kie: true, fal: false, elevenlabs: true },
      path
    );
    expect(readBuiltinPackOverrides()).toEqual({
      kie: true,
      elevenlabs: true,
      fal: false
    });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      enabledBuiltins: ["elevenlabs", "kie"],
      disabledBuiltins: ["fal"]
    });
  });

  it("preserves trust fields already in the file", () => {
    const path = joinPath(root, "packs.json");
    process.env["NODETOOL_PACKS_CONFIG"] = path;
    writePackTrustConfig({ allowlist: ["@acme/a"], allowUnlisted: true }, path);
    writeBuiltinPackOverrides({ kie: true }, path);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      allow: ["@acme/a"],
      allowUnlisted: true,
      enabledBuiltins: ["kie"],
      disabledBuiltins: []
    });
    const resolved = resolvePackTrust();
    expect(resolved.allowlist).toEqual(["@acme/a"]);
    expect(resolved.allowUnlisted).toBe(true);
  });

  it("ignores non-string entries in the config file", () => {
    const path = joinPath(root, "packs.json");
    process.env["NODETOOL_PACKS_CONFIG"] = path;
    writeFileSync(
      path,
      JSON.stringify({ enabledBuiltins: ["kie", 3], disabledBuiltins: [null, "fal"] })
    );
    expect(readBuiltinPackOverrides()).toEqual({ kie: true, fal: false });
  });
});

describe("defaultPackSearchPaths", () => {
  it("picks up NODETOOL_OPTIONAL_NODE_MODULES as an extra root", () => {
    process.env["NODETOOL_OPTIONAL_NODE_MODULES"] = nodeModules;
    try {
      expect(defaultPackSearchPaths()).toContain(nodeModules);
    } finally {
      delete process.env["NODETOOL_OPTIONAL_NODE_MODULES"];
    }
  });

  it("dedupes when an env path overlaps the cwd walk", () => {
    process.env["NODETOOL_OPTIONAL_NODE_MODULES"] = nodeModules;
    try {
      const all = defaultPackSearchPaths();
      const occurrences = all.filter((p) => p === nodeModules).length;
      expect(occurrences).toBe(1);
    } finally {
      delete process.env["NODETOOL_OPTIONAL_NODE_MODULES"];
    }
  });
});
