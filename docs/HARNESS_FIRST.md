# Harness-First Engineering

NodeTool is built by agents as much as by people. An agent cannot click a
button, watch a spinner, or eyeball a canvas — it can run a command, read a
report, and act on a verdict. Harness-first engineering makes that the primary
way every surface is exercised: **the headless harness is the interface; the
UI is a client of it.**

This is already true for most of NodeTool. Workflows have `nodetool validate`
and `nodetool debug`, mini apps have `app debug` and `app build`, timelines
have `timeline validate/debug`, single nodes have `node run`, the planners and
tool contracts have thirteen eval suites, the packaged backend and deploy
image have smoke harnesses. This document names the doctrine those grew into,
and adds the ratchet that keeps it true: a registry and an audit.

## The rules

1. **No surface without a harness.** Every product surface — a thing a user
   or agent can author, run, or edit — is either covered by a headless harness
   or carries a written gap note in the registry saying why not and what its
   harness would look like. An uncovered surface with no note fails the build.

2. **The harness ships with the surface, not after it.** A feature PR that
   adds a surface adds its harness (or its gap note) in the same PR. "We'll
   add the harness later" is the debt the registry exists to make visible.

3. **One core, many hosts.** A harness never reimplements the behavior it
   checks. The simulator, validator, or reducer lives in a shared package
   (`@nodetool-ai/execution`, `@nodetool-ai/node-sdk`, `app-runtime`) and the
   CLI, the server tool, and the UI all call it — so the harness cannot drift
   from what the product does. `debug_workflow` and `nodetool debug` share
   one reducer; the app simulator serves the CLI, the build loop, and the
   server; the Code-node analysis serves the validator, the planner, and the
   editor.

4. **Reports are for machines first.** Every harness has `--json` (or writes
   a JSON report into its bundle) and an exit code that is the verdict.
   Human-readable output is a rendering of the report, never the only form.

5. **Fail closed.** A judge that times out scores the case as failed, an
   unanswered escalation fails on its timeout, a budget that runs out ends the
   build as failed. A harness that cannot decide never reports success —
   see the "gates that reported success without checking anything" class of
   bug this repo has already paid for.

6. **The failure path is drivable.** Where a run can escalate, an agent can
   sit on the failure path (`--supervise`, `interactive: true`,
   `resolve_workflow_escalation`) instead of the harness only observing the
   wreckage.

7. **The loop is live.** Iterative harnesses grow `--watch` with a verdict
   diff, so edit→verify is a running process, not a fresh full report each
   save.

## The registry

`packages/cli/src/harness/registry.ts` is the machine-readable inventory:
every harness (id, canonical command, capabilities, agent tool, docs pointer)
and every surface (with the harnesses covering it, or its gap note).

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

## Adding a surface or a harness

1. Build the core in a shared package; keep the CLI to flags, target
   resolution, and bundle writing (the pattern every existing harness
   follows).
2. Add a `HarnessEntry` with the canonical command, and add or update the
   `SurfaceEntry` it covers. Closing a documented gap means deleting its
   `gap` note and pointing at the new harness.
3. Give it `--json` and a meaningful exit code from day one.
4. Document it in CLAUDE.md next to the other harnesses, in the same PR.

## Current gaps

Run `nodetool harness audit` for the live list. As of this writing: the
mobile app (the tool contract exists — drive it headlessly like the tool-loop
evals do) and the Electron shell (unit tests only; a harness would boot the
packaged shell under Playwright's Electron driver).
