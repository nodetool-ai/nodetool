/**
 * Dynamic node pack loader.
 *
 * Discovers installed third-party node packs and registers their nodes into a
 * {@link NodeRegistry} at startup, so the server no longer needs a hardcoded
 * import for every pack.
 *
 * A pack is any npm package whose `package.json` carries a `nodetool` field:
 *
 * ```jsonc
 * {
 *   "name": "@acme/cool-nodes",
 *   "main": "dist/index.js",
 *   "nodetool": {
 *     "apiVersion": 1,
 *     "register": "registerNodes"  // named export to call with the registry
 *   }
 * }
 * ```
 *
 * The named export is called with the registry: `registerNodes(registry)`.
 * It may be sync or async. Trust model: packs run in-process, exactly like any
 * other installed dependency — only install packs you trust.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { NodeClass } from "./base-node.js";
import type { NodeRegistry } from "./registry.js";

/** The current pack API version. Packs declaring a higher version are skipped. */
export const PACK_API_VERSION = 1;

/** Default named export a pack's entry should expose. */
const DEFAULT_REGISTER_EXPORT = "register";

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

/** Result of attempting to load a single pack. */
export interface LoadedPackResult {
  pack: DiscoveredPack;
  ok: boolean;
  error?: Error;
}

export interface LoadPacksOptions {
  /**
   * `node_modules` directories to scan. If omitted, walks up from
   * `process.cwd()` collecting every `node_modules` along the way.
   */
  searchPaths?: string[];
  /** Called once per load attempt (success or failure). */
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
 */
export function defaultPackSearchPaths(start: string = process.cwd()): string[] {
  const paths: string[] = [];
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, "node_modules");
    if (existsSync(candidate)) paths.push(candidate);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return paths;
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
 * Discover and load all installed packs into `registry`.
 *
 * A failure in one pack (bad import, throwing register fn, version mismatch)
 * is captured and reported via `onResult`; it never aborts the others.
 */
export async function loadInstalledPacks(
  registry: NodeRegistry,
  options: LoadPacksOptions = {}
): Promise<LoadedPackResult[]> {
  const packs = discoverPacks(options.searchPaths);
  const results: LoadedPackResult[] = [];
  for (const pack of packs) {
    const result = await loadPack(registry, pack);
    results.push(result);
    options.onResult?.(result);
  }
  return results;
}

async function loadPack(
  registry: PackRegistry,
  pack: DiscoveredPack
): Promise<LoadedPackResult> {
  const declared = pack.manifest.apiVersion ?? PACK_API_VERSION;
  if (declared > PACK_API_VERSION) {
    return {
      pack,
      ok: false,
      error: new Error(
        `pack "${pack.name}" requires pack API v${declared}, host supports v${PACK_API_VERSION}`
      )
    };
  }
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
    await register(registry);
    return { pack, ok: true };
  } catch (error) {
    return {
      pack,
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

function resolveRegisterFn(
  mod: Record<string, unknown>,
  exportName: string
): ((registry: PackRegistry) => void | Promise<void>) | undefined {
  const candidate = mod[exportName] ?? (mod["default"] as Record<string, unknown> | undefined)?.[exportName];
  return typeof candidate === "function"
    ? (candidate as (registry: PackRegistry) => void | Promise<void>)
    : undefined;
}

function listPackageDirs(nodeModules: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(nodeModules);
  } catch {
    return [];
  }
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
    if (!statSync(pkgJsonPath).isFile()) return undefined;
    pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as PackageJsonShape;
  } catch {
    return undefined;
  }
  if (!pkg.nodetool || typeof pkg.nodetool !== "object") return undefined;
  if (!pkg.name) return undefined;

  const entryRel = resolveEntry(pkg);
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
  if (dot && typeof dot === "object") {
    const conds = dot as Record<string, unknown>;
    const picked = conds["import"] ?? conds["default"];
    if (typeof picked === "string") return picked;
  }
  return pkg.main ?? "index.js";
}
