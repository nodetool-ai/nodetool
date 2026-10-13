# CLI pack-system handoff

## Start here

Continue implementing [the plan](../docs/cli-pack-system-plan.md) and
[the design](../docs/cli-pack-system-design.md). The overall project is unfinished.
The current branch is `codex/cli-pack-dependency-cuts`, forked from
`codex/cli-pack-system-runtime` at `7fc7941c4d` on the user’s explicit
instruction. The foundation PR is
[PR #6550](https://github.com/nodetool-ai/nodetool/pull/6550). Keep the new PR
stacked against that branch until the foundation lands. Both layers remain
work in progress pending remote verification.

Read [repository instructions](../AGENTS.md),
[development standards](../docs/DEVELOPMENT_STANDARDS.md), the touched area
overlays and [implement](../.agents/skills/implement/SKILL.md).
Use sub-agents for implementation and `gpt-6-astra` for review, as the user
requested. Do not start or run Linux Docker. Linux verification belongs in
remote CI. The user authorized commits, pushes and PR creation. Do not ask
again for routine permission. Do not publish npm packages or merge a PR merely
because pushing a branch was authorized.

On another computer, fetch this branch, create a local tracking branch, run
`scripts/setup-agent-env.sh`, use the Node version in `.nvmrc`, and run
`npm run build:packages`. No dependency folders or local build outputs were
transferred. Inspect the remote branch and this file before making changes.

## What is merged

[PR #6545](https://github.com/nodetool-ai/nodetool/pull/6545) is merged.
It contains A10, A11, A1, A4.4, A6, A7, A18, A19 and the repository portions
of A13.1/A13.2, plus CI fixes. Specifically:

- Each domain pack exports a registrar. Legacy registration order and exact
  metadata are snapshot-tested. The audio pack owns the Preview override.
- The node catalog is generated sorted JSON/NDJSON with compressed runtime
  data, ownership and drift checks. Release version bumping refreshes catalog
  versions and clears version-specific install metadata.
- FAL/KIE pricing moved to model-pricing without manual price changes.
- The CLI loads TypeScript workflows through tsx in process, including legacy
  printed JSON, and restores cwd/console state.
- The dependency size walker and tier definitions are report-only. No final
  reduced-size CLI budget has been verified.
- Install locking and the deterministic npm runner are implemented. Existing
  runtime installation retains its script policy. Pack installation defaults
  to ignoring scripts.
- Publishing packs once and reuses the same tarballs for smoke/publish. Token
  usage was removed from the workflow. External npm trusted-publisher owner
  configuration and secret deletion have NOT been performed. No npm release
  was executed.

The last completed CI checks on that PR passed, including docs/privacy,
mutation, CodeQL, dependency audit and provider codegen. The main Test workflow
was queued at the last inspection. The PR subsequently merged. Do not infer
its test result without checking GitHub.

## Work on this remote branch

### A3: committed and reviewed

`e1b2e002fc` adds catalog-aware registry metadata, availability, graph/property
validation and execution guards. Catalog-only nodes cannot fall through to
Python execution, including with preflight disabled. DSL, CLI, agents and
HTTP/WebSocket validation adapters use the same boundary. A structural SDK
catalog interface avoids a package cycle. MissingPackError and its factory
live in node-catalog. The protocol Python namespace predicate also landed here.

Astra's F13 found that the API source enum omitted `catalog`, causing actual
inventory results to fail schema parsing. It is fixed with an actual
buildNodeTypeInventory -> protocol parse regression. The negative reproduction
failed before the enum change, and 11 SDK tests plus an independent built
inventory round trip passed afterward. Astra cleared A3.

The new registry classification mutants and dynamic-value fallback mutants
were killed. A broad graph-validator mutation run still exited 3 from legacy
or equivalent survivors. Do not describe that broad run as passing.

### A12: committed and reviewed

`9423b859ba` adds a private server workspace, injected PackSource interface,
async registration and server entrypoint wiring. The desktop bundle and dev
scripts enter through server. Builtin policy moved to node-sdk with a base
compatibility export. A temporary public base-nodes server factory supports
the packed CLI while the private server is absent. A4.6 removes that fallback.

Astra's F8 found resolved import failures could be masked by fallback to an
optional-module root. The fix directly imports the resolved URL and uses the
fallback only when initial package resolution reports absence. A child-process
hook regression proves transitive errors propagate and no alternative root
loads. Astra cleared this scope.

The staged A12 snapshot intentionally excluded runtime environment helper
wiring. The later checkpoint contains that wiring. No isolated build of the
intermediate A12 staged tree was run. Earlier complete-tree server tests,
bundle smoke, packed CLI smoke and dev health/metadata parity passed. A full
lint run subsequently identified a missing explicit return annotation in
base-nodes/src/server-pack-source.ts, which the continuation fixes below corrected.

### A2: implemented in checkpoint, reviewed

importPack/registerAvailablePacks resolve catalog-owned packages and propagate
module initialization errors. A missing pack yields structured unsupported
installation details. Installed classes and catalog fallback preserve D22
metadata/policy parity. Astra independently verified loader errors and policy
combinations and cleared this scope.

The foundation added runtime library IDs: imaging, typescript, tracing and esbuild.
The shared npm registry pins them, including the TypeScript npm alias.
Desktop lists bundled libraries as Included without install/remove actions.
Web and Electron focused tests passed.

The pack import lint rule uses an exact AST-site baseline for existing imports,
since enforcing a blanket ban before A4 would break the intermediate tree.
It rejects new sites, duplicates and stale entries. Remove corresponding
baseline sites as the A4 source cuts land. Tests include UTF-8 offsets, and a
real unbaselined negative scan failed as expected.

### Runtime migration steps 1 and 2: implemented in checkpoint, reviewed

The pack plan explicitly requires these adjacent runtime-install migrations.
Registry/installer migration steps 3 and 4 remain outside this batch.

- config runtimeLocations/applyRuntimeEnv centralize host paths, settings,
  conda precedence and environment preservation. CLI and Electron use them.
  Python bridge discovery recognizes configured/active/default environments.
- Protocol MissingRuntimeDetails provide typed host-specific guidance with
  shell quoting and actual specifier/cause. Kernel, execution, sandbox, agents,
  saved-script grading and CLI transport preserve the details. Missing runtime
  CLI errors exit 3. Ordinary assertion failures retain exit 1.
- Known host binaries and Python/provider/native loaders use typed errors.
  Unknown binaries retain the existing generic behavior.
- Dockerfile declares NODETOOL_HOST=docker. This was tested by parsing the
  actual ENV declaration. Removing it produced the expected negative failure,
  then it was restored. No Docker was run for this test.

Astra F9-F12 are resolved: Docker host declaration, lost grading/run details
and exit status, Electron conda precedence, and incorrect loader identifiers
or desktop-only messages. Focused boundary tests passed, including actual
child CLI missing-module runs. Astra cleared runtime steps 1/2 before the final
mechanical lint edits described below.

## Continuation fixes

The return annotation and input-parser lint failures below are fixed. Runtime
settings, CLI manifest versions and transported runtime errors now use typed
schemas. Regression tests cover malformed settings and manifests, and fallback
from invalid direct error details to valid nested details.

The new server workspace exposed existing document dependencies to the
production audit. Parent-scoped overrides update EPUB's `adm-zip` and PPTX's
`image-size`. Real EPUB chapter reads and PPTX text/image writes passed against
the patched dependencies. The dependency audit passes against the failing CI
run's base. The PPTX sandbox test now checks the written text and PNG ZIP entry.

Package builds, root lint, root typecheck and focused config/CLI tests passed.
Astra cleared the source fixes and scoped overrides. Broad affected tests,
harness gate and backend smoke still require the new remote CI result. The PR
remains a draft until that verification completes.

This checkout uses Node from the local mise installation. Set `TMPDIR=/dev/shm`
for local checks because writes to `/tmp` hit its quota. Mobile dependencies
were restored with `npm --prefix mobile ci` before rerunning typecheck.

## Dependency-cut fork

A4.1, A4.2, A4.3, A4.5, A4.6, A4.7 and A4.8 are implemented on this fork.
A4.4 was already merged. The CLI still declares bundled node packs and the
renderer. Removing those published dependencies remains A24.

Runtime imaging and tracing libraries load through typed optional boundaries.
Canvas consumers await initialization at their existing asynchronous entry
points. Compiler esbuild and game-runtime Rapier are optional peers with
retryable loading. Rapier preserves its literal browser import and adds the
managed runtime fallback only on Node. Rapier is registered as a runtime
library and as an Included desktop dependency.

Agents, DSL, websocket and CLI use catalog-backed registration and lazy pack
loading. The websocket standalone source no longer falls back to the private
server or base-nodes. Shared builtin policy removes excluded catalog metadata
as well as installed classes. The direct-pack-import migration ledger is empty
and its regression now requires it to remain empty.

Astra identified two regressions and cleared their fixes. A core workflow can
run without optional tracing when only the implicit durable trace sink is
configured. Explicit sinks, broken modules and transitive failures still throw.
Catalog policy filtering now removes metadata-only entries. Retained negative
regressions exercise both boundaries.

A8 is implemented with a separate core-only packed CLI smoke. It repacks only
test manifest copies, physically excludes optional pack tarballs, recursively
checks the installed dependency tree, decodes a checked-in audio/video fixture,
and runs real DSL, JSON, MCP and HTTP probes. The existing full release smoke
still uses the original publish tarballs. The guard permits only demonstrated
intrinsic esbuild and TypeScript dependencies from tsx and tRPC, with resolved
path and semver checks. D23 records these exceptions.

The isolated MCP probe reproduced a first-write migration failure. CLI async
startup now applies SQLite migrations before initializing the database. A real
fresh-database MCP regression failed before the fix and passed afterward. The
smoke uses an unused port so it cannot forward to an ambient server.

The new packed-core-cli remote workflow runs package builds, affected tests,
typecheck, lint, harness gate, backend smoke and the actual isolated core-only
install on every applicable PR base branch. It uses no Docker. Publishing also
runs the core-only smoke before publication.

Package builds, root lint, root typecheck, agent-doc checks, dependency audit,
harness selection and focused hidden-dependency, registry, migration, codec
and smoke-helper tests passed locally. The actual packed core-only install,
complete affected tests, actual harness gate and backend smoke still require
remote Linux CI. Do not claim A8 acceptance until those checks pass.

Closure measurements compare baseline workspace manifests at `7fc7941c4d`
against the fork using the same local installed tree and compiled bytes. They
show source/manifest edge savings, not a clean Linux install or a final size
budget. Package-root savings overlap and must not be summed. A9 remains open.

## Immediate continuation

A14 install-mode and inventory helpers are committed as `a7c58b1e81`.
A15 connects their snapshot to CLI registration, providers and the installed
server source. The loader admits exact versions and resolves exports from the
admitted package roots. It refuses ancestor copies and wrong-version packs.

A16 adds shared missing-pack payloads, graph preflight with referenced workflow
lookups, CLI exit 3 and HTTP, WebSocket and MCP transport. A17 extends dynamic
agent and DSL calls. Review found that real controlled-node failures still lost
the payload and failed the run. That repair is in progress. Stub-only control
tests did not establish the required behavior.

A13.3 release pinning is committed as `fe59d9a14b`. Its read-only remote Linux
measurement job passed. The catalog now also records original companion hashes,
exact runtime alias identities and shared-library pins. A13.4/A13.5 implement
staging verification and final promotion with the CLI last. Focused release
regressions passed and Astra cleared the release scope. No npm publication or
dist-tag change was performed. The npm owner still needs to enable trusted
publishing and dist-tag operations before those release steps can run.

A20 is checkpointed as `b847731b28`, behind `NODETOOL_PACKS_INSTALLER=1` with no
command entry. It snapshots and plans, verifies pins before scripts, rebuilds
only the allowlist and load-checks in a child. Local registry tests cover
integrity refusal, additive plan refusal and rollback. npm 11 can retain global
extraneous packages during rollback, so guarded cleanup removes only new,
unlinked paths before replay and snapshot comparison. A same-version npm global
change plan remains refused under the specified additive-only rule. A21 is
replacing the temporary boolean with opaque CLI authorization. Review also
proved that real global npm installations lack the hidden lock required by the
initial snapshot. D25 defines the constrained baseline fallback. That repair
and its real global-prefix regression are in progress.

The first core CI attempt failed at `check:typescript` because four new
workspace dependencies lacked project references. `37b5b1ef0a` adds them. The
next attempt passed release measurement but stopped at script fixtures before
the actual core install. Fresh-MCP smoke now launches the built entry directly
and handles spawn errors. The publish fixture now uses an isolated repository
and the cleaned environment. Fresh remote checks are still required.

Foundation CI exposed catalog cycles and Node tracing imports in browser
bundles. `54c21f4df2` fixes both and updates the stale typed-runtime test.
Workflow-runner browser E2E passed on that head. The next dependency check
reported a path-delimiter false positive in storage. `95be83aa5e` records the
checker exception without changing behavior. The child still needs to merge
these parent fixes after its checkpoint. Parent and child remain drafts.

The production dependency scanner now enumerates runtime AST imports rather
than counting erased type queries. Invalid production imports, empty scans,
side-effect imports and mixed imports are retained regressions.

1. Inspect [draft PR #6558](https://github.com/nodetool-ai/nodetool/pull/6558),
   stacked against `codex/cli-pack-system-runtime`. The A4/A8 checkpoint is
   `4a18eef330`. Inspect its remote packed-core-cli checks and the foundation
   PR checks.
   Fix failures before marking either layer ready.
2. After actual core-only Linux installation succeeds, implement A9 using the
   measured installed size plus the plan’s margin. Prove the size check fails
   on an oversized fixture before enforcing it. Do not invent a threshold.
3. Continue staging verification and promotion, the installed-pack source,
   cross-surface missing-pack errors, authorized installer, commands and npm
   matrix. Perform A24 only after its prerequisites pass.

Q6 recommends `nodetool nodes` for new commands because `nodetool packs` already
means sandbox packs. Q9 concerns local project manifest/lockfile authorization.
Earlier questions have no recorded answer. Continue independent work and use
existing authorization carefully when these decisions become relevant.

## Preserved user edit

The original computer has a separate, pre-existing unstaged edit in
web/src/index.tsx. It was never included in these commits and is NOT transferred
by fetching this branch. Its SHA-256 is
`c6558f4eb05352ed80c315b4c54ffa4f433b4db4ec01d367ee4331c3a6b8dc52`.
Preserve it on the original machine. No force push or reset was performed.
