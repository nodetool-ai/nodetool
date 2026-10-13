# CLI pack-system handoff

## Start here

Continue implementing [the plan](../docs/cli-pack-system-plan.md) and
[the design](../docs/cli-pack-system-design.md). The overall project is unfinished.
The current branch is `codex/cli-pack-system-runtime`, based on `origin/main`
at `5882ebefd0`, the merge of PR #6545. The branch contains the remaining
foundation work. Its final checkpoint is explicitly work in progress.

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
base-nodes/src/server-pack-source.ts, which still needs correction.

### A2: implemented in checkpoint, reviewed

importPack/registerAvailablePacks resolve catalog-owned packages and propagate
module initialization errors. A missing pack yields structured unsupported
installation details. Installed classes and catalog fallback preserve D22
metadata/policy parity. Astra independently verified loader errors and policy
combinations and cleared this scope.

Four runtime library IDs were added: imaging, typescript, tracing and esbuild.
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

## Verification and remaining failures

Central normal npm install completed successfully. Lockfile libc checks passed.
The latest combined package build passed 71/71 tasks and root typecheck exited
0. These checks preceded the final mechanical conditional-spread lint edits.

Root lint exited 1 from new anti-slop violations. Seven conditional-empty-object
spread violations were then fixed across six runtime files:

- packages/cli/src/node/run-node.ts
- packages/cli/src/debug/server-runner.ts
- packages/agents/src/js-sandbox.ts
- packages/agents/src/capabilities/code-grading.ts
- packages/agents/src/capabilities/code.ts
- packages/kernel/src/runner.ts, two sites

Focused oxlint on those six files passed. They use typed result objects and
guarded property assignments. Full lint has NOT been rerun after those fixes.
Remaining known lint failures from the preceding full run:

- base-nodes/src/server-pack-source.ts: exported factory lacks return type.
- cli/src/runtime-env.ts: runtime typeof checks.
- config/src/runtime-locations.ts: unsafe unknown dictionary, unknown function
  parameter and runtime typeof checks.
- cli/src/command-errors.ts: runtime typeof checks.

Fix these by parsing external inputs at their boundary and using typed values,
then rerun meaningful focused tests and the required checks. Do not weaken lint
or add broad overrides. Existing unrelated warnings do not require cleanup.

Earlier aggregate test:affected and harness gate had only the macOS game golden
font failure: Linux expects Liberation Sans, this host supplies .SF NS. User
explicitly accepted ignoring local Linux testing and running remotely. The
current branch has NOT had fresh complete affected tests or harness gate.
Run those in remote CI, and inspect failures. Build packages first.

Earlier packed CLI smoke required an ephemeral SECRETS_MASTER_KEY to avoid a
host keychain hang. It runs from a throwaway cwd and uses a timeout. No provider
keys are necessary for the no-model checks. Do not expose credentials.

Local verification logs are not transferred. Reproduce checks on the other
computer or use CI. Do not claim completion on review alone.

## Immediate continuation

1. Inspect the checkpoint diff and fix the remaining lint violations. Rebuild
   after the final mechanical lint edits and run focused tests plus mandatory
   checks. Push fixes and open or update a follow-up PR for this branch.
2. Continue A4.1 and A4.8 in parallel, then the dependent source/manifest cuts.
   Do not change the published CLI manifest's bundled packs until A24.
3. After A4 cuts, implement A8 core-only smoke and A9 size gate. Then continue
   publishing metadata, installed-pack source, cross-surface missing-pack
   errors, install flow/authorization/commands/npm matrix, and finally A24.

Useful cut boundaries already inspected:

- A4.1 owns runtime manifest, image-codec.ts, new canvas-codec.ts and exports,
  run-trace-processor.ts and hidden-dependency image/tracing tests. Enumerate
  all OpenTelemetry imports before moving peers. Add loadCanvas and use imaging
  errors. Trace libraries load only when a trace sink is set.
- A4.8 owns sandbox-compiler lazy esbuild and game-runtime optional Rapier.
  bundle.ts reads esbuild.version synchronously in optionsDigest, so coordinate
  its cache callers when making the load async. spatial3d/world.ts already
  imports Rapier dynamically, but needs structured missing-runtime and retry
  behavior verified with an actually hidden dependency.
- A4.2 depends on loadCanvas. A4.3 moves agents' pack imports through importPack.
  A4.5 cuts DSL packs. A4.6 cuts websocket packs and removes A12's temporary
  server fallback. A4.7 cuts CLI source imports while retaining manifest packs.

For every cut, update the exact import baseline, measure closure saving, retain
hidden-dependency regressions and run backend:smoke. Follow the plan's actual
acceptance criteria rather than treating a manifest-only cut as complete.

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
