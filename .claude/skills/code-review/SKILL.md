---
name: code-review
description: Review a diff, branch, or PR along three axes — Correctness (does it work, and does it step on a NodeTool landmine like cross-package imports, MsgPack framing, Zustand subscriptions, ui_primitives, packaged-Electron paths, IPC security?), Standards (does it follow the repo's documented rules, plus a Fowler smell baseline?), and Spec (does it implement what the originating issue asked for?). Runs the axes as parallel sub-agents and reports them side by side. Use when the user wants to review changes, a branch, a PR, or work before commit or merge, or asks to "review since X". For stripping AI slop from your own diff, use the unslop skill; a full pre-merge pass runs both.
---

# Code Review

Three-axis review of the diff between `HEAD` and a fixed point:

- **Correctness** — does the change work, and does it step on a NodeTool landmine?
- **Standards** — does it follow this repo's documented rules?
- **Spec** — does it faithfully implement the originating issue or spec?

Each axis runs as a **parallel sub-agent** so they don't pollute each other's context. This skill scopes the diff first, then aggregates.

Division of labor with the sibling skill: [`unslop`](../unslop/SKILL.md) asks whether the change is free of AI-generated filler. Run it after this one for a full pre-merge pass.

The rules the Correctness and Standards axes cite live in [`AGENTS.md`](../../../AGENTS.md), [`docs/DEVELOPMENT_STANDARDS.md`](../../../docs/DEVELOPMENT_STANDARDS.md), and the area `AGENTS.md` files.

## Process

### 1. Pin the fixed point

Whatever the user named is the fixed point — a commit SHA, branch, tag, `main`, `HEAD~5`. If they named none, infer from what they asked for:

- Working tree: `git diff` + `git diff --cached`, plus untracked files via `git status`.
- Branch or PR: `git diff $(git merge-base main HEAD)...HEAD` — never `git diff main`, which picks up drift on main. For a PR, fetch the branch first.

Capture the diff command once, and the commit list via `git log <fixed-point>..HEAD --oneline`. Confirm the ref resolves (`git rev-parse`) and the diff is non-empty before going further — a bad ref should fail here, not inside three sub-agents.

### 2. Map the blast radius

`npm run dev:nodetool -- affected --base main --json` lists the workspaces to typecheck and test, and says whether a decorator package (loads from `dist/`) forces `npm run build:packages`. Don't guess.

### 3. Find the spec

In order:

1. Issue references in the commit messages (`#123`, `Closes #45`).
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch or feature.
4. Otherwise ask. If there is no spec, the Spec sub-agent is skipped and the report says so.

### 4. Find the standards sources

`AGENTS.md`, `docs/DEVELOPMENT_STANDARDS.md`, the `AGENTS.md` for each area the diff touches, and anything else the repo documents about how code should be written.

On top of those, the Standards axis always carries the [smell baseline](#smell-baseline) below, which applies even where a repo documents nothing. Two rules bind it: a documented repo standard always wins, and every smell is a labelled heuristic ("possible Feature Envy"), never a hard violation.

### 5. Spawn the sub-agents in parallel

One message, three `Agent` calls, `general-purpose` for each. Give every prompt the diff command, the commit list, and the path to this file (`.claude/skills/code-review/SKILL.md`) so the sub-agent can read the section it needs.

**Correctness** — "Read § Correctness checklists, § Severity, and § Quick greps in `.claude/skills/code-review/SKILL.md`. Read each changed function whole, and its callers — grep the symbol; a hunk that looks fine in isolation is where signature drift and broken invariants hide. For changed types in `packages/protocol`, check every package importing them. Report findings most-severe first; each needs a failure scenario you can name the input for, or a citable rule. Under 500 words."

**Standards** — "Read § Smell baseline in `.claude/skills/code-review/SKILL.md`, plus these standards sources: <list from step 4>. Report, per file or hunk: (a) every place the diff violates a documented standard — cite the file and rule; (b) any baseline smell — name it and quote the hunk. Documented standards override the baseline, and baseline smells are always judgement calls. Skip anything lint or typecheck enforces. Under 400 words."

**Spec** — "The spec is at <path or contents>. Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff nobody asked for; (c) requirements that look implemented but implemented wrong. Quote the spec line for each finding. Under 400 words."

### 6. Verify

While the sub-agents run, run the targeted commands from step 2: `npm run test --workspace=packages/<name>` and `npm run lint --workspace=packages/<name>` per package (packages typecheck via `build`, not a `typecheck` script); root `npm run typecheck` covers web, electron, and mobile. If the diff is wide, `npm run check`. Report the actual output — never "should pass".

### 7. Aggregate

Present the reports under `## Correctness`, `## Standards`, and `## Spec`, verbatim or lightly cleaned. Do **not** merge or rerank findings across axes — see [Why three axes](#why-three-axes). End with one line per axis: total findings, the worst one, and the verification you ran.

## Severity

| Tier | Meaning | Bar |
|------|---------|-----|
| **Blocker** | Wrong behavior, crash, data loss, security hole, broken build | You can name the input or state that triggers it |
| **Should-fix** | Violates a written repo rule | Cite the rule |
| **Nit** | Everything else worth a sentence | Only if you found nothing bigger in that file; never pad |

A finding without a failure scenario or a citable rule is not a finding. When unsure whether something is a bug, say so instead of inflating the severity.

## Correctness checklists

### Cross-package (any `packages/` change)

- **Imports**: inter-package imports use `@nodetool-ai/<pkg>` — never `../other-pkg/` or anything containing `/dist/`.
- **ESM extensions**: relative imports need `.js` in compiled output. A missing extension typechecks but dies at runtime in built packages.
- **Dependency direction**: does the import respect `protocol → config → security/auth/storage → runtime → kernel → node-sdk → base-nodes → models → agents → chat → websocket/cli`? A lower package importing a higher one is a cycle waiting to happen.
- **Decorator packages** (`base-nodes`, `node-sdk`, `fal-nodes`, `replicate-nodes`, `elevenlabs-nodes`) load from `dist/`. A change here that isn't followed by `build:packages` silently tests stale code — confirm the verify step rebuilt.
- **Runtime data files**: anything loaded relative to `import.meta.url` (manifests, examples, `package://` assets) breaks in the packaged Electron app, where the backend is bundled into one `server.mjs`. Such files must be registered in `PACKAGE_RUNTIME_ASSETS` (`packages/config/src/package-asset-registry.ts`) and loaded via `loadPackageAssetJson`.
- **Protocol types**: new message or data shapes belong in `packages/protocol`, not re-declared locally.
- **Errors**: `throw new Error(...)`, never strings. Empty catch blocks need a comment saying why.
- **WebSocket framing**: WS messages are **MsgPack**, REST is JSON. `JSON.stringify` on a WS send path, or a missing msgpack decode on a receive path, is a blocker.
- **Streaming nodes**: `genProcess` must `yield`, not accumulate-and-return; check that backpressure-sensitive paths don't buffer unbounded.

### Web (`web/src/`)

- **Raw MUI imports** outside `ui_primitives/` and `editor_ui/` — should-fix, migrate to primitives.
- **Design tokens**: hardcoded border radii, font sizes, transition strings, off-4px-grid spacing, raw z-indexes → `BORDER_RADIUS`, `TYPOGRAPHY`/`var(--fontSize*)`, `MOTION`, `SPACING`, `Z_INDEX` from `ui_primitives` ([docs/DESIGN.md](../../../docs/DESIGN.md)).
- **Zustand**: a whole-store subscription (`useFooStore()` with no selector) re-renders on every store write. Multi-key object selectors need `useShallow`. `getState()` in a render body is a bug; in handlers and effects it's fine.
- **New `WebSocket(...)`** anywhere — use the `GlobalWebSocketManager` singleton.
- **TanStack Query**: server data via `useQuery`/`useMutation`, hierarchical keys (`["workflows", id]`), `enabled` for conditional fetches, mutations invalidate affected keys. `useEffect`+`fetch` for backend data is should-fix.
- **ReactFlow**: unstable references passed as `nodes`/`edges`/`nodeTypes` (a fresh array or object each render) tank canvas performance — hoist or memoize `nodeTypes`, derive nodes and edges via selectors.
- **Effects**: check every new `useEffect` dependency array against what the body reads; a stale closure over a store value or prop is a classic bug here.

### Electron (`electron/src/`)

Non-negotiable ([electron/src/AGENTS.md](../../../electron/src/AGENTS.md) § Security):

- `contextIsolation: true`, `nodeIntegration: false`, no `webSecurity: false`, no remote-content `BrowserWindow` without a strict preload.
- Every new IPC handler validates its inputs — renderer input is untrusted. Channel names typed, no `ipcMain.handle` passing raw args into `fs`, `child_process`, or `shell.openExternal` without allow-listing.
- Paths resolved relative to `import.meta.url` or `__dirname`: verify against the packaged layout (§ Packaged file layout), not just dev.

### Mobile (`mobile/`)

- `mobile/` is **not** a root workspace. Scripts must use `npm --prefix mobile ...`; a diff that "standardizes" this to `--workspace=mobile` breaks it.
- Mobile typecheck needs `packages/protocol` built first.

### Tests

- New behavior without a test, or changed behavior whose old test still passes unmodified — ask why.
- Vitest in `packages/`, Jest in `web/` and `electron/`, files in `__tests__/`.
- RTL queries by role or label, `userEvent`, `waitFor`/`findBy*` — no `setTimeout` sleeps, no `getByTestId` where a role query works.
- A test that mocks the unit under review, or re-implements its logic in the fixture, verifies nothing.

### Config, CI, docs

- `package.json` script or dependency changes: check the lockfile moved with it, and that the sandboxed-install caveats (AGENTS.md § Common Pitfalls) still hold.
- Changes to commands, architecture, or rules documented in `AGENTS.md`: the doc must move in the same PR — that's a written rule, cite it.
- Prose follows [docs/WRITING_STYLE.md](../../../docs/WRITING_STYLE.md); flag slop words but leave the full prose pass to `unslop`.
- User-facing copy (marketing site, product strings, release notes, node and workflow descriptions) also follows [docs/BRAND.md](../../../docs/BRAND.md): outcome before mechanism, no `credits`/`tokens` as billing, no `chatbot` for the agent, no `powered by AI` where a model name fits.

## Smell baseline

A fixed set of Fowler code smells (_Refactoring_, ch. 3) the Standards axis carries on top of whatever the repo documents. Each reads *what it is* → *how to fix*; match against the diff.

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together, a type wanting to be born. → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch` or `if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files. → gather what changes together into one module.
- **Divergent Change** — one file or module edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

## Quick greps

Over the changed files, not the whole repo — pre-existing hits are out of scope.

```bash
rg "@nodetool-ai/[a-z-]+/dist"            # dist imports (always wrong)
rg "new WebSocket\("                       # bypassing GlobalWebSocketManager
rg "JSON\.(stringify|parse)" packages/websocket packages/runtime   # on WS paths only
rg "from ['\"]@mui/material" web/src       # outside ui_primitives/, editor_ui/
rg ": any\b|as any\b|as unknown as"        # strict mode escapes
rg "console\.log"                          # leftover debug output
```

A grep hit is a lead, not a finding — read the site before reporting.

## What not to flag

- Anything `npm run lint` or `npm run typecheck` already rejects — report their output instead of duplicating it as prose findings.
- Style preferences with no backing in the repo docs. "I'd have written it differently" is not a finding.
- Pre-existing problems outside the diff. Mention once at the end if serious; don't mix them into the findings.
- Slop — comments, dead abstractions, prose filler. One pointer to `unslop`, not itemized findings.

## Output format

Within each axis, order findings blockers → should-fix → nits. Each one:

```
[BLOCKER] packages/kernel/src/actor.ts:142 — `pending` is never cleared on error
When a node throws, `handleError` returns early before `this.pending.delete(id)`,
so the runner waits forever on the next `sync_mode: on_any` join.
Fix: move the delete into a `finally`.
```

One line of location and claim, the failure scenario, the fix. Close with what you actually ran:

```
Verified: npm run build --workspace=packages/kernel ✓, npm run test --workspace=packages/kernel ✓ (34 passed)
```

If nothing is wrong, say so plainly and list what you checked — a clean review is a valid result, not a failure to find something.

## Why three axes

A change can pass one and fail another:

- Code that follows every standard and implements the wrong thing → Standards pass, Spec fail.
- Code that does exactly what the issue asked and breaks the project's conventions → Spec pass, Standards fail.
- Code that satisfies both and deadlocks the runner → Correctness fail.

Reporting them separately stops one axis from masking another.
