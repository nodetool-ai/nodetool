# TypeScript 7 migration plan

> This document is the implementation contract for moving NodeTool's
> command-line compiler to TypeScript 7 while retaining TypeScript 6 for tools
> that use the compiler API.

## Problem statement

NodeTool's root dependency range resolves to TypeScript 5.9, so package builds,
application type-checks, and most local `tsc` commands use the JavaScript-based
compiler. TypeScript 7 provides a native `tsc`, parallel checking, and lower
build latency, but TypeScript 7.0 does not expose the compiler API. NodeTool
scripts and development tools import that API.

A direct replacement of `typescript` with version 7 would break API consumers,
make the compiler selected by bare `tsc` commands depend on npm bin-link order,
and bypass assumptions in the current compiler runners. The migration needs a
side-by-side compiler topology, a single executable-selection boundary, and a
staged cutover that keeps every merged step green.

## Goal

Use TypeScript 7.0.2 for NodeTool's command-line builds and type-checks. Keep
`@typescript/typescript6` available through the package name `typescript` for
compiler-API consumers and an explicit fallback command. Apply the same policy
to the root workspaces and the separate mobile, marketing, and Chrome-extension
dependency trees where their toolchains require it.

Completion means:

- normal repository build and type-check commands run the TypeScript 7 native
  compiler.
- scripts, linters, test transformers, and other API consumers load TypeScript
  6 without invalid peer dependencies.
- clean, incremental, project-reference, watch, and declaration builds retain
  their required behavior.
- every TypeScript surface has an explicit version policy and lockfile.
- CI identifies the compiler it ran and can select TypeScript 6 as a rollback.
- the required post-change verification commands pass.

## Current state

The implementation task must re-run these inventories. Do not rely on a stored
count because manifests and compiler entry points change.

```bash
rg -n '"typescript"\s*:' --glob 'package.json' --glob '!**/node_modules/**'
rg -n '\btsc\b|typescript/bin|typescript/lib' \
  --glob '!**/node_modules/**' --glob '!electron/backend-bundle/**'
rg -n "(?:from|require\(|import\()\s*['\"]typescript['\"]|typescript/lib" \
  --glob '!**/node_modules/**' --glob '!electron/backend-bundle/**'
rg -n '"(baseUrl|moduleResolution|esModuleInterop|ignoreDeprecations)"\s*:' \
  --glob 'tsconfig*.json' --glob '!**/node_modules/**'
npm ls typescript --all
```

Known compiler-API consumers include:

- `scripts/check-workspace-deps.mjs`
- `scripts/sync-base-node-metadata.mjs`
- `scripts/generate-node-docs.mjs`
- `packages/base-nodes/scripts/classify.ts`
- `packages/telegram/tests/dependency-cone.test.ts`
- `typescript-eslint`, `@typescript-eslint/*`, `ts-jest`, `ts-node`, and
  TypeScript-based documentation tooling

Known executable assumptions include:

- `scripts/build-typescript-workspace.mjs` executes
  `node_modules/typescript/bin/tsc` through Node.
- `scripts/run-tsc.mjs` searches for the same JavaScript entry point and adds a
  V8 heap limit.
- package scripts invoke bare `tsc` for lint, build, type-check, and watch.
- mobile, marketing, and the Chrome extension have independent package locks.

Known TypeScript 7 configuration blockers include:

- `web/tsconfig.json` sets `esModuleInterop` to `false`.
- `web/tsconfig.node.json` and `electron/tsconfig.test.json` use legacy
  `moduleResolution: "node"`.
- `electron/tsconfig.test.json`, `demo/tsconfig.json`, and
  `examples/chat_app/tsconfig.json` use `baseUrl`.
- some configs depend on implicit `@types` inclusion, while TypeScript 7
  defaults `types` to an empty list.
- Next.js configs declare language-service plugins that TypeScript 7.0 cannot
  host through a public API.

Generated contents under `electron/backend-bundle/` are build artifacts, not
migration inputs. Fix their source or bundling step instead of editing bundled
package manifests.

## External constraints

- [TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
  is the native compiler release and documents the side-by-side installation.
- [TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)
  is the compatibility bridge. Its `stableTypeOrdering` mode exposes ordering
  differences before the TypeScript 7 cutover.
- [`@typescript/typescript6`](https://www.npmjs.com/package/%40typescript/typescript6)
  exports the TypeScript 6 API and a `tsc6` executable.
- [TypeScript 7 intentional changes](https://github.com/microsoft/typescript-go/blob/main/CHANGES.md)
  define accepted differences between the JavaScript and native compilers.

Re-check the stable patch releases before implementation. If a newer 7.0 patch
exists, use it only after reviewing its release notes. Do not adopt a 7.1
prerelease as part of this migration.

## User stories

### US1: Faster command-line feedback

As a NodeTool developer, I can run the existing build and type-check commands
through the native compiler without learning a second command set.

Acceptance criteria:

- `npm run build:packages`, `npm run typecheck`, and package-local compiler
  commands identify TypeScript 7 as their command-line compiler.
- cold and warm measurements are captured for TypeScript 6 and 7 on the same
  machine and input.
- the native path does not inherit obsolete V8 heap configuration.

### US2: Existing compiler integrations keep working

As a maintainer of NodeTool scripts and test tooling, I can continue importing
`typescript` and receive the supported TypeScript 6 API.

Acceptance criteria:

- every direct `typescript` import resolves to `@typescript/typescript6`.
- `typescript-eslint`, `ts-jest`, `ts-node`, and documentation scripts run
  without peer-dependency warnings caused by TypeScript 7.
- no API consumer imports `@typescript/native`.

### US3: Builds remain reproducible

As a release maintainer, I can install dependencies from each lockfile and get
the same compiler roles on supported operating systems.

Acceptance criteria:

- compiler and compatibility-package versions are exact pins during the
  migration.
- root and standalone lockfiles contain the intended platform packages.
- a repository check fails when a workspace reintroduces an unapproved
  TypeScript range or direct compiler path.

### US4: The cutover is reversible

As a CI or release maintainer, I can rerun a failing compiler step with
TypeScript 6 without editing manifests or regenerating the lockfile.

Acceptance criteria:

- the shared launcher accepts an explicit compiler selection.
- CI and local scripts expose a documented TypeScript 6 fallback command.
- selection errors name the missing package and corrective install command.

## Implementation decisions

### D1: Separate the compiler from the compiler API

The target root topology is:

```json
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@7.0.2",
    "typescript": "npm:@typescript/typescript6@6.0.2"
  }
}
```

`@typescript/native` owns command-line compilation. The package name
`typescript` remains the TypeScript 6 compatibility API because third-party
tools import that name and declare a TypeScript 6 peer range.

Use exact versions for the initial cutover. A later dependency update can
restore a compatible range after CI has exercised the native compiler.

### D2: Select compilers through one launcher

Create a shared executable resolver used by
`scripts/build-typescript-workspace.mjs` and `scripts/run-tsc.mjs`. It must:

- select TypeScript 6 or 7 explicitly.
- read package metadata instead of assuming `typescript/bin/tsc`.
- spawn JavaScript compiler entry points through Node and native executables
  directly.
- prefer a standalone project's local installation before the repository root.
- forward arguments, environment, signals, stdout, stderr, and exit status.
- add `NODETOOL_TSC_HEAP_MB` only to the TypeScript 6 JavaScript process.
- produce a clear error when the selected compiler is absent.

Use one environment variable, `NODETOOL_TSC_VERSION=6|7`, for low-level
selection. Repository scripts provide named commands so developers do not need
to set it for normal work. Keep version 6 as the default until the cutover task.

### D3: Treat the migration as expand, migrate, contract

The launcher and dual-compiler dependencies are the expansion. Backend,
application, and standalone surfaces migrate in independently verifiable
cohorts. The final cutover changes the default to 7 and contracts direct
compiler paths. TypeScript 6 remains as the API package and rollback compiler,
so removing it is not part of this work.

### D4: Fix configuration behavior under TypeScript 6 first

Run TypeScript 6 with `--stableTypeOrdering` and without
`ignoreDeprecations`. Fix errors rather than suppressing them. Do not leave
`stableTypeOrdering` in normal commands after parity is established because it
exists for migration diagnosis and slows the JavaScript compiler.

Adopt TypeScript 7-compatible settings before switching the default:

- replace `moduleResolution: "node"` with `bundler` for bundled applications
  or `nodenext` with a matching `module` for Node applications.
- remove `baseUrl` and make each `paths` target explicitly relative.
- remove `esModuleInterop: false` without disabling synthetic default imports.
- declare each project's required global types.
- enable `noUncheckedSideEffectImports` explicitly and add declarations for
  valid asset imports instead of weakening the option.
- retain explicit `rootDir` on emitting projects.
- remove deprecated or ignored options instead of setting
  `ignoreDeprecations`.

Do not change `strict`, `skipLibCheck`, `exactOptionalPropertyTypes`, runtime
targets, or module formats unless a TypeScript 7 incompatibility requires a
targeted change.

### D5: Keep fixes local to the exposed incompatibility

TypeScript 6 or 7 may report new inference errors. Add an explicit type
argument, annotation, import, or module declaration at the narrowest boundary.
Do not introduce `any`, non-null assertions, broad casts, `@ts-ignore`, or
weaker compiler settings.

### D6: Compare behavior, not byte ordering

TypeScript 7 can change declaration ordering. A byte-for-byte `.d.ts` diff is
diagnostic, not an acceptance gate. Review differences and require the same
exports, types, runtime module format, source-map availability, package files,
and consumer test behavior.

### D7: Keep editor plugins on TypeScript 6 where required

TypeScript 7.0 does not expose the language-service API used by some Next.js
and embedded-language plugins. CLI builds and type-checks use TypeScript 7.
Editors may use the TypeScript 6 workspace service for those projects until
TypeScript 7.1 and the relevant plugins are supported. Document the split. Do
not remove plugin configuration merely to make the TypeScript 7 CLI quiet.

### D8: Tune native parallelism only from measurements

Turbo already runs package builds concurrently. TypeScript 7 also parallelizes
checking and project-reference builds. Measure the combinations before setting
`--checkers` or `--builders`. Start package-local Turbo builds with conservative
native concurrency, then raise it only when wall time improves without
exceeding CI memory. Keep the selected values configurable rather than tied to
a developer workstation's core count.

### D9: Include standalone dependency trees

The root lockfile does not control `mobile/`, `marketing/`, or
`chrome-extension/`. Each has its own migration and verification step.
Standalone projects that have compiler-API tooling use the same dual-package
topology. A project with no API consumer may depend directly on TypeScript 7,
but the task must prove that with `npm ls` and its full checks.

## Milestones and dependency graph

```text
M1 Compatibility foundation
T1 Baseline and inventory
 └─> T2 Compiler launcher expansion
      └─> T3 TypeScript 6 and configuration bridge
           └─> T4 Dual-compiler topology and shadow lane

M2 Cohort migration
T4 ──> T5 Backend packages and project references ──┐
 ├──> T6 Web, Electron, demo, and examples ─────────┼──> T8 Default cutover and CI
 └──> T7 Mobile, marketing, and Chrome extension ──┘

M3 Completion
T8 ──> T9 Contract checks, documentation, and final verification
```

T5, T6, and T7 can run in parallel after T4. All other blocking edges are
intentional.

## Tickets

Each ticket is self-contained for an implementation agent. The implementation
notes name the expected path. The checkboxes are the merge criteria.

### T1 — Capture the compiler inventory and baseline

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**What to build:** Produce reproducible evidence for compiler selection,
current behavior, and performance before changing dependencies.

**Implementation notes:**

1. Run the inventory commands in [Current state](#current-state).
2. Classify every result as command-line compiler, compiler-API consumer,
   configuration, generated artifact, or documentation.
3. Record the actual version used by root, package-local, web, Electron,
   mobile, marketing, and Chrome-extension commands.
4. Run clean and warm baselines for `build:packages`, the root type-check,
   `build:packages:tsc`, and representative package builds. Capture exit status,
   wall time, and peak memory where the runner supports it.
5. Save command output as PR evidence. Do not add transient timings or counts to
   repository guidance.
6. Identify existing failures before the migration. Do not attribute them to
   the compiler change.

**Acceptance criteria:**

- [ ] Each TypeScript surface has a named owning manifest, lockfile, tsconfig, and
  verification command.
- [ ] Every direct compiler path and API import is classified.
- [ ] All baseline commands have recorded exit statuses.
- [ ] The task changes no production behavior.

### T2 — Add a version-aware compiler launcher

**Blocked by:** T1 — Capture the compiler inventory and baseline.

**Status:** ready-for-agent

**What to build:** Make JavaScript and native compiler execution explicit
through one launcher while the default remains unchanged.

**Primary files:**

- `scripts/run-tsc.mjs`
- `scripts/build-typescript-workspace.mjs`
- `scripts/__tests__/run-tsc.test.mjs`
- the matching build-workspace script tests
- root and workspace npm scripts that invoke bare `tsc`
- `scripts/create-pack.mjs`, which generates compiler scripts for new packages

**Implementation notes:**

1. Extract package and executable resolution into one small module.
2. Support TypeScript 6's `tsc` or `tsc6` entry and TypeScript 7's native
   `tsc` entry without assuming either is a Node script.
3. Add `NODETOOL_TSC_VERSION` validation and named script entry points.
4. Route repository-owned root and workspace package scripts through the
   launcher so npm bin-link order cannot select a compiler. Include build,
   no-emit, lint, watch, Electron, examples, and generated package templates.
5. Preserve nearest-install behavior for mobile and other standalone trees.
6. Preserve exit codes and signal handling.
7. Apply the V8 heap limit only when launching the JavaScript compiler.
8. Update tests to execute a JavaScript stub and a native-style executable
   stub. Prove arguments, environment, working directory, exit status, and
   missing-package errors.
9. Keep compiler 6 as the default in this task.

**Acceptance criteria:**

- [ ] Existing compiler commands still select the current compiler.
- [ ] Both executable kinds are covered through subprocess behavior tests.
- [ ] A non-zero compiler exit remains non-zero at the npm command boundary.
- [ ] Mobile-local resolution still wins over the root installation.
- [ ] No owned root or workspace command invokes a direct compiler path or bare
  `tsc`. Documented user examples and standalone projects assigned to T7 are
  reported separately.

### T3 — Make all configurations TypeScript 6 and 7 compatible

**Blocked by:** T2 — Add a version-aware compiler launcher.

**Status:** ready-for-agent

**What to build:** Remove deprecated configuration and surface TypeScript 7
defaults under the TypeScript 6 compiler.

**Primary files:**

- `tsconfig.base.json`
- `web/tsconfig*.json`
- `electron/tsconfig*.json`
- `demo/tsconfig.json`
- `examples/*/tsconfig.json`
- standalone project tsconfigs
- manifests and lockfiles needed to run the TypeScript 6 bridge

**Implementation notes:**

1. Install the supported TypeScript 6 bridge version and regenerate the
   relevant lockfiles.
2. Run every type-check with `--stableTypeOrdering` and no deprecation
   suppression.
3. Replace legacy module resolution according to D4.
4. Remove `baseUrl` and preserve every alias with project-relative `paths`.
5. Remove the false interop setting and verify runtime imports through existing
   tests and builds.
6. Add explicit `types` lists based on actual global usage.
7. Enable `noUncheckedSideEffectImports`. Add narrow `*.css`, media, worker, or
   other asset declarations where required.
8. Audit for removed import assertion syntax and deprecated namespace syntax.
9. Fix new inference errors without weakening repository TypeScript rules.
10. Run TypeScript 6 twice from a clean state to check stable diagnostics and
    declaration output.

**Acceptance criteria:**

- [ ] TypeScript 6 passes every existing compiler command with stable ordering.
- [ ] No tsconfig contains `ignoreDeprecations`, `baseUrl`, legacy `node`/`node10`
  module resolution, or `esModuleInterop: false`.
- [ ] Every emitting project has an explicit `rootDir`.
- [ ] Required global and asset types are explicit.
- [ ] TypeScript 5 is no longer required to pass any in-scope surface.

### T4 — Install both compilers and add a TypeScript 7 shadow lane

**Blocked by:** T3 — Make all configurations TypeScript 6 and 7 compatible.

**Status:** ready-for-agent

**What to build:** Make TypeScript 7 runnable everywhere without changing the
default compiler.

**Primary files:**

- root and workspace `package.json` files
- `package-lock.json`
- compiler runner and version-contract tests
- root npm scripts

**Implementation notes:**

1. Set `typescript` to the exact `@typescript/typescript6` npm alias wherever a
   root-workspace tool or direct import needs the API.
2. Add the exact TypeScript 7 package through the `@typescript/native` alias at
   the root.
3. Align workspace declarations so npm does not install nested TypeScript 5
   copies.
4. Regenerate the root lockfile and inspect platform-specific native packages.
5. Add explicit `typecheck:ts6`, `typecheck:ts7`, `build:tsc6`, and
   `build:tsc7` migration commands, or equivalent named entry points.
6. Add a contract test proving command selection and API selection:
   `tsc` role is 7, `tsc6` role is 6, and `import "typescript"` exposes the
   TypeScript 6 API.
7. Run `npm ls` and resolve invalid compiler peer dependencies without using
   `--force` or `--legacy-peer-deps`.
8. Keep normal build and type-check commands on compiler 6 until T8.

**Acceptance criteria:**

- [ ] A clean `npm ci` installs both compiler roles.
- [ ] Named TypeScript 6 and 7 commands report the expected major versions.
- [ ] Direct API imports and type-aware lint/test tooling still use TypeScript 6.
- [ ] The lockfile has no unintended nested TypeScript 5 installation owned by a
  NodeTool workspace.
- [ ] The existing default commands remain green on TypeScript 6.

### T5 — Migrate backend packages and project-reference builds

**Blocked by:** T4 — Install both compilers and add a TypeScript 7 shadow lane.

**Status:** ready-for-agent

**What to build:** Make all backend package compilation and declaration
emission pass through TypeScript 7.

**Primary boundaries:**

- `tsconfig.base.json` and `tsconfig.build.json`
- `packages/*/tsconfig.json`
- `scripts/build-typescript-workspace.mjs`
- `scripts/build-stale-websocket-workspaces.mjs`
- `scripts/clean-ts-build.mjs`
- package build, test, and packaging commands

**Implementation notes:**

1. Run the root project-reference build through TypeScript 7 from a clean
   checkout.
2. Run Turbo package builds through TypeScript 7 with conservative checker
   concurrency.
3. Fix diagnostics by dependency order. Keep each fix in the owning package.
4. Exercise decorator-heavy node packages and packages loaded from `dist/`.
5. Compare TypeScript 6 and 7 JavaScript, declarations, declaration maps,
   source maps, and package entry points. Classify each difference against the
   official intentional-change list.
6. Reproduce and verify incremental behavior for deleted sources, missing
   `dist/`, stale build info, `--force`, and build stamps under TypeScript 7.
7. Verify parallel package tests cannot observe partially missing outputs.
8. Run package tests against TypeScript 7-produced `dist/` output.
9. Update comments and tests that claim behavior was measured only on
   TypeScript 6.

**Acceptance criteria:**

- [ ] Clean and incremental package builds pass with TypeScript 7.
- [ ] `npm run build:packages:tsc` and Turbo package builds produce consumable
  package output.
- [ ] Orphan pruning and build-stamp tests pass against the native compiler path.
- [ ] Package tests pass using TypeScript 7 output.
- [ ] Reviewed declaration differences preserve public API semantics.
- [ ] `npm pack --dry-run` for representative published packages contains the
  required files.

### T6 — Migrate web, Electron, demo, and examples

**Blocked by:** T4 — Install both compilers and add a TypeScript 7 shadow lane.

**Status:** ready-for-agent

**What to build:** Run application type-check and build entry points through
TypeScript 7 while API-based test and lint tooling remains on TypeScript 6.

**Primary boundaries:**

- `web/`
- `electron/`
- `demo/`
- `examples/chat_app/`
- `examples/nextjs-vercel/`
- `examples/nextjs-cloudflare/`

**Implementation notes:**

1. Run each application's no-emit type-check through TypeScript 7.
2. Fix diagnostics at the application boundary without changing runtime module
   format or strictness.
3. Run Vite, Next.js, Remotion, and Electron builds that consume the checked
   source.
4. Run Jest and `ts-jest` suites and prove they still load the TypeScript 6 API.
5. Run type-aware linting and prove `typescript-eslint` sees its supported peer.
6. Keep Next.js language-service plugin configuration and document editor use
   of TypeScript 6 until native plugin support is available.
7. Measure web type-check memory without the JavaScript compiler heap override.
8. Verify Electron backend preparation and bundle smoke tests when emitted
   backend output changed.

**Acceptance criteria:**

- [ ] All application type-checks pass with TypeScript 7.
- [ ] Web, Electron, demo, and example builds pass.
- [ ] Jest, `ts-jest`, ESLint, and documentation tooling pass with TypeScript 6 as
  their API provider.
- [ ] Next.js plugin behavior is not silently removed.
- [ ] The TypeScript 7 application path does not execute the native binary through
  Node or apply `NODETOOL_TSC_HEAP_MB` to it.

### T7 — Migrate standalone dependency trees

**Blocked by:** T4 — Install both compilers and add a TypeScript 7 shadow lane.

**Status:** ready-for-agent

**What to build:** Apply an explicit compiler policy to mobile, marketing, and
the Chrome extension, including their independent locks.

**Primary boundaries:**

- `mobile/package.json` and `mobile/package-lock.json`
- `marketing/package.json` and `marketing/package-lock.json`
- `chrome-extension/package.json` and `chrome-extension/package-lock.json`
- their tsconfigs and npm scripts

**Implementation notes:**

1. Inventory direct API consumers and peer ranges inside each standalone tree.
2. Use the dual-package topology for mobile and marketing if Expo, Next.js,
   ESLint, or another tool imports `typescript`.
3. Use TypeScript 7 directly for the Chrome extension only if its complete
   dependency tree has no compiler-API requirement. Otherwise use the same
   dual-package topology.
4. Update each local compiler command to select the intended executable
   explicitly.
5. Regenerate each lockfile with its own install command.
6. Run mobile type-check, lint, and tests. Run marketing type-check, build, and
   non-network checks. Run Chrome-extension type-check, build, and tests.
7. Confirm the root runner still prefers a standalone project's local
   compiler.

**Acceptance criteria:**

- [ ] Each standalone project reports its command-line and API compiler roles.
- [ ] Clean installs from all standalone lockfiles succeed without peer overrides.
- [ ] Mobile, marketing, and Chrome-extension checks pass.
- [ ] The root `typecheck:mobile` path selects the intended mobile compiler.
- [ ] No standalone manifest retains an unconstrained TypeScript 5 range.

### T8 — Switch defaults, update CI, and tune concurrency

**Blocked by:** T5 — Migrate backend packages and project-reference builds.
T6 — Migrate web, Electron, demo, and examples. T7 — Migrate standalone
dependency trees.

**Status:** ready-for-agent

**What to build:** Make TypeScript 7 the normal compiler with a tested
TypeScript 6 rollback.

**Primary boundaries:**

- root and package npm scripts
- compiler launcher defaults
- CI workflows and cache inputs
- Turbo configuration when measurements require it

**Implementation notes:**

1. Change the compiler launcher's default from 6 to 7.
2. Make ordinary build, type-check, lint-time compiler, and watch commands use
   the native compiler. Keep named `:ts6` fallbacks.
3. Add an early CI version-contract step after `npm ci`.
4. Run native package installation and compiler smoke checks on every operating
   system used for release builds.
5. Compare TypeScript 6 and 7 cold and warm measurements on the same revision.
6. Measure Turbo concurrency together with TypeScript 7 `--checkers` and
   `--builders`. Set conservative configurable defaults only when they improve
   the measured commands within CI memory.
7. Verify watch mode observes edits, additions, deletions, and renames.
8. Run one CI-equivalent job with the TypeScript 6 fallback to prevent rollback
   drift during the migration window.
9. Document the rollback command in developer and CI troubleshooting guidance.

**Acceptance criteria:**

- [ ] Ordinary compiler commands identify TypeScript 7.
- [ ] CI fails before compilation when compiler roles are wrong or a native binary
  is missing.
- [ ] All supported CI operating systems can execute the native compiler.
- [ ] TypeScript 7 is faster than TypeScript 6 on the agreed representative cold
  or warm command, measured on the same host and revision.
- [ ] Native concurrency stays within CI memory and does not multiply Turbo's
  parallelism without a measured benefit.
- [ ] The TypeScript 6 fallback remains green.

### T9 — Add drift checks, update guidance, and run final verification

**Blocked by:** T8 — Switch defaults, update CI, and tune concurrency.

**Status:** ready-for-agent

**What to build:** Prevent regression to ambiguous compiler selection and
close the migration with repository evidence.

**Primary boundaries:**

- dependency and lockfile checks under `scripts/`
- compiler runner tests
- `docs/DEVELOPMENT_STANDARDS.md`, `docs/dev-environment.md`, and relevant
  `AGENTS.md` files only where commands or behavior changed
- this plan

**Implementation notes:**

1. Add a repository check that enumerates in-scope manifests and rejects
   unapproved TypeScript ranges, direct native-API imports, and compiler paths
   outside the shared launcher. Assert that the audit inspected files.
2. Add lockfile assertions for the compiler roles and standalone locks.
3. Update comments and documentation that describe V8 heap requirements,
   compiler locations, version selection, watch behavior, or rollback.
4. Do not hard-code package counts or transient timing results in guidance.
5. Run documentation link checks and `npm run check:agents-docs` if agent
   instructions change.
6. Run all migration checks and the mandatory post-change verification.
7. Record any accepted TypeScript 6/7 diagnostic or declaration differences in
   the PR with the test that proves runtime behavior.

**Acceptance criteria:**

- [ ] The drift check fails on a deliberately invalid manifest or direct compiler
  path, then passes after the fixture is restored.
- [ ] Documentation describes TypeScript 7 as the CLI compiler and TypeScript 6 as
  the API compatibility package and fallback.
- [ ] No repository command depends on npm bin-link collision order.
- [ ] All commands in [Final verification](#final-verification) pass.

## Testing decisions

| Boundary | Evidence |
|---|---|
| Compiler selection | Subprocess tests cover TypeScript 6 JavaScript and TypeScript 7 native executables, arguments, environment, signals, and exit codes. |
| API compatibility | A Node test imports `typescript`, checks the expected major version, and exercises a small API such as `createSourceFile`. |
| Dependency topology | Manifest and lockfile audits reject TypeScript 5 workspace ranges, invalid peers, and missing native platform packages. |
| Configuration | TypeScript 6 stable-ordering and TypeScript 7 shadow commands compile every tsconfig without deprecation suppression. |
| Backend emit | Clean, incremental, forced, and project-reference builds are exercised, followed by package tests and representative `npm pack --dry-run` checks. |
| Applications | Existing web, Electron, demo, and example type-check, build, lint, and test commands run with the intended compiler roles. |
| Standalone projects | Each independent lockfile receives a clean-install check and its local type-check/build/test commands. |
| Watch mode | An automated script edits, adds, deletes, and renames a temporary source file and observes the expected rebuilds without touching real source. |
| Performance | TypeScript 6 and 7 run on the same revision, host, input, and clean/warm state. Capture producer exit status with each timing. |
| Rollback | CI or an equivalent local job runs the named TypeScript 6 fallback after TypeScript 7 becomes the default. |

Tests must distinguish compiler diagnostics from failures in Vite, Jest,
Electron Builder, Next.js, or runtime execution. Passing a bundler build does
not replace an explicit TypeScript 7 check.

## Final verification

Run from the repository root unless the command states otherwise:

```bash
npm ci
npm run check:lockfile
npm run build:packages:clean
npm run build:packages:tsc
npm run typecheck
npm run typecheck:examples
npm run test:affected
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
npm run backend:smoke
```

Run the compiler-role assertions and fallback commands defined by T4 and T8.
Then run the independent project checks:

```bash
npm --prefix mobile ci
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix mobile test

npm --prefix marketing ci
npm --prefix marketing run seo:typecheck
npm --prefix marketing run build

npm --prefix chrome-extension ci
npm --prefix chrome-extension run typecheck
npm --prefix chrome-extension run build
npm --prefix chrome-extension test
```

If a standalone script name differs when implementation starts, use the
manifest's current equivalent and update this plan in the same change.

## Rollout and rollback

The migration lands as an expand-and-contract sequence. T1 through T4 add
capability without changing normal compiler behavior. T5 through T7 prove the
native compiler by cohort. T8 changes the default only after every cohort is
green. T9 adds enforcement.

Rollback after T8 sets `NODETOOL_TSC_VERSION=6` or invokes the named TypeScript
6 script. It does not change dependencies or lockfiles. If TypeScript 7 emits
incorrect production output, switch the affected build command to the fallback
and open a minimal reproduction before attempting a source workaround.

Do not delete the TypeScript 6 compatibility package during rollback. It is
still required by compiler-API consumers.

## Risks

### R1: Compiler API absence

A dependency can import `typescript` indirectly even when NodeTool source does
not. Mitigation: retain the alias, inspect peer dependencies with `npm ls`, and
test API-based lint and test tooling.

### R2: Native executable launched through Node

The current runners assume a JavaScript file. Mitigation: T2 distinguishes
entry types and exercises real subprocess behavior.

### R3: New defaults change ambient types or asset imports

TypeScript 7 defaults `types` to empty and enables unchecked side-effect import
checking. Mitigation: expose both under TypeScript 6, then add explicit project
configuration and asset declarations.

### R4: Parallelism exceeds CI memory

Turbo and TypeScript 7 can multiply concurrency. Mitigation: start with
conservative checker counts, measure peak memory, and keep overrides
configurable.

### R5: Incremental output behavior differs

NodeTool has custom orphan pruning and build stamps around `tsc --build`.
Mitigation: reproduce each invariant under TypeScript 7 before changing the
default.

### R6: Declaration output changes

Stable type ordering and the native emitter can produce text differences.
Mitigation: compare public semantics and consumer tests rather than requiring
byte identity.

### R7: Editor plugin loss

TypeScript 7.0 cannot host TypeScript 6 language-service plugins. Mitigation:
keep the TypeScript 6 workspace service for affected projects and limit the
initial native cutover to CLI commands.

### R8: Native platform package missing from a lockfile

The native compiler installs platform-specific packages. Mitigation: exercise
clean installs and a version smoke check on every release operating system.

## Out of scope

- migrating compiler-API consumers to the future TypeScript 7.1 API.
- adopting a TypeScript 7.1 prerelease.
- enabling `exactOptionalPropertyTypes`.
- changing ECMAScript targets or runtime module formats without a demonstrated
  TypeScript 7 blocker.
- replacing Jest, `ts-jest`, TypeScript ESLint, Next.js, Expo, or bundlers for
  unrelated reasons.
- broad source refactors prompted only by new diagnostics.
- removing the TypeScript 6 rollback during the initial rollout.
- changing generated files under `electron/backend-bundle/` by hand.

## Open questions

### Q1: How long should CI keep the TypeScript 6 fallback lane?

Default: keep it through the initial TypeScript 7 rollout and remove the CI
lane in a separate change after the team has a release-cycle policy. Keep the
TypeScript 6 API dependency until its consumers migrate.

### Q2: Should standalone projects use one shared launcher?

Default: use the root launcher where the project already calls root scripts.
Otherwise keep a small local npm command that selects its local package. Do not
make standalone builds depend on an incidental root installation.

### Q3: Should TypeScript 7 checker counts be fixed in CI?

Default: fix them only if repeated measurements show unstable memory or
diagnostics. Prefer the compiler defaults for single application checks and a
lower configurable value for externally parallel Turbo package builds.
