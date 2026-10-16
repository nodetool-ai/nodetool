# CLI pack-system handoff

## Start here

Use [the plan](../docs/cli-pack-system-plan.md) and
[the design](../docs/cli-pack-system-design.md). Foundation
[PR #6550](https://github.com/nodetool-ai/nodetool/pull/6550), runtime and
installer [PR #6558](https://github.com/nodetool-ai/nodetool/pull/6558), and
staging verifier [PR #6591](https://github.com/nodetool-ai/nodetool/pull/6591)
have merged.

Release corrections are in
[PR #6630](https://github.com/nodetool-ai/nodetool/pull/6630). They preserve
original release artifacts while measuring prerelease dependencies through
temporary tarballs, and keep shared media dependency versions equal to their
install pins.

The final CLI cut is in
[PR #6632](https://github.com/nodetool-ai/nodetool/pull/6632), on
`codex/cli-pack-final-cut`, forked from the release correction branch. It ships
core nodes, enables authorized pack installs, and verifies original artifacts
in isolated project and global consumers. The first global transaction binds
same-version catalog root reinstallation to CLI authorization so npm can
establish verified integrity records. See
[global bootstrap](../docs/cli-pack-system-plan.md#d25-global-installation-baseline-without-a-hidden-lock).

Require the actual A13 staging rehearsal before merging or publishing A24.
Require complete mandatory CI and project/global artifact acceptance before
claiming completion. Read the linked PRs for current checks and release evidence.
The sections below preserve earlier implementation checkpoints.

The user authorized commits, pushes, green PR merges, and staging prerelease
rehearsals. Preserve the stable `latest` tag. The organization owner deleted
`NPM_TOKEN` and confirmed trusted publishers should cover the cohort. Use
`nodetool packs` for management. Authorized project installs may update the
project manifest and lockfile. FAL acceptance uses a real installed node with
strict deterministic responses and no provider API spend.

Read [repository instructions](../AGENTS.md),
[development standards](../docs/DEVELOPMENT_STANDARDS.md), and the touched area
overlays. Use parallel agents and Astra for hard tasks and critical reviews.
Do not run Linux Docker locally. Use remote CI for Docker verification.

On another computer, fetch the relevant PR branch, run
`scripts/setup-agent-env.sh`, use the Node version in `.nvmrc`, and run
`npm run build:packages`. Dependency folders and local build outputs are not
transferred through Git.

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

## Earlier implementation checkpoints

A14 install-mode and inventory helpers are committed as `a7c58b1e81`.
A15 connects their snapshot to CLI registration, providers and the installed
server source. The loader admits exact versions and resolves exports from the
admitted package roots. It refuses ancestor copies and wrong-version packs.

A16 adds shared missing-pack payloads, graph preflight with referenced workflow
lookups, CLI exit 3 and HTTP, WebSocket and MCP transport. A17 extends dynamic
agent and DSL calls. Review reproduced three gaps in real controlled-node execution, lazy single-node
results and tool-result telemetry. Those fixes now preserve refusal data, keep
controlled actors available and allow continuation. Real runner regressions
passed and Astra cleared them.

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
unlinked paths before replay and snapshot comparison. D26 normalizes npm 11 replay only for exact catalog-owned node packs with
known matching integrity and unchanged name, version and realpath. Protected
core, shared, runtime and user packages remain refused. A21 replaces the temporary boolean with opaque CLI authorization. It binds
root, mode, core version, expanded ids and approved scripts, then rechecks under
the lock. Serve and MCP set permanent refusal flags. Review also proved that
real global npm installations lack the initial hidden lock. D25 implements the
constrained baseline fallback with strict post-install pins. Genuine global
prefix bootstrap and rollback regressions pass. Astra cleared A20/A21 at
`55c710ee6e`.

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
checker exception without changing behavior. The child merges these fixes and the later telemetry-peer packaging repair.
The backend smoke now relocates outside the checkout to expose unstaged peers.
The isolated artifact boot passed. Parent and child remain drafts.

`55bedffba8` repairs old protocol/registry fixtures and mocks the asset-storage
boundary rather than individual filesystem writes. A clean asset-directory
regression failed before the fix and passed afterward. These fixtures are
merged into child checkpoint `f408cc0238`. Fresh remote checks are running.

A22 command/removal/repair and A23 matrix implementations are present in the
shared checkout. Astra cleared the frozen transaction and command behavior.
The six platform/npm execution outcomes remain pending remote CI. The
concurrent-install fixture now uses independent commands and passes. The old
authorization remains invalid, while command renewal repeats consent against
the same displayed selection. Astra cleared the renewal delta with actual
concurrent npm execution. M13 now interrupts a live npm process during metadata fetch and verifies
stale-lock reporting and explicit repair of the unchanged baseline. A
fragmented-stdout PID regression failed with the old parser and passes with
complete-line parsing. Recovery from arbitrary partial extraction is not
established by this fixture.
D26 requires a verified same-identity replay normalization for npm global adds,
so the second-pack and concurrency matrix cases can meet their intended
behavior. Keep strict refusal for protected packages and unproven changes.

The production dependency scanner now enumerates runtime AST imports rather
than counting erased type queries. Invalid production imports, empty scans,
side-effect imports and mixed imports are retained regressions.

Inspect [draft PR #6558](https://github.com/nodetool-ai/nodetool/pull/6558),
stacked against `codex/cli-pack-system-runtime`, and the foundation PR checks.
Fix mandatory verification failures before marking either layer ready.
A8, A9 and A23 acceptance evidence is recorded below.

The installed-pack source, cross-surface errors, authorized installer, commands
and native matrix are implemented. Continue with the real release and staging
prerequisites. Perform A24 only after its required checks and release proofs
pass. Publishing npm packages and merging PRs still need separate authorization.

Q6 is resolved by the user’s selection of `nodetool packs` for installer
management alongside the existing `packs compile` subcommand. Q9 is resolved
by the user’s authorization to update the selected project’s package.json and
package-lock.json. CLI authorization continues to name those files and bind
the install root and mutation paths.

## Preserved user edit

The original computer has a separate, pre-existing unstaged edit in
web/src/index.tsx. It was never included in these commits and is NOT transferred
by fetching this branch. Its SHA-256 is
`c6558f4eb05352ed80c315b4c54ffa4f433b4db4ec01d367ee4331c3a6b8dc52`.
Preserve it on the original machine. No force push or reset was performed.

## Command and matrix checkpoint

`32fa5f97c7` adds the reviewed installer command surface, removal,
repair, authorized re-execution and native platform/npm matrix. Independent
concurrent commands now renew stale authorization without changing the old
grant. Prompts bind the displayed selection to the resulting token.

The first remote Linux Node 24/npm 11 matrix passed. Linux Node 22/npm 10
reported an exact same-version replay action in text. D26 now handles that
case only for a uniquely identified pinned hoisted pack, with protected
identities and all post-install checks retained. Both macOS legs exposed
noncanonical fixture paths through the OS temporary-directory symlink. The
fixture root is now canonical, with a retained ancestor-alias regression.
Windows separator coverage is retained. Fresh platform acceptance is required.

The local harness exposed two browser game suites loading the untransformed
Node config barrel. Jest now selects the browser branch while exercising the
real Rapier import. Both failing suites pass after the test mapping fix. This
is focused repair evidence, not a passing verdict for the full harness gate.

`6efbf85d9e` fixes npm 10 replay, canonical fixture paths, the live npm
interruption case and browser game test loading. Both Linux matrix legs and
the macOS npm 11 leg passed on that checkpoint. Windows exposed a real npm
launch failure from a long cwd. The corrected launcher starts a fixed Node
bootstrap from a short ancestor, enters the admitted root, restores npm argv
and loads npm. Relative project configuration and lifecycle INIT_CWD match
the normal launch in real npm tests. Astra cleared the corrected source.
Native Windows long-directory chdir remains a remote acceptance requirement.

The rebuilt isolated backend artifact boots and answers health. Its first
smoke-copy attempt hit temporary-storage quota. Removing the clean, fully
pushed temporary parent checkout freed space, and the same artifact passed
on retry. The temporary parent checkout no longer exists. Build, typecheck
and lint passed before the final npm-launcher delta.

The first local full harness finished with 40 of 43 checks passing. Its failed
browser game check is repaired in focused reruns, including editor cadence.
The email tests now mock the optional loader boundary, so hidden imports do
not bypass their parser stubs. Both email suites pass after the fixture fix.
The matrix report test now imports Vitest, matching test:scripts. The full
scripts suite passes with the session-local lsof tool on PATH. These repairs
passed the fresh complete local harness: 43 of 43 selfchecks. The isolated
backend smoke, build, typecheck and lint also pass. Remote mandatory
verification remains required.

Packed Core CLI now runs packed-install independently of verification, so
the actual Linux install and size report do not wait behind broad suites.
The existing core-smoke check remains an aggregate requiring both jobs to
succeed, including failure, skip and cancellation controls. Verification
retains all mandatory commands and backend smoke. Each build uses read-only
caches. Astra cleared the job graph, and the guard regression passes.
Read packed-install logs for A9, and require the aggregate before completion.

`9fbce321c5` fixes the actual core-only guard reproduction. tRPC resolves
TypeScript to `@typescript/typescript6`, whose required compiler dependency
is `@typescript/old` with an npm TypeScript alias. The guard now admits only
that exact dependency resolved from an already-admitted wrapper and validates
its declared range separately. The real minimal npm reproduction and all 24
guard tests pass. Astra cleared the change. The full packed Linux smoke and
A9 measurement still need remote success.

On `26861f78df`, both macOS legs and Linux npm 11 passed. Linux npm 10 failed
during dependency installation with ECONNRESET before the matrix. Both Windows
legs passed 19 of 20 cases and failed M15 with ENAMETOOLONG when the bootstrap
entered the admitted long directory. This remains a production issue, not a
fixture exception. The Windows diagnostic compares normal and namespaced
spawn/chdir on the same long directory before choosing a fix. Do not claim
Windows acceptance from the Linux bootstrap tests.

Remote affected tests also exposed seven node-catalog integration tests whose
outer five-second deadline expired under concurrent builds. Their child
limits remain 30 seconds. Their outer limits now allow five seconds for
cleanup. The focused eight tests pass and assertions are unchanged. Fresh
remote verification must pass before marking either PR ready.

The actual Linux packed install on `3763e9204b` passes the guard over 617
packages, the DSL import, version and help. It measures 850,632 KiB, but the
MCP workflow call hangs with QuickJSHostRefInvalid. This is not A8 acceptance
or an A9 baseline. A minimal fresh npm reproduction found that wrapper 3.1
pulls QuickJS core 0.32 against the selected 0.31 WASM variant. Switching only
the wrapper to 3.0.1 restores the async host callback. `05aced81f0` restricts
both wrapper consumers to `~3.0.1`, retains runtime and metadata regressions,
and records the minor-version compatibility requirement. Astra cleared it.
Rerun the actual packed MCP workflow before setting the size budget.

`5b3722db29` uses namespaced spawn input so Windows can obtain a short alias
of the admitted long directory. The child verifies nonzero directory identity,
uses the plain short cwd physically, and preserves npm's logical project path
for configuration and INIT_CWD. Native Node 22/24 checks passed startup and
configuration, then exposed npm's long-path mkdtemp limitation in a relative
cache. `2474510a09` maps only in-root temporary prefixes to the verified short
directory, preserving trailing separators and checking the actual containing
directory. External prefixes and prefixes creating siblings remain unchanged.
The separator regression fails before the fix and passes afterward. Both
changes are reviewed, but the real Windows cache, lifecycle and M15 checks
still require native CI success.

The complete [native matrix on `88f87a5a57`](https://github.com/nodetool-ai/nodetool/actions/runs/38494786134)
passes all six platform/npm legs. Both Windows legs pass all 20 cases,
including M15. The separate native checks also pass on Node 22/npm 10 and
Node 24/npm 11 with a 364-character root, relative cache/configuration,
manifest and lock targets, ignored install scripts, explicit rebuilds and
lifecycle INIT_CWD. This is A23 acceptance evidence.

The packed install on that commit measures 849,612 KiB and passes the MCP
workflow, JSON workflow and TypeScript workflow after the QuickJS fix. It
then fails a smoke-fixture assumption: a numeric Flux prompt does not produce
a property error because that prompt is optional. The replacement uses
AudioUnderstanding's required audio property and supplies inline audio for
the pack-only case. Real shipped catalog validation reproduces the old failure
and passes the corrected case. All 25 helper tests pass and Astra cleared it.
Keep the exit 1 versus exit 3 assertions. A8 and A9 still await the remaining
actual packed probes.

`9ba38b859b` adds the existing full bundled CLI smoke after core-only in the
same CI job, using a separate temporary install. It does not publish anything.
The step's absence fails a retained workflow regression. The aggregate check
still requires complete verification and packed installation.

## A8 acceptance and A9 size gate

The [packed-install job on `5b2631ab38`](https://github.com/nodetool-ai/nodetool/actions/runs/38496155808/job/115632297199)
passes both core-only and full bundled smoke. Core-only covers purity, DSL
imports, CLI help/version, MCP workflow execution, JSON and TypeScript
workflows, missing-pack/property validation, typed execution failure, real
Mediabunny audio/video decoding and HTTP health. The core tree measures
849,616 KiB. The same runner's bundled tree measures 1,075,516 KiB.

A9 enforces 892,097 KiB only for core-only Linux x64, using the measured core
size plus five percent rounded up. [Design section 8.4](../docs/cli-pack-system-design.md#84-budget)
records the measurement and limit. Before main integration, a real 16 KiB
fixture failed a 1 KiB budget and passed at equality. The helper also refuses
invalid measurements and limits. All 49 helper tests pass and Astra cleared
the integration. The [enforced packed-install check on `70b4c5c38f`](https://github.com/nodetool-ai/nodetool/actions/runs/38497247390/job/115635716082)
passes at 849,612 KiB, below 892,097 KiB. The full bundled smoke also passes.
Small block-allocation differences remain within the measured margin.

The broad verification job on `5b2631ab38` stopped at the new FAL catalog
regression's five-second import deadline. Its assertions passed in focused
runs and in the real packed smoke. Only that integration test now has a
30-second deadline. The other 456 script tests passed in the failed run.
Mandatory verification and the required aggregate check still need success.
A24 remains blocked by its release and verification prerequisites.

Foundation CI on `7eeb417b5c` exposed stale OCR/TFJS and Whisper message
assertions, plus the already-repaired email mock boundary. The child reproduces
the failures and verifies the structured MissingRuntimePackageError details,
managed commands, discovery and retries. All 67 focused OCR/TFJS and Whisper
tests pass. The real canvas passthrough retains the loader options. Astra
cleared the fixture changes.

The foundation branch now contains those fixture repairs and the shared
QuickJS compatibility fix at `1002271efd`. Its regular video and compiler
dependencies remain intact. Child merge `dfdc94737a` retains the dependency
cuts and has the same tree as fixture checkpoint `af78fc513b`. Both wrappers
remain in the tested 3.0 patch series. Fresh mandatory CI on both layers is
still required before completion.

The user selected `nodetool packs` for installer management and authorized
local project manifest and lockfile updates. One command now contains
`compile`, `list`, `add`, `remove`, `doctor` and `why`, with lazy service loading.
The combined registration regression fails before reconciliation and passes
afterward. All 44 focused command, management and mode checks pass, as does
the actual npm M05 add, clean-install and remove case. Root build, typecheck
and lint pass. Catalog fixture `8f9a11a565` simulates missing optional packs
from published catalog ownership while retaining real core registration and
FAL metadata and initialization assertions. Its eight focused checks pass
without increasing either deadline. Broader CI remains pending.

## Latest namespace and foundation verification

`f6021d0734` implements the user-selected `nodetool packs` namespace while
preserving `packs compile`. Q9 explicitly allows authorized project manifest
and lockfile updates. Build, root typecheck and lint pass for that change.
The merged catalog regressions pass 12 focused tests.

Foundation `2551ec2739` fixes the catalog mock boundary, bounds pack integration
tests and maps the pack-boundary plugin into the harness gate. The wrong mock
and missing mapping were reproduced before repair. Parent-focused catalog
and mapping/plugin checks pass. The prior Blender render timeout remains
unmodified pending fresh CI evidence.

The foundation PR conflicted with main, preventing new PR checks. Reviewed
merge `f673ce1ddc` resolves an equivalent storage comment and asset-test changes,
with 44 focused tests passing. Child merge `f700e5a749` incorporates it without
conflicts and preserves the dependency cuts and unified packs command. Both
layers require fresh mandatory CI. A24 remains blocked by release and
verification prerequisites. No npm publication, tag mutation or PR merge occurred.
