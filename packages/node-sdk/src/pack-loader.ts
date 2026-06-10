/**
 * Dynamic node pack loader with a trust/governance layer.
 *
 * Discovers installed third-party node packs and registers their nodes into a
 * {@link NodeRegistry}. A pack is any npm package whose `package.json` carries a
 * `nodetool` field:
 *
 * ```jsonc
 * {
 *   "name": "@acme/cool-nodes",
 *   "main": "dist/index.js",
 *   "nodetool": {
 *     "apiVersion": 1,
 *     "register": "register"   // named export called with the registry
 *   }
 * }
 * ```
 *
 * Trust model — packs run in-process with full server privileges (filesystem,
 * secrets, network), so loading is gated:
 *
 *   - **Allowlist**: explicit list of trusted pack names. `"*"` allows all.
 *   - **allowUnlisted**: whether packs not on the allowlist load anyway.
 *     Defaults to `true` in development and `false` in production, so a
 *     production server never silently runs whatever happens to be in
 *     `node_modules`.
 *
 * Resolved (when not passed explicitly) from `NODETOOL_PACKS_ALLOWLIST` and a
 * config file at `~/.config/nodetool/packs.json` (override via
 * `NODETOOL_PACKS_CONFIG`).
 *
 * Two further guards protect the registry from misbehaving packs:
 *   - **Reserved namespaces**: packs cannot register node types under
 *     first-party namespaces (`nodetool.`, `lib.`, provider names, …).
 *   - **Collision protection**: a pack cannot shadow an already-registered node
 *     type (e.g. a built-in); the conflicting node is skipped with a warning.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { NodeClass } from "./base-node.js";
import type { NodeRegistry } from "./registry.js";

/** The current pack API version. Packs declaring a higher version are skipped. */
export const PACK_API_VERSION = 1;

/** Default named export a pack's entry should expose. */
const DEFAULT_REGISTER_EXPORT = "register";

/**
 * First-party node-type namespaces a third-party pack may not register under.
 * Matched against the first dot-separated segment of a node type.
 */
export const DEFAULT_RESERVED_NAMESPACES: readonly string[] = [
  "nodetool",
  "lib",
  "comfy",
  "default",
  "huggingface",
  "hf",
  "mlx",
  "transformers",
  "openai",
  "gemini",
  "anthropic",
  "mistral",
  "groq",
  "ollama",
  "replicate",
  "fal",
  "elevenlabs",
  "kie",
  "vector",
  "apify",
  "search",
  "messaging"
];

/** The `nodetool` field in a pack's package.json. */
export interface PackManifest {
  /** Pack API version the pack was built against. Defaults to {@link PACK_API_VERSION}. */
  apiVersion?: number;
  /** Name of the entry export to call with the registry. Defaults to `register`. */
  register?: string;
}

/** A registry-like target the loader registers nodes into. */
export interface PackRegistry {
  register: (nodeClass: NodeClass) => void;
  has: (nodeType: string) => boolean;
}

/** A pack discovered on disk, before its code is imported. */
export interface DiscoveredPack {
  name: string;
  version?: string;
  /** Absolute path to the package directory. */
  dir: string;
  /** Absolute path to the resolved entry module. */
  entry: string;
  /** Export name to call with the registry. */
  registerExport: string;
  manifest: PackManifest;
}

/** Why a pack or one of its nodes was not loaded. */
export type SkipReason =
  | "not-allowed"
  | "api-version"
  | "reserved-namespace"
  | "collision"
  | "no-node-type";

/** Result of attempting to load a single pack. */
export interface LoadedPackResult {
  pack: DiscoveredPack;
  status: "loaded" | "skipped" | "error";
  /** Present when `status` is `skipped` (pack-level) or `error`. */
  reason?: string;
  /** Node types successfully registered. */
  registered: string[];
  /** Nodes the pack tried to register but the guard rejected. */
  skippedNodes: { nodeType: string; reason: SkipReason }[];
  error?: Error;
}

/** Trust configuration governing which packs may load. */
export interface PackTrustOptions {
  /** Allowlisted pack names. `"*"` allows all. */
  allowlist?: string[];
  /** Load packs not on the allowlist. Defaults: dev `true`, production `false`. */
  allowUnlisted?: boolean;
}

export interface LoadPacksOptions {
  /**
   * `node_modules` directories to scan. If omitted, walks up from
   * `process.cwd()` collecting every `node_modules` along the way.
   */
  searchPaths?: string[];
  /** Trust gate. If omitted, resolved from env + config file. */
  trust?: PackTrustOptions;
  /** Namespaces packs may not register under. Defaults to {@link DEFAULT_RESERVED_NAMESPACES}. */
  reservedNamespaces?: readonly string[];
  /** Called once per pack (loaded, skipped, or error). */
  onResult?: (result: LoadedPackResult) => void;
}

interface PackageJsonShape {
  name?: string;
  version?: string;
  main?: string;
  exports?: unknown;
  nodetool?: PackManifest;
}

/**
 * Walk up from `start` collecting each `node_modules` directory that exists.
 *
 * Also includes any extra `node_modules` directories named in the
 * `NODETOOL_OPTIONAL_NODE_MODULES` or `NODETOOL_PACK_SEARCH_PATHS` env vars
 * (comma- or platform-separator-delimited). These are how the Electron app and
 * other hosts hand the loader an install root outside the project tree.
 */
export function defaultPackSearchPaths(start: string = process.cwd()): string[] {
  const paths: string[] = [];
  for (const extra of readEnvPackPaths()) {
    if (existsSync(extra)) paths.push(extra);
  }
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, "node_modules");
    if (existsSync(candidate)) paths.push(candidate);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Dedupe — an env-supplied path may also be on the cwd walk.
  return [...new Set(paths)];
}

function readEnvPackPaths(): string[] {
  // Stryker disable next-line ArrayDeclaration: a bogus seed path is dropped by the existsSync filter in defaultPackSearchPaths (its only caller), so the result is unchanged (equivalent).
  const out: string[] = [];
  const single = process.env["NODETOOL_OPTIONAL_NODE_MODULES"];
  // Stryker disable next-line ConditionalExpression: forcing this pushes an undefined single, which the existsSync filter downstream discards (equivalent).
  if (single) out.push(single);
  const list = process.env["NODETOOL_PACK_SEARCH_PATHS"];
  if (list) {
    // Comma, semicolon, or the platform PATH separator. ":" must not split
    // on Windows — it would shear drive letters off absolute paths (C:\…).
    const separators = process.platform === "win32" ? /[,;]/ : /[,;:]/;
    for (const entry of list.split(separators)) {
      const trimmed = entry.trim();
      // Stryker disable next-line ConditionalExpression: forcing this pushes an empty string, which the existsSync filter downstream discards (equivalent).
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

/**
 * Resolve the effective trust config from explicit options, then environment,
 * then the config file, then defaults.
 */
export function resolvePackTrust(
  options: PackTrustOptions = {}
): Required<PackTrustOptions> {
  const fromFile = readTrustConfigFile();
  const envAllow = process.env["NODETOOL_PACKS_ALLOWLIST"];
  const envList = envAllow
    ? envAllow
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const allowlist =
    options.allowlist ?? envList ?? fromFile.allow ?? [];

  const isProd = process.env["NODETOOL_ENV"] === "production";
  const allowUnlisted =
    options.allowUnlisted ?? fromFile.allowUnlisted ?? !isProd;

  return { allowlist, allowUnlisted };
}

function trustConfigPath(): string {
  return (
    process.env["NODETOOL_PACKS_CONFIG"] ??
    // Stryker disable next-line StringLiteral: the default path is anchored at the OS home dir; tests exercise trust resolution via the NODETOOL_PACKS_CONFIG override, and these path segments are not independently asserted (home-dir manipulation is unreliable under the test sandbox).
    join(homedir(), ".config", "nodetool", "packs.json")
  );
}

function readTrustConfigFile(): { allow?: string[]; allowUnlisted?: boolean } {
  try {
    const parsed = JSON.parse(readFileSync(trustConfigPath(), "utf8")) as {
      allow?: unknown;
      allowUnlisted?: unknown;
    };
    return {
      allow: Array.isArray(parsed.allow)
        ? parsed.allow.filter((v): v is string => typeof v === "string")
        : undefined,
      allowUnlisted:
        typeof parsed.allowUnlisted === "boolean"
          ? parsed.allowUnlisted
          : undefined
    };
  } catch {
    return {};
  }
}

/**
 * Persist a trust config to disk so it's picked up by {@link resolvePackTrust}
 * on the next call. Creates parent directories as needed.
 */
export function writePackTrustConfig(
  trust: { allowlist: string[]; allowUnlisted: boolean },
  path: string = trustConfigPath()
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      { allow: trust.allowlist, allowUnlisted: trust.allowUnlisted },
      null,
      2
    ) + "\n",
    // Stryker disable next-line StringLiteral: Node decodes "" as utf-8, so the encoding argument is behaviourally equivalent.
    "utf8"
  );
}

function isAllowed(
  name: string,
  trust: Required<PackTrustOptions>
): boolean {
  if (trust.allowlist.includes("*")) return true;
  if (trust.allowlist.includes(name)) return true;
  return trust.allowUnlisted;
}

/**
 * Scan the given `node_modules` directories for packs.
 *
 * The first occurrence of a given package name wins, so nearer `node_modules`
 * shadow farther ones — matching Node's own resolution order.
 */
export function discoverPacks(
  searchPaths: string[] = defaultPackSearchPaths()
): DiscoveredPack[] {
  const found = new Map<string, DiscoveredPack>();
  for (const nodeModules of searchPaths) {
    for (const pkgDir of listPackageDirs(nodeModules)) {
      const pack = readPack(pkgDir);
      if (pack && !found.has(pack.name)) found.set(pack.name, pack);
    }
  }
  return [...found.values()];
}

/**
 * Discover and load all trusted installed packs into `registry`.
 *
 * Loading is gated by the trust config; reserved namespaces and existing node
 * types are protected. A failure in one pack never aborts the others.
 */
export async function loadInstalledPacks(
  registry: NodeRegistry,
  options: LoadPacksOptions = {}
): Promise<LoadedPackResult[]> {
  const trust = resolvePackTrust(options.trust);
  const reserved = options.reservedNamespaces ?? DEFAULT_RESERVED_NAMESPACES;
  const packs = discoverPacks(options.searchPaths);
  const results: LoadedPackResult[] = [];
  for (const pack of packs) {
    let result: LoadedPackResult;
    if (!isAllowed(pack.name, trust)) {
      result = {
        pack,
        status: "skipped",
        reason: "not on pack allowlist",
        registered: [],
        skippedNodes: []
      };
    } else {
      result = await loadPack(registry, pack, reserved);
    }
    results.push(result);
    options.onResult?.(result);
  }
  return results;
}

async function loadPack(
  registry: NodeRegistry,
  pack: DiscoveredPack,
  reserved: readonly string[]
): Promise<LoadedPackResult> {
  const declared = pack.manifest.apiVersion ?? PACK_API_VERSION;
  if (declared > PACK_API_VERSION) {
    return {
      pack,
      status: "skipped",
      reason: `requires pack API v${declared}, host supports v${PACK_API_VERSION}`,
      registered: [],
      skippedNodes: []
    };
  }

  const registered: string[] = [];
  const skippedNodes: { nodeType: string; reason: SkipReason }[] = [];
  const guarded = makeGuardedRegistry(
    registry,
    reserved,
    registered,
    skippedNodes
  );

  try {
    const mod = (await import(pathToFileURL(pack.entry).href)) as Record<
      string,
      unknown
    >;
    const register = resolveRegisterFn(mod, pack.registerExport);
    if (!register) {
      throw new Error(
        `entry "${pack.entry}" has no callable export "${pack.registerExport}"`
      );
    }
    await register(guarded);
    return { pack, status: "loaded", registered, skippedNodes };
  } catch (error) {
    return {
      pack,
      status: "error",
      error: error instanceof Error ? error : new Error(String(error)),
      registered,
      skippedNodes
    };
  }
}

function makeGuardedRegistry(
  target: NodeRegistry,
  reserved: readonly string[],
  registered: string[],
  skippedNodes: { nodeType: string; reason: SkipReason }[]
): PackRegistry {
  return {
    has: (nodeType: string) => target.has(nodeType),
    register: (nodeClass: NodeClass) => {
      const nodeType = nodeClass.nodeType;
      // Stryker disable next-line ConditionalExpression,BlockStatement: a falsy nodeType errors either way — this branch lets target.register throw "without nodeType"; skipping it makes isReservedNamespace throw on the missing type — both surface as a loadPack error (equivalent).
      if (!nodeType) {
        // Let the real registry surface the "no nodeType" error.
        target.register(nodeClass);
        return;
      }
      if (isReservedNamespace(nodeType, reserved)) {
        skippedNodes.push({ nodeType, reason: "reserved-namespace" });
        return;
      }
      if (target.has(nodeType)) {
        skippedNodes.push({ nodeType, reason: "collision" });
        return;
      }
      target.register(nodeClass);
      registered.push(nodeType);
    }
  };
}

function isReservedNamespace(
  nodeType: string,
  reserved: readonly string[]
): boolean {
  const dot = nodeType.indexOf(".");
  // Stryker disable next-line EqualityOperator: > 0 vs >= 0 differ only at dot === 0 (a leading-dot type), where head becomes "" vs the full string — but neither is ever a reserved namespace, so the result is unchanged (equivalent).
  const head = dot > 0 ? nodeType.slice(0, dot) : nodeType;
  return reserved.includes(head);
}

function resolveRegisterFn(
  mod: Record<string, unknown>,
  exportName: string
): ((registry: PackRegistry) => void | Promise<void>) | undefined {
  const candidate =
    mod[exportName] ??
    (mod["default"] as Record<string, unknown> | undefined)?.[exportName];
  return typeof candidate === "function"
    ? (candidate as (registry: PackRegistry) => void | Promise<void>)
    : undefined;
}

function listPackageDirs(nodeModules: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(nodeModules);
  } catch {
    // Stryker disable next-line ArrayDeclaration: a bogus seed path has no package.json, so discoverPacks (the only caller) drops it via readPack — equivalent.
    return [];
  }
  // Stryker disable next-line ArrayDeclaration: a bogus seed path has no package.json, so readPack returns undefined for it and discoverPacks drops it — the result is unchanged (equivalent).
  const dirs: string[] = [];
  for (const name of entries) {
    if (name === ".bin" || name === ".cache") continue;
    const full = join(nodeModules, name);
    if (name.startsWith("@")) {
      // Scoped: one level deeper holds the actual packages.
      let scoped: string[];
      try {
        scoped = readdirSync(full);
      } catch {
        continue;
      }
      for (const sub of scoped) dirs.push(join(full, sub));
    } else {
      dirs.push(full);
    }
  }
  return dirs;
}

function readPack(pkgDir: string): DiscoveredPack | undefined {
  const pkgJsonPath = join(pkgDir, "package.json");
  let pkg: PackageJsonShape;
  try {
    // Stryker disable next-line ConditionalExpression: if package.json is a directory, the readFileSync below throws into this catch and also returns undefined, so the guard is equivalent.
    if (!statSync(pkgJsonPath).isFile()) return undefined;
    pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as PackageJsonShape;
  } catch {
    return undefined;
  }
  if (!pkg.nodetool || typeof pkg.nodetool !== "object") return undefined;
  if (!pkg.name) return undefined;

  const entryRel = resolveEntry(pkg);
  // Stryker disable next-line ConditionalExpression: resolveEntry always returns a string (it falls back to "index.js"), so entryRel is never falsy here (equivalent).
  if (!entryRel) return undefined;
  const entry = isAbsolute(entryRel) ? entryRel : join(pkgDir, entryRel);
  if (!existsSync(entry)) return undefined;

  return {
    name: pkg.name,
    version: pkg.version,
    dir: pkgDir,
    entry,
    registerExport: pkg.nodetool.register ?? DEFAULT_REGISTER_EXPORT,
    manifest: pkg.nodetool
  };
}

/** Resolve the entry module from `exports["."]` (import condition) or `main`. */
function resolveEntry(pkg: PackageJsonShape): string | undefined {
  const dot = (pkg.exports as Record<string, unknown> | undefined)?.["."];
  if (typeof dot === "string") return dot;
  const picked = pickExportCondition(dot);
  if (typeof picked === "string") return picked;
  return pkg.main ?? "index.js";
}

/**
 * Pick the `import` (then `default`) condition from an `exports["."]` object.
 * Conditions may nest (e.g. `{ import: { types: "...", default: "x.js" } }`),
 * so recurse until a string target is found. Depth-capped against cycles.
 */
function pickExportCondition(dot: unknown, depth = 0): unknown {
  // Stryker disable next-line ConditionalExpression: a nullish or non-object dot has no conditions to pick — every guard variant resolves to undefined and falls through to `main` (covered by the exports/main entry tests).
  if (!dot || typeof dot !== "object" || depth > 4) return undefined;
  const conds = dot as Record<string, unknown>;
  const picked = conds["import"] ?? conds["default"];
  if (typeof picked === "string") return picked;
  return pickExportCondition(picked, depth + 1);
}
