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
import { permissionCategoryFor } from "../tools/tool-permissions.js";
import { agentsSpecs } from "./agents.specs.js";
import { analysisSpecs } from "./analysis.specs.js";
import { apifySpecs } from "./apify.specs.js";
import { appsSpecs } from "./apps.specs.js";
import { assetsSpecs } from "./assets.specs.js";
import { browserSpecs } from "./browser.specs.js";
import { codeSpecs } from "./code.specs.js";
import { collectionsSpecs } from "./collections.specs.js";
import { compositionsSpecs } from "./compositions.specs.js";
import { costsSpecs } from "./costs.specs.js";
import { documentsSpecs } from "./documents.specs.js";
import { emailSpecs } from "./email.specs.js";
import { entitiesSpecs } from "./entities.specs.js";
import { filesSpecs } from "./files.specs.js";
import { flowSpecs } from "./flow.specs.js";
import { generationsSpecs } from "./generations.specs.js";
import { googleSpecs } from "./google.specs.js";
import { jobsSpecs } from "./jobs.specs.js";
import { jsScriptsSpecs } from "./js-scripts.specs.js";
import { mediaSpecs } from "./media.specs.js";
import { memorySpecs } from "./memory.specs.js";
import { model3dSpecs } from "./model3d.specs.js";
import { godotSpecs } from "./godot.specs.js";
import { modelsSpecs } from "./models.specs.js";
import { nodesSpecs } from "./nodes.specs.js";
import { packsSpecs } from "./packs.specs.js";
import { scriptsSpecs } from "./scripts.specs.js";
import { serpApiSpecs } from "./serpapi.specs.js";
import { settingsSpecs } from "./settings.specs.js";
import { sharedSpecs } from "./shared.specs.js";
import { skillsSpecs } from "./skills.specs.js";
import { sketchesSpecs } from "./sketches.specs.js";
import { storyboardsSpecs } from "./storyboards.specs.js";
import { threadsSpecs } from "./threads.specs.js";
import { timelinesSpecs } from "./timelines.specs.js";
import { uiSpecs } from "./ui.specs.js";
import { webSpecs } from "./web.specs.js";
import { workflowsSpecs } from "./workflows.specs.js";
import { isFunction, isString } from "../utils/type-guards.js";

type Loader = () => Promise<CapabilityModule>;

/**
 * One entry per namespace: the lazy loader and the eager spec table, together
 * — the reviewer's declaration, the loader table, and the spec table used to
 * be three separately-maintained lists of the same 37 names, kept in sync by
 * a drift check whose only job was noticing when they were not.
 *
 * A spec file is data — the wire name, the description, the JSON schema, the
 * category, the message template — and imports nothing an implementation
 * needs, so importing all of them costs one object graph and no `import()`.
 * That is what lets a belt be assembled synchronously from `specs` while
 * `loader` stays a lazy import — {@link eagerSpecDrift} still checks that a
 * module's own exports carry the *same* spec objects as its `.specs.ts`
 * sibling, which a single table cannot guarantee by construction.
 */
interface CapabilityModuleEntry {
  readonly loader: Loader;
  readonly specs: readonly CapabilitySpec[];
}

const CAPABILITY_MODULES: Readonly<Record<string, CapabilityModuleEntry>> = {
  workflows: {
    loader: () => import("./workflows.js").then((m) => m.module),
    specs: workflowsSpecs
  },
  models: {
    loader: () => import("./models.js").then((m) => m.module),
    specs: modelsSpecs
  },
  media: {
    loader: () => import("./media.js").then((m) => m.module),
    specs: mediaSpecs
  },
  collections: {
    loader: () => import("./collections.js").then((m) => m.module),
    specs: collectionsSpecs
  },
  costs: {
    loader: () => import("./costs.js").then((m) => m.module),
    specs: costsSpecs
  },
  nodes: {
    loader: () => import("./nodes.js").then((m) => m.module),
    specs: nodesSpecs
  },
  jobs: {
    loader: () => import("./jobs.js").then((m) => m.module),
    specs: jobsSpecs
  },
  generations: {
    loader: () => import("./generations.js").then((m) => m.module),
    specs: generationsSpecs
  },
  assets: {
    loader: () => import("./assets.js").then((m) => m.module),
    specs: assetsSpecs
  },
  browser: {
    loader: () => import("./browser.js").then((m) => m.module),
    specs: browserSpecs
  },
  apps: {
    loader: () => import("./apps.js").then((m) => m.module),
    specs: appsSpecs
  },
  documents: {
    loader: () => import("./documents.js").then((m) => m.module),
    specs: documentsSpecs
  },
  email: {
    loader: () => import("./email.js").then((m) => m.module),
    specs: emailSpecs
  },
  memory: {
    loader: () => import("./memory.js").then((m) => m.module),
    specs: memorySpecs
  },
  shared: {
    loader: () => import("./shared.js").then((m) => m.module),
    specs: sharedSpecs
  },
  web: {
    loader: () => import("./web.js").then((m) => m.module),
    specs: webSpecs
  },
  files: {
    loader: () => import("./files.js").then((m) => m.module),
    specs: filesSpecs
  },
  agents: {
    loader: () => import("./agents.js").then((m) => m.module),
    specs: agentsSpecs
  },
  google: {
    loader: () => import("./google.js").then((m) => m.module),
    specs: googleSpecs
  },
  threads: {
    loader: () => import("./threads.js").then((m) => m.module),
    specs: threadsSpecs
  },
  timelines: {
    loader: () => import("./timelines.js").then((m) => m.module),
    specs: timelinesSpecs
  },
  sketches: {
    loader: () => import("./sketches.js").then((m) => m.module),
    specs: sketchesSpecs
  },
  model3d: {
    loader: () => import("./model3d.js").then((m) => m.module),
    specs: model3dSpecs
  },
  godot: {
    loader: () => import("./godot.js").then((m) => m.module),
    specs: godotSpecs
  },
  scripts: {
    loader: () => import("./scripts.js").then((m) => m.module),
    specs: scriptsSpecs
  },
  storyboards: {
    loader: () => import("./storyboards.js").then((m) => m.module),
    specs: storyboardsSpecs
  },
  entities: {
    loader: () => import("./entities.js").then((m) => m.module),
    specs: entitiesSpecs
  },
  compositions: {
    loader: () => import("./compositions.js").then((m) => m.module),
    specs: compositionsSpecs
  },
  code: {
    loader: () => import("./code.js").then((m) => m.module),
    specs: codeSpecs
  },
  flow: {
    loader: () => import("./flow.js").then((m) => m.module),
    specs: flowSpecs
  },
  "js-scripts": {
    loader: () => import("./js-scripts.js").then((m) => m.module),
    specs: jsScriptsSpecs
  },
  packs: {
    loader: () => import("./packs.js").then((m) => m.module),
    specs: packsSpecs
  },
  ui: {
    loader: () => import("./ui.js").then((m) => m.module),
    specs: uiSpecs
  },
  apify: {
    loader: () => import("./apify.js").then((m) => m.module),
    specs: apifySpecs
  },
  serpapi: {
    loader: () => import("./serpapi.js").then((m) => m.module),
    specs: serpApiSpecs
  },
  settings: {
    loader: () => import("./settings.js").then((m) => m.module),
    specs: settingsSpecs
  },
  skills: {
    loader: () => import("./skills.js").then((m) => m.module),
    specs: skillsSpecs
  },
  analysis: {
    loader: () => import("./analysis.js").then((m) => m.module),
    specs: analysisSpecs
  }
};

/**
 * The namespaces this build declares, in the order {@link CAPABILITY_MODULES}
 * lists them — the module list a reviewer reads.
 */
export const DECLARED_CAPABILITY_MODULES: readonly string[] = Object.keys(
  CAPABILITY_MODULES
);

const SPEC_BY_NAME: ReadonlyMap<string, CapabilitySpec> = new Map(
  Object.values(CAPABILITY_MODULES).flatMap((entry) =>
    entry.specs.map((spec) => [spec.name, spec] as const)
  )
);

const MODULE_OF_NAME: ReadonlyMap<string, string> = new Map(
  Object.entries(CAPABILITY_MODULES).flatMap(([moduleName, entry]) =>
    entry.specs.map((spec) => [spec.name, moduleName] as const)
  )
);

/**
 * The module that owns one capability, by wire name — the namespace a guest
 * imports it from. `undefined` for a name no module declares (a session tool,
 * an external MCP tool), which is how a caller tells the two apart.
 */
export function capabilityModuleOf(name: string): string | undefined {
  return MODULE_OF_NAME.get(name);
}

/** Every registered capability's spec, read without loading a module. */
export function listCapabilitySpecs(): readonly CapabilitySpec[] {
  return [...SPEC_BY_NAME.values()];
}

/** One module's specs, read without loading it. */
export function capabilityModuleSpecTable(
  moduleName: string
): readonly CapabilitySpec[] {
  return Object.hasOwn(CAPABILITY_MODULES, moduleName)
    ? CAPABILITY_MODULES[moduleName].specs
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
 * Any module whose exports fail {@link capabilityModuleIssues} — including a
 * spec with no category, which is the failure this whole mechanism exists to
 * catch — or {@link eagerSpecDrift}. Also flags one name exported by two
 * modules. Always empty in a healthy build; the drift test asserts it.
 *
 * A declared module with no loader or a loader nobody declared cannot occur:
 * both come from the same {@link CAPABILITY_MODULES} entry now, so there is
 * nothing left to compare two lists for.
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
