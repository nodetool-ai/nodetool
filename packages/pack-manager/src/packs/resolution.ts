import { realpathSync } from "node:fs";
import * as nodeModule from "node:module";
import { createRequire, isBuiltin } from "node:module";
import { dirname, join, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Packs live in their own npm project, so a pack's `import "@nodetool-ai/config"`
 * would load the packs project's copy while the CLI uses its own. Every core
 * package and shared-identity library must exist once per process, so packs
 * resolve them from the CLI. Host code that imports a package only the packs
 * project installed (a runtime library, a full-runtime package) falls back to
 * the packs project.
 */
export interface PackResolution {
  readonly cliRoot: string;
  readonly projectRoot: string;
  /** Catalog pack and companion package names. The packs project owns these. */
  readonly packNames: readonly string[];
  /** Catalog shared-identity libraries. The CLI's copy wins when it has one. */
  readonly sharedNames: readonly string[];
}

interface ResolveContext { readonly conditions?: readonly string[]; readonly parentURL?: string }
interface ResolveResult { readonly url: string; readonly format?: string | null; readonly shortCircuit?: boolean }
type NextResolve = (specifier: string, context?: ResolveContext) => ResolveResult;
interface RegisterHooks {
  (hooks: { resolve: (specifier: string, context: ResolveContext, next: NextResolve) => ResolveResult }): unknown;
}

let active: (PackResolution & { readonly packNameSet: ReadonlySet<string>; readonly sharedNameSet: ReadonlySet<string> }) | undefined;
let registered = false;
let resolving = false;

/** The npm package name of a bare specifier, or null for relative, absolute and URL specifiers. */
export function bareSpecifierName(specifier: string): string | null {
  if (specifier === "" || specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("\\") ||
    specifier.startsWith("#") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier) || isBuiltin(specifier)) {
    return null;
  }
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    return parts.length >= 2 && parts[1] ? `${parts[0]}/${parts[1]}` : null;
  }
  return parts[0] ?? null;
}

/** Whether `path` lies strictly inside `root`. */
export function within(root: string, path: string): boolean {
  const inside = relative(root, path);
  return inside !== "" && inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside); // key-boundary-ok: sep anchors the parent path component on this platform.
}

/** Whether a package must come from the CLI when the CLI has it. */
export function isHostShared(name: string, packNames: ReadonlySet<string>, sharedNames: ReadonlySet<string>): boolean {
  return (name.startsWith("@nodetool-ai/") && !packNames.has(name)) || sharedNames.has(name);
}

function parentPath(parentURL: string | undefined): string | null {
  if (!parentURL?.startsWith("file:")) { return null; }
  try { return fileURLToPath(parentURL); } catch { return null; }
}

/** Resolve from another directory for both `import` and `require`. */
function resolveFrom(directory: string, specifier: string, context: ResolveContext, next: NextResolve): ResolveResult {
  const anchor = join(directory, "package.json");
  if (context.conditions?.includes("require")) {
    // CommonJS resolution ignores a replaced parentURL, so resolve the file here.
    return { url: pathToFileURL(createRequire(anchor).resolve(specifier)).href, shortCircuit: true };
  }
  return next(specifier, { ...context, parentURL: pathToFileURL(anchor).href });
}

/**
 * Choose the directory a bare import resolves from. The choice checks package
 * folders on disk instead of trying a resolution and catching its failure:
 * on Node 22, a later `nextResolve` for the same import repeats the first
 * failure, so the hook only calls the resolution it expects to succeed.
 */
function resolveHook(specifier: string, context: ResolveContext, next: NextResolve): ResolveResult {
  const state = active;
  const name = bareSpecifierName(specifier);
  if (!state || resolving || !name) { return next(specifier, context); }
  resolving = true;
  try {
    const parent = parentPath(context.parentURL);
    const directory = parent ? dirname(parent) : process.cwd();
    if (parent && within(state.projectRoot, parent)) {
      if (isHostShared(name, state.packNameSet, state.sharedNameSet) && findPackageRoot(name, state.cliRoot)) {
        return resolveFrom(state.cliRoot, specifier, context, next);
      }
      return next(specifier, context);
    }
    if (!findPackageRoot(name, directory) && findPackageRoot(name, state.projectRoot)) {
      return resolveFrom(state.projectRoot, specifier, context, next);
    }
    return next(specifier, context);
  } finally { resolving = false; }
}

/** The CLI root of the active pack resolution, inherited by child processes. */
export const PACKS_CLI_ROOT_ENV = "NODETOOL_PACKS_CLI_ROOT";

/** Route pack and host module resolution for this process. Repeated calls replace the active project. */
export function activatePackResolution(resolution: PackResolution): void {
  const projectRoot = realpathSync(resolution.projectRoot);
  const cliRoot = realpathSync(resolution.cliRoot);
  if (active?.projectRoot === projectRoot && active.cliRoot === cliRoot &&
    active.packNames === resolution.packNames && active.sharedNames === resolution.sharedNames) { return; }
  if (!registered) {
    // SAFETY: registerHooks is the synchronous customization API; its absence is checked below.
    const register = (nodeModule as { registerHooks?: RegisterHooks }).registerHooks;
    if (typeof register !== "function") {
      throw new Error(`Installed node packs require Node.js 22.15 or later. This is Node.js ${process.versions.node}.`);
    }
    register({ resolve: resolveHook });
    registered = true;
  }
  active = { ...resolution, projectRoot, cliRoot,
    packNameSet: new Set(resolution.packNames), sharedNameSet: new Set(resolution.sharedNames) };
  // Features in the project re-detect their host, and some spawn a child that does the same.
  process.env[PACKS_CLI_ROOT_ENV] = cliRoot;
}

/** The real root of the package `name` as seen from `directory`, or null. */
export function findPackageRoot(name: string, directory: string): string | null {
  for (const lookup of createRequire(join(directory, "package.json")).resolve.paths(`${name}/package.json`) ?? []) {
    try { return realpathSync(join(lookup, name)); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) { throw error; } }
  }
  return null;
}

/**
 * The package root a module inside `directory` loads for `name`, applying the
 * same rule as the resolution hook. `require.resolve` bypasses hooks, so
 * verification uses this instead.
 */
export function resolvePackDependency(name: string, directory: string, resolution: PackResolution): string | null {
  const projectRoot = realpathSync(resolution.projectRoot);
  if (within(projectRoot, realpathSync(directory)) && isHostShared(name, new Set(resolution.packNames), new Set(resolution.sharedNames))) {
    const host = findPackageRoot(name, resolution.cliRoot);
    if (host) { return host; }
  }
  return findPackageRoot(name, directory) ?? (within(projectRoot, realpathSync(directory)) ? null : findPackageRoot(name, projectRoot));
}
