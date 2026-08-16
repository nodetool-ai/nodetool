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
  type CapabilityImpl,
  type CapabilityModule,
  type CapabilitySpec,
  type PermissionCategory
} from "./types.js";
import { agentsSpecs } from "./agents.specs.js";
import { appsSpecs } from "./apps.specs.js";
import { assetsSpecs } from "./assets.specs.js";
import { codeSpecs } from "./code.specs.js";
import { collectionsSpecs } from "./collections.specs.js";
import { documentsSpecs } from "./documents.specs.js";
import { emailSpecs } from "./email.specs.js";
import { filesSpecs } from "./files.specs.js";
import { googleSpecs } from "./google.specs.js";
import { jobsSpecs } from "./jobs.specs.js";
import { jsScriptsSpecs } from "./js-scripts.specs.js";
import { mediaSpecs } from "./media.specs.js";
import { memorySpecs } from "./memory.specs.js";
import { modelsSpecs } from "./models.specs.js";
import { nodesSpecs } from "./nodes.specs.js";
import { packsSpecs } from "./packs.specs.js";
import { scriptsSpecs } from "./scripts.specs.js";
import { sharedSpecs } from "./shared.specs.js";
import { sketchesSpecs } from "./sketches.specs.js";
import { storyboardsSpecs } from "./storyboards.specs.js";
import { styleSpecs } from "./style.specs.js";
import { threadsSpecs } from "./threads.specs.js";
import { timelinesSpecs } from "./timelines.specs.js";
import { uiSpecs } from "./ui.specs.js";
import { webSpecs } from "./web.specs.js";
import { workflowsSpecs } from "./workflows.specs.js";
import { isFunction, isString } from "../utils/type-guards.js";

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
  apps: () => import("./apps.js").then((m) => m.module),
  documents: () => import("./documents.js").then((m) => m.module),
  email: () => import("./email.js").then((m) => m.module),
  memory: () => import("./memory.js").then((m) => m.module),
  shared: () => import("./shared.js").then((m) => m.module),
  web: () => import("./web.js").then((m) => m.module),
  files: () => import("./files.js").then((m) => m.module),
  agents: () => import("./agents.js").then((m) => m.module),
  google: () => import("./google.js").then((m) => m.module),
  threads: () => import("./threads.js").then((m) => m.module),
  timelines: () => import("./timelines.js").then((m) => m.module),
  sketches: () => import("./sketches.js").then((m) => m.module),
  scripts: () => import("./scripts.js").then((m) => m.module),
  storyboards: () => import("./storyboards.js").then((m) => m.module),
  code: () => import("./code.js").then((m) => m.module),
  "js-scripts": () => import("./js-scripts.js").then((m) => m.module),
  packs: () => import("./packs.js").then((m) => m.module),
  ui: () => import("./ui.js").then((m) => m.module)
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
  "apps",
  "documents",
  "email",
  "memory",
  "shared",
  "web",
  "files",
  "agents",
  "google",
  "threads",
  "timelines",
  "sketches",
  "scripts",
  "storyboards",
  "code",
  "js-scripts",
  "packs",
  "ui"
];

/**
 * The eager half of the table: every module's specs, available synchronously.
 *
 * A spec file is data — the wire name, the description, the JSON schema, the
 * category, the message template — and imports nothing an implementation
 * needs, so importing all of them costs one object graph and no `import()`.
 * That is what lets a belt be assembled synchronously from the registry while
 * {@link MODULES} keeps every implementation behind a lazy import.
 *
 * Both halves list the same modules, and `capabilityModuleDrift` compares them
 * spec by spec, so the eager table cannot fall behind what a module exports.
 */
const MODULE_SPECS: Readonly<Record<string, readonly CapabilitySpec[]>> = {
  workflows: workflowsSpecs,
  models: modelsSpecs,
  media: mediaSpecs,
  style: styleSpecs,
  collections: collectionsSpecs,
  nodes: nodesSpecs,
  jobs: jobsSpecs,
  assets: assetsSpecs,
  apps: appsSpecs,
  documents: documentsSpecs,
  email: emailSpecs,
  memory: memorySpecs,
  shared: sharedSpecs,
  web: webSpecs,
  files: filesSpecs,
  agents: agentsSpecs,
  google: googleSpecs,
  threads: threadsSpecs,
  timelines: timelinesSpecs,
  sketches: sketchesSpecs,
  scripts: scriptsSpecs,
  storyboards: storyboardsSpecs,
  code: codeSpecs,
  "js-scripts": jsScriptsSpecs,
  packs: packsSpecs,
  ui: uiSpecs
};

const SPEC_BY_NAME: ReadonlyMap<string, CapabilitySpec> = new Map(
  Object.values(MODULE_SPECS).flatMap((specs) =>
    specs.map((spec) => [spec.name, spec] as const)
  )
);

const MODULE_OF_NAME: ReadonlyMap<string, string> = new Map(
  Object.entries(MODULE_SPECS).flatMap(([moduleName, specs]) =>
    specs.map((spec) => [spec.name, moduleName] as const)
  )
);

/** Every registered capability's spec, read without loading a module. */
export function listCapabilitySpecs(): readonly CapabilitySpec[] {
  return [...SPEC_BY_NAME.values()];
}

/** One module's specs, read without loading it. */
export function capabilityModuleSpecTable(
  moduleName: string
): readonly CapabilitySpec[] {
  return Object.hasOwn(MODULE_SPECS, moduleName)
    ? MODULE_SPECS[moduleName]
    : [];
}

/**
 * One capability's spec by wire name, synchronously. A miss means no module
 * declares that name — the belt builders treat it as a programming error.
 */
export function capabilitySpec(name: string): CapabilitySpec | undefined {
  return SPEC_BY_NAME.get(name);
}

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
  const moduleName = MODULE_OF_NAME.get(name);
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
      issues.push(`${entry.spec.name} is exported by ${moduleName} but carries no eager spec`);
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
    issues.push(`${name} has an eager spec but ${moduleName} exports no such capability`);
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
  for (const name of Object.keys(MODULE_SPECS)) {
    if (!implemented.has(name)) {
      drift.push(`${name} has an eager spec table but no loader`);
    }
  }
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
