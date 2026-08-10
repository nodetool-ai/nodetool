/**
 * The capability module table — the platform's own surface, one lazy loader per
 * namespace.
 *
 * Same shape as `host-modules/registry.ts`, and for the same reasons: nothing
 * sits in an entry graph, each implementation imports its heavy dependencies
 * inside itself, and esbuild still inlines the dynamic imports into the
 * packaged `server.mjs`.
 *
 * The table is first-party only. Like `SANDBOX_HOST_MODULES` pins each host id
 * to one pack, a third-party pack can never declare a capability module.
 */

import {
  PERMISSION_CATEGORIES,
  type CapabilityExport,
  type CapabilityModule,
  type PermissionCategory
} from "./types.js";

type Loader = () => Promise<CapabilityModule>;

/** One lazy loader per namespace. The rest land in PRs 4–9. */
const MODULES: Readonly<Record<string, Loader>> = {
  workflows: () => import("./workflows.js").then((m) => m.module),
  models: () => import("./models.js").then((m) => m.module),
  media: () => import("./media.js").then((m) => m.module),
  style: () => import("./style.js").then((m) => m.module),
  collections: () => import("./collections.js").then((m) => m.module),
  nodes: () => import("./nodes.js").then((m) => m.module),
  jobs: () => import("./jobs.js").then((m) => m.module),
  assets: () => import("./assets.js").then((m) => m.module),
  apps: () => import("./apps.js").then((m) => m.module)
};

/**
 * The namespaces this build declares. It is the other half of {@link MODULES}
 * the way `SANDBOX_HOST_MODULES` is the other half of the host-module loader
 * table: the declaration a reviewer reads, against which
 * {@link capabilityModuleDrift} checks what is actually implemented. A module
 * lands in both or it lands in neither.
 */
export const DECLARED_CAPABILITY_MODULES: readonly string[] = [
  "workflows",
  "models",
  "media",
  "style",
  "collections",
  "nodes",
  "jobs",
  "assets",
  "apps"
];

const cache = new Map<string, Promise<CapabilityModule>>();

/**
 * Load one capability module, at most once per process.
 *
 * A miss is a programming error, not a guest-reachable path: the dispatcher
 * only asks for modules the mount resolved, and a mount only resolves modules
 * this table lists.
 */
export function loadCapabilityModule(
  moduleName: string
): Promise<CapabilityModule> {
  const cached = cache.get(moduleName);
  if (cached !== undefined) return cached;
  const loader = Object.hasOwn(MODULES, moduleName)
    ? MODULES[moduleName]
    : undefined;
  if (loader === undefined) {
    return Promise.reject(
      new Error(`no capability module is registered for "${moduleName}"`)
    );
  }
  const loading = loader();
  cache.set(moduleName, loading);
  void loading.catch(() => cache.delete(moduleName));
  return loading;
}

/** Module names this process can serve. */
export function listCapabilityModules(): readonly string[] {
  return Object.keys(MODULES).sort();
}

/** Load every registered module. Used by the drift walk and by name lookup. */
export async function loadAllCapabilityModules(): Promise<
  readonly CapabilityModule[]
> {
  return Promise.all(listCapabilityModules().map(loadCapabilityModule));
}

/**
 * Find one capability by its wire name across every registered module.
 *
 * This loads the whole table, which is the honest cost of a flat name space
 * over lazily-loaded modules. Once the pack lands, a mount resolves a namespace
 * first and calls {@link loadCapabilityModule} directly, so laziness holds on
 * the path that matters.
 */
export async function findCapability(
  name: string
): Promise<CapabilityExport | undefined> {
  for (const mod of await loadAllCapabilityModules()) {
    const found = mod.exports.find((entry) => entry.spec.name === name);
    if (found) return found;
  }
  return undefined;
}

/** Every registered capability's name → category. The snapshot a test pins. */
export async function capabilityCategorySnapshot(): Promise<
  Record<string, PermissionCategory>
> {
  const snapshot: Record<string, PermissionCategory> = {};
  for (const mod of await loadAllCapabilityModules()) {
    for (const entry of mod.exports) {
      snapshot[entry.spec.name] = entry.spec.category;
    }
  }
  return Object.fromEntries(
    Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b))
  );
}

/**
 * Everything wrong with one module: a key that disagrees with the module's own
 * name, an export missing an identity, and — the one this exists for — a spec
 * that carries no category. Exported so the drift test can prove the walk bites
 * on a broken module instead of only on an empty table.
 */
export function capabilityModuleIssues(
  moduleName: string,
  mod: CapabilityModule
): readonly string[] {
  const issues: string[] = [];
  if (mod.module !== moduleName) {
    issues.push(`${moduleName} declares itself as "${mod.module}"`);
  }
  const seen = new Set<string>();
  for (const entry of mod.exports) {
    const name = entry.spec.name;
    if (typeof name !== "string" || name.trim() === "") {
      issues.push(`${moduleName} exports a capability with no name`);
      continue;
    }
    if (seen.has(name)) {
      issues.push(`${moduleName} exports ${name} twice`);
    }
    seen.add(name);
    if (!entry.spec.description?.trim()) {
      issues.push(`${name} carries no description`);
    }
    if (typeof entry.spec.inputSchema !== "object") {
      issues.push(`${name} carries no input schema`);
    }
    if (!PERMISSION_CATEGORIES.includes(entry.spec.category)) {
      issues.push(
        `${name} carries no permission category ` +
          `(got ${JSON.stringify(entry.spec.category)})`
      );
    }
    if (typeof entry.impl !== "function") {
      issues.push(`${name} carries no implementation`);
    }
  }
  return issues;
}

/**
 * Modules declared with no loader, loaders nobody declared, and any module
 * whose exports fail {@link capabilityModuleIssues} — including a spec with no
 * category, which is the failure this whole mechanism exists to catch. Also
 * flags one name exported by two modules. Always empty in a healthy build; the
 * drift test asserts it.
 */
export async function capabilityModuleDrift(): Promise<readonly string[]> {
  const declared = new Set(DECLARED_CAPABILITY_MODULES);
  const implemented = new Set(Object.keys(MODULES));
  const drift: string[] = [];
  for (const name of declared) {
    if (!implemented.has(name)) {
      drift.push(`${name} is declared but not implemented`);
    }
  }
  for (const name of implemented) {
    if (!declared.has(name)) {
      drift.push(`${name} is implemented but not declared`);
    }
  }
  const owners = new Map<string, string>();
  for (const name of listCapabilityModules()) {
    const mod = await loadCapabilityModule(name);
    drift.push(...capabilityModuleIssues(name, mod));
    for (const entry of mod.exports) {
      const owner = owners.get(entry.spec.name);
      if (owner !== undefined) {
        drift.push(
          `${entry.spec.name} is exported by both ${owner} and ${name}`
        );
      } else {
        owners.set(entry.spec.name, name);
      }
    }
  }
  return drift.sort();
}
