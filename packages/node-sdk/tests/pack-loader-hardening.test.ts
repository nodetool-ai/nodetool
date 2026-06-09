// @ts-nocheck
/**
 * Mutation-hardening tests for pack-loader.ts: trust resolution precedence,
 * the guarded-registry reserved-namespace / collision / api-version gates,
 * env-driven search paths, and entry/register-export resolution.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeRegistry } from "../src/registry.js";
import {
  defaultPackSearchPaths,
  discoverPacks,
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

describe("discoverPacks", () => {
  function writeManifest(dirName: string, pkg: Record<string, unknown>, entryFile = "index.js") {
    const dir = join(nodeModules, dirName);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
    if (entryFile) writeFileSync(join(dir, entryFile), "export function register() {}");
    return dir;
  }

  it("discovers a scoped @scope/name package", () => {
    writeManifest("@acme/cool", { name: "@acme/cool", main: "index.js", nodetool: {} });
    const found = discoverPacks([nodeModules]);
    expect(found.map((p) => p.name)).toEqual(["@acme/cool"]);
    expect(found[0].registerExport).toBe("register");
  });

  it("ignores .bin and .cache directories", () => {
    mkdirSync(join(nodeModules, ".bin"), { recursive: true });
    writeFileSync(
      join(nodeModules, ".bin", "package.json"),
      JSON.stringify({ name: ".bin", nodetool: {}, main: "index.js" })
    );
    writeManifest("real", { name: "real", main: "index.js", nodetool: {} });
    expect(discoverPacks([nodeModules]).map((p) => p.name)).toEqual(["real"]);
  });

  it("skips packages without a nodetool field, name, or entry", () => {
    writeManifest("no-field", { name: "no-field", main: "index.js" });
    writeManifest("no-name", { nodetool: {}, main: "index.js" });
    // nodetool field present + name, but the declared entry file is missing.
    const d = join(nodeModules, "no-entry");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "no-entry", main: "index.js", nodetool: {} }));
    expect(discoverPacks([nodeModules])).toEqual([]);
  });

  it("resolves entry from exports['.'] string, object.import/default, then main", () => {
    writeManifest("exp-str", { name: "exp-str", exports: { ".": "./e.js" }, nodetool: {} }, "e.js");
    writeManifest("exp-import", { name: "exp-import", exports: { ".": { import: "./i.js" } }, nodetool: {} }, "i.js");
    writeManifest("exp-default", { name: "exp-default", exports: { ".": { default: "./d.js" } }, nodetool: {} }, "d.js");
    writeManifest("main-only", { name: "main-only", main: "./m.js", nodetool: {} }, "m.js");
    const byName = Object.fromEntries(discoverPacks([nodeModules]).map((p) => [p.name, p.entry]));
    expect(byName["exp-str"].endsWith("/e.js")).toBe(true);
    expect(byName["exp-import"].endsWith("/i.js")).toBe(true);
    expect(byName["exp-default"].endsWith("/d.js")).toBe(true);
    expect(byName["main-only"].endsWith("/m.js")).toBe(true);
  });

  it("honours a custom register export name from the manifest", () => {
    writeManifest("custom-reg", { name: "custom-reg", main: "index.js", nodetool: { register: "setup" } });
    expect(discoverPacks([nodeModules])[0].registerExport).toBe("setup");
  });

  it("lets the nearer search path shadow a duplicate package name", () => {
    const far = join(root, "far_modules");
    mkdirSync(far, { recursive: true });
    const farDir = join(far, "dup");
    mkdirSync(farDir, { recursive: true });
    writeFileSync(join(farDir, "package.json"), JSON.stringify({ name: "dup", main: "index.js", nodetool: { register: "far" } }));
    writeFileSync(join(farDir, "index.js"), "export function far() {}");
    writeManifest("dup", { name: "dup", main: "index.js", nodetool: { register: "near" } });
    const found = discoverPacks([nodeModules, far]);
    expect(found.filter((p) => p.name === "dup")).toHaveLength(1);
    expect(found.find((p) => p.name === "dup")?.registerExport).toBe("near");
  });
});

describe("discoverPacks error and edge paths", () => {
  function writeManifest(dirName: string, pkg: Record<string, unknown>, entryFile = "index.js") {
    const dir = join(nodeModules, dirName);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
    if (entryFile) writeFileSync(join(dir, entryFile), "export function register() {}");
  }

  it("returns [] when a search path cannot be read", () => {
    expect(discoverPacks([join(root, "does-not-exist")])).toEqual([]);
  });

  it("skips a package with invalid package.json", () => {
    const dir = join(nodeModules, "broken");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), "{ not json");
    writeFileSync(join(dir, "index.js"), "");
    expect(discoverPacks([nodeModules])).toEqual([]);
  });

  it("skips a package whose nodetool field is not an object", () => {
    writeManifest("strfield", { name: "strfield", main: "index.js", nodetool: "yes" });
    expect(discoverPacks([nodeModules])).toEqual([]);
  });

  it("defaults the entry to index.js when no main or exports are given", () => {
    writeManifest("bareentry", { name: "bareentry", nodetool: {} });
    expect(discoverPacks([nodeModules])[0].entry.endsWith("/index.js")).toBe(true);
  });

  it("resolves a dot-export object lacking import/default via main", () => {
    writeManifest("emptyexp", { name: "emptyexp", exports: { ".": {} }, main: "./m.js", nodetool: {} }, "m.js");
    expect(discoverPacks([nodeModules])[0].entry.endsWith("/m.js")).toBe(true);
  });

  it("resolves main when exports['.'] is null", () => {
    // Pins `!dot || ...`: a null dot must short-circuit to undefined (→ main),
    // not proceed into the object branch (which would throw on null["import"]).
    writeManifest("nulldot", { name: "nulldot", exports: { ".": null }, main: "./n.js", nodetool: {} }, "n.js");
    const found = discoverPacks([nodeModules]);
    expect(found).toHaveLength(1);
    expect(found[0].entry.endsWith("/n.js")).toBe(true);
  });

  it("resolves main when there is no exports field at all", () => {
    // dot is undefined here; the object-branch must NOT run (it would throw on
    // conds["import"]), so this pins `dot && typeof dot === "object"`.
    writeManifest("mainonly", { name: "mainonly", main: "./only.js", nodetool: {} }, "only.js");
    const found = discoverPacks([nodeModules]);
    expect(found).toHaveLength(1);
    expect(found[0].entry.endsWith("/only.js")).toBe(true);
  });

  it("ignores both .bin and .cache directories", () => {
    for (const d of [".bin", ".cache"]) {
      mkdirSync(join(nodeModules, d), { recursive: true });
      // valid manifest AND entry — these would be discovered if not skipped.
      writeFileSync(join(nodeModules, d, "package.json"), JSON.stringify({ name: d, nodetool: {}, main: "index.js" }));
      writeFileSync(join(nodeModules, d, "index.js"), "export function register() {}");
    }
    writeManifest("realpkg", { name: "realpkg", main: "index.js", nodetool: {} });
    expect(discoverPacks([nodeModules]).map((p) => p.name)).toEqual(["realpkg"]);
  });

  it("skips a scoped entry whose directory cannot be read", () => {
    // A plain file named like a scope ("@x") makes readdirSync throw → skipped.
    writeFileSync(join(nodeModules, "@notadir"), "i am a file");
    writeManifest("ok", { name: "ok", main: "index.js", nodetool: {} });
    expect(discoverPacks([nodeModules]).map((p) => p.name)).toEqual(["ok"]);
  });
});

describe("guarded registry edge cases", () => {
  it("forwards a node without a nodeType to the real registry (which throws)", async () => {
    const dir = join(nodeModules, "notype");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "notype", main: "index.js", nodetool: {} }));
    writeFileSync(
      join(dir, "index.js"),
      "class NoType { static title='x'; async process(){return {};} }\nexport function register(r){ r.register(NoType); }"
    );
    const results = await loadInstalledPacks(new NodeRegistry(), { searchPaths: [nodeModules], trust: TRUST_ALL });
    expect(results[0].status).toBe("error");
  });

  it("skips a node under a reserved top-level name with no dot", async () => {
    writeFileSync(
      join(mkdirpkg("comfypack"), "index.js"),
      nodeSrc("comfy")
    );
    const results = await loadInstalledPacks(new NodeRegistry(), { searchPaths: [nodeModules], trust: TRUST_ALL });
    expect(results[0].skippedNodes).toContainEqual({ nodeType: "comfy", reason: "reserved-namespace" });
  });

  it("reports an error when the register export is not a function", async () => {
    const dir = mkdirpkg("nonfn");
    writeFileSync(join(dir, "index.js"), "export const register = 42;");
    const results = await loadInstalledPacks(new NodeRegistry(), { searchPaths: [nodeModules], trust: TRUST_ALL });
    expect(results[0].status).toBe("error");
    expect(results[0].error?.message).toContain('no callable export "register"');
  });

  it("exposes target.has to packs so they can self-skip", async () => {
    const dir = mkdirpkg("probe");
    writeFileSync(
      join(dir, "index.js"),
      `class ProbeNode {
        static nodeType = "acme.Probe"; static title = "P"; static description = "";
        static getDeclaredProperties(){ return []; }
        static getDeclaredOutputs(){ return {}; }
        static toDescriptor(){ return { outputs: {} }; }
        async process(){ return {}; }
      }
      export function register(r){ if (!r.has("acme.Probe")) r.register(ProbeNode); }`
    );
    const reg = new NodeRegistry();
    // Pre-register acme.Probe so guarded.has("acme.Probe") returns true.
    reg.register(
      class {
        static nodeType = "acme.Probe";
        static title = "Pre";
        static description = "";
        static getDeclaredProperties() { return []; }
        static getDeclaredOutputs() { return {}; }
        static toDescriptor() { return { outputs: {} }; }
        async process() { return {}; }
      } as any
    );
    const results = await loadInstalledPacks(reg, { searchPaths: [nodeModules], trust: TRUST_ALL });
    // The pack sees has() === true and self-skips; nothing is registered or collided.
    expect(results[0].skippedNodes).toEqual([]);
    expect(results[0].registered).toEqual([]);
  });

  function mkdirpkg(name: string): string {
    const dir = join(nodeModules, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, main: "index.js", nodetool: {} }));
    return dir;
  }
});

describe("trust config file parsing", () => {
  it("returns an empty allowlist by default", () => {
    expect(resolvePackTrust().allowlist).toEqual([]);
  });

  it("filters non-string allow entries and ignores a non-boolean allowUnlisted", () => {
    const cfg = join(root, "packs.json");
    writeFileSync(cfg, JSON.stringify({ allow: ["a", 1, "b", null], allowUnlisted: "nope" }));
    process.env.NODETOOL_PACKS_CONFIG = cfg;
    const trust = resolvePackTrust();
    expect(trust.allowlist).toEqual(["a", "b"]);
    // allowUnlisted was not a boolean, so it falls back to the dev default (true).
    expect(trust.allowUnlisted).toBe(true);
  });

  it("writes a config terminated by a newline that round-trips", () => {
    const cfg = join(root, "written.json");
    writePackTrustConfig({ allowlist: ["x"], allowUnlisted: false }, cfg);
    const raw = readFileSync(cfg, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(JSON.parse(raw)).toEqual({ allow: ["x"], allowUnlisted: false });
  });

  it("honours the wildcard even when allowUnlisted is false", async () => {
    writeFileSync(join(mkdir2("wild"), "index.js"), nodeSrc("acme.Wild"));
    const reg = new NodeRegistry();
    const results = await loadInstalledPacks(reg, {
      searchPaths: [nodeModules],
      trust: { allowlist: ["*"], allowUnlisted: false }
    });
    expect(results[0].status).toBe("loaded");
  });

  function mkdir2(name: string): string {
    const dir = join(nodeModules, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, main: "index.js", nodetool: {} }));
    return dir;
  }
});

describe("loadInstalledPacks result arrays", () => {
  it("reports empty registered/skippedNodes for a disallowed pack", async () => {
    writeFileSync(join(mkdir3("dis"), "index.js"), nodeSrc("acme.Dis"));
    const results = await loadInstalledPacks(new NodeRegistry(), {
      searchPaths: [nodeModules],
      trust: { allowlist: ["other"], allowUnlisted: false }
    });
    expect(results[0].registered).toEqual([]);
    expect(results[0].skippedNodes).toEqual([]);
  });

  it("reports empty registered/skippedNodes for an api-version skip", async () => {
    const dir = join(nodeModules, "futurepack");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "futurepack", main: "index.js", nodetool: { apiVersion: PACK_API_VERSION + 1 } }));
    writeFileSync(join(dir, "index.js"), nodeSrc("acme.Future"));
    const results = await loadInstalledPacks(new NodeRegistry(), { searchPaths: [nodeModules], trust: TRUST_ALL });
    expect(results[0].registered).toEqual([]);
    expect(results[0].skippedNodes).toEqual([]);
  });

  function mkdir3(name: string): string {
    const dir = join(nodeModules, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, main: "index.js", nodetool: {} }));
    return dir;
  }
});

describe("defaultPackSearchPaths env handling", () => {
  it("includes existing env-supplied node_modules dirs, trimming and dropping empties", () => {
    const a = join(root, "extraA");
    const b = join(root, "extraB");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    // whitespace around entries and an empty segment must be handled.
    process.env.NODETOOL_PACK_SEARCH_PATHS = ` ${a} ;;${b}:/does/not/exist`;
    const paths = defaultPackSearchPaths(root);
    expect(paths).toContain(a);
    expect(paths).toContain(b);
    expect(paths).not.toContain("/does/not/exist");
    // every returned path actually exists (no non-existent candidates leak in).
    expect(paths.every((p) => existsSync(p))).toBe(true);
  });

  it("includes the single NODETOOL_OPTIONAL_NODE_MODULES dir when it exists", () => {
    const opt = join(root, "optmods");
    mkdirSync(opt, { recursive: true });
    process.env.NODETOOL_OPTIONAL_NODE_MODULES = opt;
    expect(defaultPackSearchPaths(root)).toContain(opt);
  });

  it("returns only existing, de-duplicated paths", () => {
    const paths = defaultPackSearchPaths(root);
    expect(paths).toContain(nodeModules);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((p) => existsSync(p))).toBe(true);
  });

  it("walks up to find node_modules in a parent directory", () => {
    const child = join(root, "a", "b");
    mkdirSync(child, { recursive: true });
    const parentModules = join(root, "a", "node_modules");
    mkdirSync(parentModules, { recursive: true });
    const paths = defaultPackSearchPaths(child);
    expect(paths).toContain(parentModules);
  });
});
