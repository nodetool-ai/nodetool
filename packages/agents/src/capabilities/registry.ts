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
 *
 * What this table does *not* carry is the other half of the answer: which of
 * NodeTool's own API surfaces sandboxed code is deliberately kept away from,
 * and why. That lives in `packages/websocket/src/trpc/sandbox-coverage.ts`,
 * next to the router it classifies, and is checked against it by
 * `tests/sandbox-api-coverage.test.ts` — so adding a capability here and
 * leaving a surface unclassified there fails the build.
 */

import {
  PERMISSION_CATEGORIES,
  type CapabilityExport,
  type CapabilityImpl,
  type CapabilityModule,
  type CapabilitySpec,
  type PermissionCategory
} from "./types.js";
import { CAPABILITY_SPECS, capabilitySpec, capabilityModuleSpecTable, capabilityModuleOf } from "./metadata.js";
export { capabilitySpec, capabilityModuleSpecTable, capabilityModuleOf, listCapabilitySpecs } from "./metadata.js";
import { permissionCategoryFor } from "../tools/tool-permissions.js";
import { isFunction, isString } from "../utils/type-guards.js";

type Loader = () => Promise<CapabilityModule>;

/** Lazy implementations refer to the independent eager metadata table. */
interface CapabilityModuleEntry {
  readonly loader: Loader;
  readonly specs: readonly CapabilitySpec[];
}

const CAPABILITY_MODULES: Readonly<Record<string, CapabilityModuleEntry>> = {
  workflows: {
    loader: () => import("./workflows.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["workflows"]
  },
  models: {
    loader: () => import("./models.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["models"]
  },
  media: {
    loader: () => import("./media.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["media"]
  },
  collections: {
    loader: () => import("./collections.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["collections"]
  },
  costs: {
    loader: () => import("./costs.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["costs"]
  },
  nodes: {
    loader: () => import("./nodes.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["nodes"]
  },
  jobs: {
    loader: () => import("./jobs.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["jobs"]
  },
  errors: {
    loader: () => import("./errors.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["errors"]
  },
  runs: {
    loader: () => import("./runs.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["runs"]
  },
  generations: {
    loader: () => import("./generations.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["generations"]
  },
  assets: {
    loader: () => import("./assets.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["assets"]
  },
  browser: {
    loader: () => import("./browser.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["browser"]
  },
  apps: {
    loader: () => import("./apps.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["apps"]
  },
  documents: {
    loader: () => import("./documents.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["documents"]
  },
  email: {
    loader: () => import("./email.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["email"]
  },
  memory: {
    loader: () => import("./memory.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["memory"]
  },
  shared: {
    loader: () => import("./shared.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["shared"]
  },
  web: {
    loader: () => import("./web.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["web"]
  },
  "video-production": {
    loader: () => import("./video-production.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["video-production"]
  },
  files: {
    loader: () => import("./files.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["files"]
  },
  agents: {
    loader: () => import("./agents.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["agents"]
  },
  google: {
    loader: () => import("./google.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["google"]
  },
  threads: {
    loader: () => import("./threads.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["threads"]
  },
  projects: {
    loader: () => import("./projects.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["projects"]
  },
  "example-timelines": {
    loader: () => import("./example-timelines.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["example-timelines"]
  },
  timelines: {
    loader: () => import("./timelines.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["timelines"]
  },
  sketches: {
    loader: () => import("./sketches.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["sketches"]
  },
  model3d: {
    loader: () => import("./model3d.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["model3d"]
  },
  game: {
    loader: () => import("./game.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["game"]
  },
  scripts: {
    loader: () => import("./scripts.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["scripts"]
  },
  storyboards: {
    loader: () => import("./storyboards.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["storyboards"]
  },
  entities: {
    loader: () => import("./entities.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["entities"]
  },
  compositions: {
    loader: () => import("./compositions.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["compositions"]
  },
  code: {
    loader: () => import("./code.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["code"]
  },
  flow: {
    loader: () => import("./flow.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["flow"]
  },
  "js-scripts": {
    loader: () => import("./js-scripts.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["js-scripts"]
  },
  packs: {
    loader: () => import("./packs.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["packs"]
  },
  ui: {
    loader: () => import("./ui.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["ui"]
  },
  apify: {
    loader: () => import("./apify.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["apify"]
  },
  serpapi: {
    loader: () => import("./serpapi.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["serpapi"]
  },
  settings: {
    loader: () => import("./settings.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["settings"]
  },
  skills: {
    loader: () => import("./skills.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["skills"]
  },
  analysis: {
    loader: () => import("./analysis.js").then((m) => m.module),
    specs: CAPABILITY_SPECS["analysis"]
  }
} satisfies Readonly<Record<keyof typeof CAPABILITY_SPECS, CapabilityModuleEntry>>;

/**
 * The namespaces this build declares, in the order {@link CAPABILITY_MODULES}
 * lists them — the module list a reviewer reads.
 */
export const DECLARED_CAPABILITY_MODULES: readonly string[] =
  Object.keys(CAPABILITY_MODULES);

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
  const loader = Object.hasOwn(CAPABILITY_MODULES, moduleName)
    ? CAPABILITY_MODULES[moduleName].loader
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

/**
 * One capability's implementation, loading only the module that owns it.
 *
 * The eager spec table says which module that is, so a belt built from specs
 * pays for one `import()` at first invoke instead of the whole table the way
 * {@link findCapability} does.
 */
export async function loadCapabilityImpl(
  name: string
): Promise<CapabilityImpl> {
  const moduleName = capabilityModuleOf(name);
  if (moduleName === undefined) {
    throw new Error(`no capability is registered for "${name}"`);
  }
  const mod = await loadCapabilityModule(moduleName);
  const entry = mod.exports.find((candidate) => candidate.spec.name === name);
  if (entry === undefined) {
    throw new Error(
      `capability module "${moduleName}" declares "${name}" but exports no ` +
        `implementation for it`
    );
  }
  return entry.impl;
}

/** Module names this process can serve. */
export function listCapabilityModules(): readonly string[] {
  return Object.keys(CAPABILITY_MODULES).sort();
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

/**
 * The permission category for a tool name: the registered spec's, else the
 * hand-written map for a `Tool` class that is not a capability (`run_node`,
 * the plan-builder tools, `finish_step`), else the conservative `external`.
 *
 * This is the one lookup a host or a test should use. `permissionCategoryFor`
 * alone answers only the map, and the map holds only what has no spec.
 */
export function capabilityCategoryFor(name: string): PermissionCategory {
  return capabilitySpec(name)?.category ?? permissionCategoryFor(name);
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
    if (!isString(name) || name.trim() === "") {
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
    if (!isFunction(entry.impl)) {
      issues.push(`${name} carries no implementation`);
    }
  }
  return issues;
}

/**
 * What the eager spec table says about one module against what the module
 * itself exports. The two halves are meant to be one object per capability, so
 * anything but identity is drift: a name only one half has, or a spec the
 * module rebuilt instead of importing from its `.specs.ts` sibling.
 *
 * Identity, not deep equality, on purpose. A module that copies its spec would
 * pass a field-by-field check and still be two things to keep in step.
 */
export function eagerSpecDrift(
  moduleName: string,
  mod: CapabilityModule
): readonly string[] {
  const issues: string[] = [];
  const eager = new Map(
    capabilityModuleSpecTable(moduleName).map((spec) => [spec.name, spec])
  );
  for (const entry of mod.exports) {
    const spec = eager.get(entry.spec.name);
    if (spec === undefined) {
      issues.push(
        `${entry.spec.name} is exported by ${moduleName} but carries no eager spec`
      );
      continue;
    }
    if (spec !== entry.spec) {
      issues.push(
        `${entry.spec.name} has a different spec object in ${moduleName}.specs.ts than in ${moduleName}.ts`
      );
    }
    eager.delete(entry.spec.name);
  }
  for (const name of eager.keys()) {
    issues.push(
      `${name} has an eager spec but ${moduleName} exports no such capability`
    );
  }
  return issues;
}

/**
 * Any module whose exports fail {@link capabilityModuleIssues} — including a
 * spec with no category, which is the failure this whole mechanism exists to
 * catch — or {@link eagerSpecDrift}. Also flags one name exported by two
 * modules. Always empty in a healthy build; the drift test asserts it.
 *
 * The loader table is checked against the metadata namespaces by TypeScript.
 * This walk checks each loaded implementation against its eager spec objects.
 */
export async function capabilityModuleDrift(): Promise<readonly string[]> {
  const drift: string[] = [];
  const owners = new Map<string, string>();
  for (const name of listCapabilityModules()) {
    const mod = await loadCapabilityModule(name);
    drift.push(...capabilityModuleIssues(name, mod));
    drift.push(...eagerSpecDrift(name, mod));
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

const lazyCapabilities = new Map<string, CapabilityExport>();

/** Resolve eager metadata while keeping implementation loading lazy. */
export function capabilityForName(name: string): CapabilityExport {
  const cached = lazyCapabilities.get(name);
  if (cached) {
    return cached;
  }
  const spec = capabilitySpec(name);
  if (!spec) {
    throw new Error(`no capability is registered for "${name}"`);
  }
  const entry: CapabilityExport = {
    spec,
    impl: async (run, args) => (await loadCapabilityImpl(name))(run, args)
  };
  lazyCapabilities.set(name, entry);
  return entry;
}
