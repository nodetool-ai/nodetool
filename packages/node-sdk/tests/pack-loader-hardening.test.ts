// @ts-nocheck
/**
 * Mutation-hardening tests for pack-loader.ts: trust resolution precedence,
 * the guarded-registry reserved-namespace / collision / api-version gates,
 * env-driven search paths, and entry/register-export resolution.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeRegistry } from "../src/registry.js";
import {
  defaultPackSearchPaths,
  loadInstalledPacks,
  resolvePackTrust,
  writePackTrustConfig,
  PACK_API_VERSION
} from "../src/pack-loader.js";

let root: string;
let nodeModules: string;
const ENV_KEYS = [
  "NODETOOL_PACKS_ALLOWLIST",
  "NODETOOL_PACKS_CONFIG",
  "NODETOOL_ENV",
  "NODETOOL_OPTIONAL_NODE_MODULES",
  "NODETOOL_PACK_SEARCH_PATHS"
];
const saved: Record<string, string | undefined> = {};

function writePack(dirName: string, pkg: Record<string, unknown>, entry: string, entryFile = "index.js") {
  const dir = join(nodeModules, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  writeFileSync(join(dir, entryFile), entry);
}

const nodeSrc = (type: string) => `
class N {
  static nodeType = "${type}";
  static title = "N";
  static description = "";
  static getDeclaredProperties() { return []; }
  static getDeclaredOutputs() { return {}; }
  static toDescriptor() { return { outputs: {} }; }
  async process() { return {}; }
}
export function register(r) { r.register(N); }
`;

const TRUST_ALL = { allowlist: ["*"] };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pl-harden-"));
  nodeModules = join(root, "node_modules");
  mkdirSync(nodeModules, { recursive: true });
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Point the trust config file at a non-existent path so host config never leaks in.
  process.env.NODETOOL_PACKS_CONFIG = join(root, "no-such-packs.json");
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(root, { recursive: true, force: true });
});

describe("resolvePackTrust precedence", () => {
  it("prefers explicit options over everything", () => {
    process.env.NODETOOL_PACKS_ALLOWLIST = "from-env";
    const trust = resolvePackTrust({ allowlist: ["explicit"], allowUnlisted: false });
    expect(trust.allowlist).toEqual(["explicit"]);
    expect(trust.allowUnlisted).toBe(false);
  });

  it("parses the env allowlist (comma split, trimmed, empties dropped)", () => {
    process.env.NODETOOL_PACKS_ALLOWLIST = " a , b ,, c ";
    expect(resolvePackTrust().allowlist).toEqual(["a", "b", "c"]);
  });

  it("defaults allowUnlisted to false in production and true otherwise", () => {
    process.env.NODETOOL_ENV = "production";
    expect(resolvePackTrust().allowUnlisted).toBe(false);
    process.env.NODETOOL_ENV = "development";
    expect(resolvePackTrust().allowUnlisted).toBe(true);
  });

  it("reads allowlist/allowUnlisted from the config file when present", () => {
    const cfg = join(root, "packs.json");
    writePackTrustConfig({ allowlist: ["@acme/x"], allowUnlisted: false }, cfg);
    process.env.NODETOOL_PACKS_CONFIG = cfg;
    const trust = resolvePackTrust();
    expect(trust.allowlist).toEqual(["@acme/x"]);
    expect(trust.allowUnlisted).toBe(false);
  });
});

describe("loadInstalledPacks trust + guards", () => {
  it("registers a node from a trusted, allowed pack", async () => {
    writePack("acme-nodes", { name: "acme-nodes", main: "index.js", nodetool: {} }, nodeSrc("acme.Hello"));
    const reg = new NodeRegistry();
    const results = await loadInstalledPacks(reg, {
      searchPaths: [nodeModules],
      trust: TRUST_ALL
    });
    expect(results[0].status).toBe("loaded");
    expect(results[0].registered).toEqual(["acme.Hello"]);
    expect(reg.has("acme.Hello")).toBe(true);
  });

  it("skips packs not on the allowlist", async () => {
    writePack("acme-nodes", { name: "acme-nodes", main: "index.js", nodetool: {} }, nodeSrc("acme.Hello"));
    const results = await loadInstalledPacks(new NodeRegistry(), {
      searchPaths: [nodeModules],
      trust: { allowlist: ["other"], allowUnlisted: false }
    });
    expect(results[0].status).toBe("skipped");
    expect(results[0].reason).toBe("not on pack allowlist");
  });

  it("rejects a node under a reserved namespace", async () => {
    writePack("bad-nodes", { name: "bad-nodes", main: "index.js", nodetool: {} }, nodeSrc("nodetool.Sneaky"));
    const results = await loadInstalledPacks(new NodeRegistry(), {
      searchPaths: [nodeModules],
      trust: TRUST_ALL
    });
    expect(results[0].registered).toEqual([]);
    expect(results[0].skippedNodes).toEqual([
      { nodeType: "nodetool.Sneaky", reason: "reserved-namespace" }
    ]);
  });

  it("rejects a node that collides with an already-registered type", async () => {
    writePack("dup-nodes", { name: "dup-nodes", main: "index.js", nodetool: {} }, nodeSrc("acme.Taken"));
    const reg = new NodeRegistry();
    // Pre-register the same type via a guarded-allowed namespace.
    writePack("first-nodes", { name: "first-nodes", main: "first.js", nodetool: {} }, nodeSrc("acme.Taken"), "first.js");
    await loadInstalledPacks(reg, { searchPaths: [nodeModules], trust: TRUST_ALL });
    // Second load attempt of the same type collides.
    const reg2 = reg;
    const results = await loadInstalledPacks(reg2, {
      searchPaths: [nodeModules],
      trust: TRUST_ALL
    });
    const collided = results.flatMap((r) => r.skippedNodes);
    expect(collided).toContainEqual({ nodeType: "acme.Taken", reason: "collision" });
  });

  it("skips a pack that requires a newer api version", async () => {
    writePack(
      "future-nodes",
      { name: "future-nodes", main: "index.js", nodetool: { apiVersion: PACK_API_VERSION + 1 } },
      nodeSrc("acme.Future")
    );
    const results = await loadInstalledPacks(new NodeRegistry(), {
      searchPaths: [nodeModules],
      trust: TRUST_ALL
    });
    expect(results[0].status).toBe("skipped");
    expect(results[0].reason).toContain(`requires pack API v${PACK_API_VERSION + 1}`);
  });

  it("reports an error when the register export is missing", async () => {
    writePack(
      "noreg-nodes",
      { name: "noreg-nodes", main: "index.js", nodetool: {} },
      "export const notRegister = 1;"
    );
    const results = await loadInstalledPacks(new NodeRegistry(), {
      searchPaths: [nodeModules],
      trust: TRUST_ALL
    });
    expect(results[0].status).toBe("error");
    expect(results[0].error?.message).toContain('no callable export "register"');
  });

  it("resolves the entry from exports['.'].import and a custom register export", async () => {
    const dir = join(nodeModules, "exp-nodes");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "exp-nodes",
        exports: { ".": { import: "./entry.mjs" } },
        nodetool: { register: "setup" }
      })
    );
    writeFileSync(
      join(dir, "entry.mjs"),
      nodeSrc("acme.Exp").replace("export function register", "export function setup")
    );
    const reg = new NodeRegistry();
    const results = await loadInstalledPacks(reg, {
      searchPaths: [nodeModules],
      trust: TRUST_ALL
    });
    expect(results[0].status).toBe("loaded");
    expect(reg.has("acme.Exp")).toBe(true);
  });
});

describe("defaultPackSearchPaths env handling", () => {
  it("includes existing env-supplied node_modules dirs (split on ,;:)", () => {
    const a = join(root, "extraA");
    const b = join(root, "extraB");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    process.env.NODETOOL_PACK_SEARCH_PATHS = `${a};${b}:/does/not/exist`;
    const paths = defaultPackSearchPaths(root);
    expect(paths).toContain(a);
    expect(paths).toContain(b);
    expect(paths).not.toContain("/does/not/exist");
  });

  it("deduplicates and walks up to find node_modules", () => {
    const paths = defaultPackSearchPaths(root);
    expect(paths).toContain(nodeModules);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
