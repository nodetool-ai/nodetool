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
tool contracts have seventeen eval suites, the kernel has the Ring 0
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

10. **A harness runs what the runner runs.** Rule 4 keeps the *logic* shared;
    it does not stop a harness from *constructing* the run differently. That
    is a distinct failure, and a nastier one: the harness and the product call
    the same core, so nothing looks reimplemented, and the report is confidently
    wrong. `nodetool debug` handed `ExecutionSession` a registry but no
    `resolveNodeType`, which hydrates node flags and leaves `propertyTypes`
    empty. Correlation analysis reads list-ness only from that map, so every
    `list[...]` handle read as non-list and a stream arriving on one collapsed
    to the last value. Same graph, two answers:

    ```
    workflows run   keyframe=2  animate=2
    debug           keyframe=2  animate=1
    ```

    `Directed Film to Timeline` looked like it generated N keyframes and
    animated one. It does that under `debug` and not under the runner — a
    debugging session went looking for a kernel bug that did not exist, and a
    validator rule was written for it before anyone reproduced the claim
    through the real runner.

    So: when a harness reports a defect, confirm it through the canonical
    runner before diagnosing; if they disagree, the harness is the first
    suspect, and the thing to diff is how each *builds* the run, not what the
    graph contains. Construction differences are auditable —
    `packages/execution/tests/execution-session-hydration-audit.test.ts` walks
    every `ExecutionSession.create` and fails on any that passes a registry
    without a resolver, with a `KNOWN_UNHYDRATED` map for the surfaces that
    deliberately differ and why.

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

## The capability table

A surface is coarse: `packages/agents/` is one path, so the gate cannot tell a
diff that *adds* a capability from one that renames a local variable. Five
capabilities shipped through that hole with nothing exercising them.

`packages/cli/src/harness/capability-table.ts` closes it, with the registry's
invariant one rung down: no capability without a check or a documented gap.
Each entry names the implementation file, the suites a selfcheck runs over the
capability, the eval cases whose `requiredTools` demand it, or the gap note
saying what a check for it would look like.

```bash
npm run capabilities:sync                        # rewrite from the live registry
npm run capabilities:check                       # fail when stale or uncovered
npm run dev:nodetool -- harness capabilities     # coverage + documented gaps
```

Only `gap` is written by hand; the sync derives the rest and preserves the
notes. Each entry also carries a fingerprint of what the capability declares —
name, description, input schema, category, `needsToolCallId` — which is what
lets `harness gate --base <ref>` demand a mapping change from a contract change
and nothing from a refactor. Details:
[packages/agents/AGENTS.md § Capability coverage](https://github.com/nodetool-ai/nodetool/blob/main/packages/agents/AGENTS.md).

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

Exit code: non-zero when any selfcheck fails, when a capability's declared
contract moved without its coverage mapping moving with it, or — with
`--strict` — when the diff touches a surface only a gap note covers. Harnesses that need a target,
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
4. Document it in AGENTS.md next to the other harnesses, in the same PR.

## Current gaps

Run `nodetool harness audit` for the live list. As of this writing: the
mobile app (the tool contract exists — drive it headlessly like the tool-loop
evals do) and the Electron shell (unit tests only; a harness would boot the
packaged shell under Playwright's Electron driver).
