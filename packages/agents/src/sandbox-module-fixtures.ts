/**
 * The guest module loading/denial contract, as data.
 *
 * One rule set governs sandbox imports, and it has to hold in two runtimes: the
 * server's QuickJS under vitest, and the browser's QuickJS under Playwright.
 * Written twice it drifts, so it is written once here — a plain array with no
 * imports beyond protocol types, importable from `@nodetool-ai/agents/
 * sandbox-module-fixtures` in either place.
 *
 * A fixture is: the modules the run declares, the code the guest runs, and what
 * must come back. `result` pins a returned value; `errorContains` pins the
 * substrings the failure must name — a denial that does not say *what* it
 * refused is a denial nobody can act on, so the message is part of the
 * contract, not an implementation detail.
 *
 * A denial can surface two ways, and which one is not itself the contract: a
 * static import fails the run, while code that catches its own `import()`
 * returns the message. `catchesError` marks the second kind, so the same
 * assertion covers both.
 */
import type {
  ResolvedSandboxModule,
  SandboxModuleResolution
} from "@nodetool-ai/protocol";

/** A digest is opaque to the loader; these fixtures never vary it. */
const DIGEST = "a".repeat(64);

/** One file of a fixture pack's module graph. */
export interface SandboxFixtureFile {
  id: string;
  source: string;
  internal?: boolean;
}

/** Build a JS module resolution entry from its files; the first is the entry. */
export function fixtureModule(
  specifier: string,
  packName: string,
  files: readonly SandboxFixtureFile[]
): ResolvedSandboxModule {
  const entry = files[0];
  if (entry === undefined) {
    throw new Error(`sandbox fixture ${specifier} has no entry file`);
  }
  return {
    specifier,
    packName,
    contentDigest: DIGEST,
    moduleId: entry.id,
    kind: "js",
    source: entry.source,
    graph: files.map((file) => ({
      id: file.id,
      kind: "js" as const,
      source: file.source,
      dependencies: [],
      internal: file.internal ?? false
    }))
  };
}

/** Wrap modules as the resolution a run hands the sandbox. */
export function fixtureResolution(
  modules: readonly ResolvedSandboxModule[]
): SandboxModuleResolution {
  return { modules: [...modules], statuses: [] };
}

/** The `@acme/geo` entry, whose only export needs an internal sibling to work. */
export const GEO_MODULE = fixtureModule("@acme/geo", "@acme/nodetool-geo", [
  {
    id: "sandbox/geo.js",
    source: `import { round } from "./internal/round.js";
export const haversine = (a, b) => round(Math.abs(a - b) * 111);`
  },
  {
    id: "sandbox/internal/round.js",
    source: "export const round = (n) => Math.round(n * 100) / 100;",
    internal: true
  }
]);

/** A second entry of the same pack, for the two-modules-one-pack case. */
export const GEO_EXTRA_MODULE = fixtureModule(
  "@acme/geo/extra",
  "@acme/nodetool-geo",
  [{ id: "sandbox/extra.js", source: "export const label = () => 'extra';" }]
);

/** An unrelated pack whose internal file must stay unreachable. */
export const OTHER_MODULE = fixtureModule("@other/pack", "@other/nodetool-pack", [
  { id: "sandbox/main.js", source: "export const hi = () => 'other';" },
  {
    id: "sandbox/internal/secret.js",
    source: "export const secret = () => 'secret';",
    internal: true
  }
]);

/** A module that reaches for a timer at its own top level. */
export const TIMER_MODULE = fixtureModule("@acme/timer", "@acme/nodetool-timer", [
  {
    id: "sandbox/timer.js",
    source: `setTimeout(() => {}, 0);
export const value = 1;`
  }
]);

/** A module that reaches for `eval` while it evaluates. */
export const EVIL_MODULE = fixtureModule("@acme/evil", "@acme/nodetool-evil", [
  { id: "sandbox/evil.js", source: 'export const value = eval("1 + 1");' }
]);

/** One case of the loading/denial contract. */
export interface SandboxModuleFixture {
  /** Stable id, used as the test name in both suites. */
  name: string;
  /** What the case demonstrates, for a reader of either suite. */
  description: string;
  /** The modules the run declares. */
  modules: readonly ResolvedSandboxModule[];
  /** The guest code to run. */
  code: string;
  /** The value the run must return, when it is meant to succeed. */
  result?: unknown;
  /** Substrings the failure must name, when it is meant to fail. */
  errorContains?: readonly string[];
  /**
   * The code catches the failure and returns its message, so the run succeeds
   * and `errorContains` is checked against the returned value.
   */
  catchesError?: boolean;
}

const GEO_ONLY = [GEO_MODULE];
const GEO_AND_OTHER = [GEO_MODULE, OTHER_MODULE];

export const SANDBOX_MODULE_FIXTURES: readonly SandboxModuleFixture[] = [
  {
    name: "declared-import",
    description: "a named export of a declared module is importable and callable",
    modules: GEO_ONLY,
    code: 'import { haversine } from "@acme/geo";\nreturn haversine(1, 3);',
    result: 222
  },
  {
    name: "two-modules-one-pack",
    description: "two entries of one pack both resolve",
    modules: [GEO_MODULE, GEO_EXTRA_MODULE],
    code: `import { haversine } from "@acme/geo";
import { label } from "@acme/geo/extra";
return label() + ":" + haversine(0, 1);`,
    result: "extra:111"
  },
  {
    name: "internal-helper",
    description:
      "a module's relative import of its own internal sibling resolves — the " +
      "answer is only right because ./internal/round.js ran",
    modules: GEO_ONLY,
    code: 'import { haversine } from "@acme/geo";\nreturn haversine(0, 0.001);',
    result: 0.11
  },
  {
    name: "deny-node-builtin",
    description: "a `node:*` specifier is denied by name",
    modules: GEO_AND_OTHER,
    code: 'import "node:buffer";\nreturn 1;',
    errorContains: ["node:buffer", "not a sandbox package this run serves"]
  },
  {
    name: "deny-compat-module",
    description:
      "a bare compat module the QuickJS wrapper itself warmed is still denied",
    modules: GEO_AND_OTHER,
    code: 'import "buffer";\nreturn 1;',
    errorContains: ["buffer", "not a sandbox package this run serves"]
  },
  {
    name: "deny-absolute-path",
    description: "an absolute path is not a specifier the loader serves",
    modules: GEO_AND_OTHER,
    code: 'import "/etc/passwd";\nreturn 1;',
    errorContains: ["/etc/passwd", "not a sandbox package this run serves"]
  },
  {
    name: "deny-relative-escape",
    description: "user code cannot climb out with `../`",
    modules: GEO_AND_OTHER,
    code: 'import "../secrets.js";\nreturn 1;',
    errorContains: ["../secrets.js", "not a sandbox package this run serves"]
  },
  {
    name: "deny-encoded-traversal",
    description: "percent-encoding the traversal does not decode into one",
    modules: GEO_AND_OTHER,
    code: 'import "%2e%2e/secrets.js";\nreturn 1;',
    errorContains: ["%2e%2e/secrets.js", "not a sandbox package this run serves"]
  },
  {
    name: "deny-undeclared-specifier",
    description: "a specifier the node did not declare is refused",
    modules: GEO_AND_OTHER,
    code: 'import "@acme/other";\nreturn 1;',
    errorContains: ["@acme/other", "not a sandbox package this run serves"]
  },
  {
    name: "deny-other-pack-internal",
    description: "another pack's internal file is not addressable",
    modules: GEO_AND_OTHER,
    code: 'import "@other/nodetool-pack/sandbox/internal/secret.js";\nreturn 1;',
    errorContains: ["sandbox/internal/secret.js", "not a sandbox package this run serves"]
  },
  {
    name: "deny-own-internal-from-user-code",
    description:
      "a declared module's internal file is for that module, not for user code",
    modules: GEO_ONLY,
    code: 'import "sandbox/internal/round.js";\nreturn 1;',
    errorContains: ["sandbox/internal/round.js"]
  },
  {
    name: "deny-dynamic-import-of-declared",
    description:
      "dynamic import() is denied even for a declared specifier a static " +
      "import already put in the module cache",
    modules: GEO_ONLY,
    code: `import { haversine } from "@acme/geo";
try {
  await import("@acme/geo");
  return "LOADED";
} catch (e) {
  return e.message;
}`,
    catchesError: true,
    errorContains: ["dynamic import()", "@acme/geo"]
  },
  {
    name: "deny-computed-dynamic-import",
    description: "a specifier assembled at run time is denied like any other",
    modules: GEO_ONLY,
    code: `try {
  await import("node:" + "buffer");
  return "LOADED";
} catch (e) {
  return e.message;
}`,
    catchesError: true,
    errorContains: ["dynamic import()", "node:buffer"]
  },
  {
    name: "deny-variable-dynamic-import",
    description: "a specifier held in a variable is denied like any other",
    modules: GEO_ONLY,
    code: `const target = ["f", "s"].join("");
try {
  await import(target);
  return "LOADED";
} catch (e) {
  return e.message;
}`,
    catchesError: true,
    errorContains: ["dynamic import()", "fs"]
  },
  {
    name: "harden-module-top-level-timer",
    description:
      "a module cannot use a timer at its own top level — dependencies " +
      "evaluate before the entry, so the entry's own deletions come too late",
    modules: [TIMER_MODULE],
    code: 'import { value } from "@acme/timer";\nreturn value;',
    errorContains: ["setTimeout"]
  },
  {
    name: "harden-module-eval",
    description: "a module cannot re-enter dynamic code generation with eval",
    modules: [EVIL_MODULE],
    code: 'import { value } from "@acme/evil";\nreturn value;',
    errorContains: ["eval"]
  }
];

/** One fixture by name, for a suite that drives a subset. */
export function sandboxModuleFixture(name: string): SandboxModuleFixture {
  const fixture = SANDBOX_MODULE_FIXTURES.find((entry) => entry.name === name);
  if (fixture === undefined) {
    throw new Error(`unknown sandbox module fixture: ${name}`);
  }
  return fixture;
}
