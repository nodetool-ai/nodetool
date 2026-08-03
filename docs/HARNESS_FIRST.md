# Harness-First Engineering

NodeTool is built by agents as much as by people. An agent cannot click a
button, watch a spinner, or eyeball a canvas — it can run a command, read a
report, and act on a verdict. Harness-first engineering makes that the primary
way every surface is exercised: **the headless harness is the interface; the
UI is a client of it.** Taken to its conclusion — and this repo takes it there
— the harness is also the merge gate: a diff selects the checks that must
pass, and the registry, not the author, decides what "verified" means.

This is already true for most of NodeTool. Workflows have `nodetool validate`
and `nodetool debug`, mini apps have `app debug` and `app build`, timelines
have `timeline validate/debug`, single nodes have `node run`, the planners and
tool contracts have thirteen eval suites, the kernel has the Ring 0
reliability journeys, the packaged backend and deploy image have smoke
harnesses. This document names the doctrine those grew into and the machinery
that keeps it true: a registry, an audit, and a gate.

## The rules

1. **No surface without a harness.** Every product surface — a thing a user
   or agent can author, run, or edit — is either covered by a headless harness
   or carries a written gap note in the registry saying why not and what its
   harness would look like. An uncovered surface with no note fails the build.

2. **The harness ships with the surface, not after it.** A feature PR that
   adds a surface adds its harness (or its gap note) in the same PR. "We'll
   add the harness later" is the debt the registry exists to make visible.

3. **The gate selects your checks — you don't.** A diff maps onto surfaces by
   the paths it touches, and every harness covering a touched surface runs its
   selfcheck: `nodetool harness gate --base main`. Hand-picking which checks
   to run is how the check you skipped becomes the bug you shipped. Harnesses
   without a selfcheck are listed as manual work the gate cannot do for you.

4. **A capability exists when its harness can drive it.** Nothing lands
   UI-first: the CLI or agent-tool form of a capability is the capability, and
   the UI renders it. `debug_workflow` and `nodetool debug` share one reducer;
   the app simulator serves the CLI, the build loop, and the server; the
   Code-node analysis serves the validator, the planner, and the editor. A
   harness never reimplements the behavior it checks — the core lives in a
   shared package (`@nodetool-ai/execution`, `@nodetool-ai/node-sdk`,
   `app-runtime`) and every host calls it, so harness and product cannot
   drift.

5. **A bug fix ships its harness reproduction.** Not a description of the bug
   — a case that fails before the fix and passes after, at the harness level:
   a validator rule, a golden journey, a deterministic eval case, a debug
   fixture. A fix without a reproduction is a claim, not a fix.

6. **Reports are for machines first.** Every harness has `--json` (or writes
   a JSON report into its bundle) and an exit code that is the verdict.
   Human-readable output is a rendering of the report, never the only form.

7. **Fail closed.** A judge that times out scores the case as failed, an
   unanswered escalation fails on its timeout, a budget that runs out ends the
   build as failed. A harness that cannot decide never reports success —
   see the "gates that reported success without checking anything" class of
   bug this repo has already paid for.

8. **The failure path is drivable.** Where a run can escalate, an agent can
   sit on the failure path (`--supervise`, `interactive: true`,
   `resolve_workflow_escalation`) instead of the harness only observing the
   wreckage.

9. **The loop is live.** Iterative harnesses grow `--watch` with a verdict
   diff, so edit→verify is a running process, not a fresh full report each
   save.

## The registry

`packages/cli/src/harness/registry.ts` is the machine-readable inventory:
every harness (id, canonical command, capabilities, agent tool, selfcheck,
docs pointer) and every surface (the harnesses covering it, the code paths it
owns, or its gap note).

```bash
npm run dev:nodetool -- harness list            # every harness + capabilities
npm run dev:nodetool -- harness audit           # surface coverage + gaps
npm run dev:nodetool -- harness audit --json    # for agents
npm run dev:nodetool -- harness audit --strict  # exit 1 while any gap remains
```

`audit` always exits non-zero on a *broken* registry (an uncovered surface
with no gap note, or a surface referencing a harness that does not exist);
`--strict` also fails on documented gaps — the ratchet to pull once a gap is
closed. `packages/cli/tests/harness-registry.test.ts` enforces the same
invariants in CI, so the registry cannot rot silently.

## The gate

```bash
npm run dev:nodetool -- harness gate                 # gate the working tree
npm run dev:nodetool -- harness gate --base main     # gate a branch diff
npm run dev:nodetool -- harness gate --dry-run       # plan only, run nothing
npm run dev:nodetool -- harness gate --all           # every selfcheck, diff ignored
npm run dev:nodetool -- harness gate --expensive     # include bundle-staging class checks
npm run dev:nodetool -- harness gate --strict        # fail when a touched surface has no harness
```

The gate reads the diff, maps files to surfaces by path prefix, and runs the
selfcheck of every harness covering a touched surface. A selfcheck is
keyless, deterministic, and target-free: `validate` runs over every shipped
example workflow, `reliability-ring0` replays the golden journeys on the
kernel, `app-debug` wiring-checks a shipped bundle, `app-build` runs its two
deterministic cases with a provider that is never called, `node-run` executes
a real node hermetically. Touch `packages/kernel/` and the kernel's journeys
run; touch `packages/agents/src/app-build/` and the build harness proves
itself; touch nothing mapped and nothing runs.

Exit code: non-zero when any selfcheck fails, or — with `--strict` — when the
diff touches a surface only a gap note covers. Harnesses that need a target,
key, or model are printed as manual work; the gate never silently narrows what
"checked" means (rule 7).

The Quality Gate's `examples`, `reliability`, `app-build`, and `bundle` legs
are hand-instantiated selfchecks from this registry; the direction of travel
is for CI to converge on `harness gate` so the workflow file stops being a
second, driftable copy of the selection logic.

## Adding a surface or a harness

1. Build the core in a shared package; keep the CLI to flags, target
   resolution, and bundle writing (the pattern every existing harness
   follows).
2. Add a `HarnessEntry` with the canonical command, and add or update the
   `SurfaceEntry` it covers — including the `paths` the surface owns, which
   is what routes future diffs to your harness. Closing a documented gap
   means deleting its `gap` note and pointing at the new harness.
3. Give the harness `--json` and a meaningful exit code from day one, and a
   `selfcheck` if any invocation can run keyless and target-free — a harness
   the gate can run is worth ten the author has to remember.
4. Document it in CLAUDE.md next to the other harnesses, in the same PR.

## Current gaps

Run `nodetool harness audit` for the live list. As of this writing: the
mobile app (the tool contract exists — drive it headlessly like the tool-loop
evals do) and the Electron shell (unit tests only; a harness would boot the
packaged shell under Playwright's Electron driver).
