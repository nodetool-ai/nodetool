---
name: nodetool-code-review
description: Review a diff, branch, or PR in this repo for correctness bugs and NodeTool-specific landmines — cross-package imports, ESM .js extensions, MsgPack WebSocket framing, Zustand subscriptions, ui_primitives and design tokens, decorator-package builds, packaged-Electron path flattening, IPC security. Use when the user asks to review changes, review a PR/branch/diff, check work before commit or merge, or audit code someone else wrote. For stripping AI slop from your own diff, use the unslop skill; a full pre-merge pass runs both.
---

# NodeTool Code Review

A correctness-first review of a change set, tuned to the bugs this codebase actually produces. Division of labor with the sibling skills:

- **This skill**: does the change work, and does it step on a NodeTool landmine?
- **[`unslop`](../unslop/SKILL.md)**: is the change free of AI-generated filler? Run it after this one for a full pre-merge pass.

The rules referenced here live in [`CLAUDE.md`](../../../CLAUDE.md), [`docs/DEVELOPMENT_STANDARDS.md`](../../../docs/DEVELOPMENT_STANDARDS.md), and the area `AGENTS.md` files. This skill turns them into things to hunt for in a diff.

## Process

1. **Scope the diff.**
   - Working tree: `git diff` + `git diff --cached` (and untracked files via `git status`).
   - Branch: `git diff $(git merge-base main HEAD)...HEAD` — never `git diff main` (picks up drift on main).
   - PR: fetch the branch, then the same merge-base diff.
2. **Map the blast radius.** `npm run dev:nodetool -- affected --base main --json` lists the workspaces to typecheck/test and tells you whether a decorator package (loads from `dist/`) forces `npm run build:packages`. Don't guess.
3. **Read hunks in context.** For every changed function, read the whole function and its callers — `Grep` for the symbol. A hunk that looks fine in isolation is where signature drift, missed call sites, and broken invariants hide. For changed types in `packages/protocol`, check every package that imports them.
4. **Hunt** with the checklists below, most-severe first.
5. **Verify.** Run the targeted commands from step 2. Per-package that's `npm run test --workspace=packages/<name>` and `npm run lint --workspace=packages/<name>` (packages typecheck via `build`, not a `typecheck` script); root `npm run typecheck` covers web/electron/mobile. If the diff is wide, `npm run check`. Report the actual output — never "should pass".
6. **Report** findings in the output format at the bottom.

## Severity

| Tier | Meaning | Bar |
|------|---------|-----|
| **Blocker** | Wrong behavior, crash, data loss, security hole, broken build | You can name the input/state that triggers it |
| **Should-fix** | Violates a written repo rule (CLAUDE.md, DEVELOPMENT_STANDARDS.md, AGENTS.md) | Cite the rule |
| **Nit** | Everything else worth a sentence | Only if you found nothing bigger in that file; never pad |

A finding without a failure scenario or a citable rule is not a finding. When unsure whether something is a bug, say so explicitly instead of inflating the severity.

## Checklists

### Cross-package (any `packages/` change)

- **Imports**: inter-package imports use `@nodetool-ai/<pkg>` — never `../other-pkg/` or anything containing `/dist/`.
- **ESM extensions**: relative imports need `.js` in compiled output. A missing extension typechecks but dies at runtime in built packages.
- **Dependency direction**: does the import respect the order `protocol → config → security/auth/storage → runtime → kernel → node-sdk → base-nodes → models → agents → chat → websocket/cli`? A lower package importing a higher one is a cycle waiting to happen.
- **Decorator packages** (`base-nodes`, `node-sdk`, `fal-nodes`, `replicate-nodes`, `elevenlabs-nodes`) load from `dist/`. A change here that isn't followed by `build:packages` silently tests stale code — confirm the verify step rebuilt.
- **Runtime data files**: anything loaded relative to `import.meta.url` (manifests, examples, `package://` assets) breaks in the packaged Electron app (backend is bundled into one `server.mjs`). Such files must be registered in `PACKAGE_RUNTIME_ASSETS` (`packages/config/src/package-asset-registry.ts`) and loaded via `loadPackageAssetJson`.
- **Protocol types**: new message/data shapes belong in `packages/protocol`, not re-declared locally.
- **Errors**: `throw new Error(...)`, never strings. Empty catch blocks need a comment saying why.
- **WebSocket framing**: WS messages are **MsgPack**, REST is JSON. `JSON.stringify` on a WS send path, or a msgpack decode missing on a receive path, is a blocker.
- **Streaming nodes**: `genProcess` must `yield`, not accumulate-and-return; check backpressure-sensitive paths don't buffer unbounded.

### Web (`web/src/`)

- **Raw MUI imports** outside `ui_primitives/` and `editor_ui/` — should-fix, migrate to primitives. Quick sweep of the diff's files:
  `rg "from ['\"]@mui/material" <changed files>`
- **Design tokens**: hardcoded border radii, font sizes, transition strings, off-4px-grid spacing, raw z-indexes → `BORDER_RADIUS`, `TYPOGRAPHY`/`var(--fontSize*)`, `MOTION`, `SPACING`, `Z_INDEX` from `ui_primitives` ([docs/DESIGN.md](../../../docs/DESIGN.md)).
- **Zustand**: whole-store subscription (`useFooStore()` with no selector) — blocker-adjacent, it re-renders on every store write. Multi-key object selectors need `useShallow`. `getState()` in render bodies is a bug; in handlers/effects it's fine.
- **New `WebSocket(...)`** anywhere — use the `GlobalWebSocketManager` singleton.
- **TanStack Query**: server data via `useQuery`/`useMutation`, hierarchical keys (`["workflows", id]`), `enabled` for conditional fetches, mutations invalidate affected keys. `useEffect`+`fetch` for backend data is should-fix.
- **ReactFlow**: unstable references passed as `nodes`/`edges`/`nodeTypes` props (fresh array/object each render) tank canvas performance — hoist or memoize `nodeTypes`, derive nodes/edges via selectors.
- **Effects**: check every new `useEffect` dependency array against what the body reads; a stale-closure over a store value or prop is a classic bug here.

### Electron (`electron/src/`)

Non-negotiable ([electron/src/AGENTS.md](../../../electron/src/AGENTS.md) § Security):

- `contextIsolation: true`, `nodeIntegration: false`, no `webSecurity: false`, no remote-content `BrowserWindow` without a strict preload.
- Every new IPC handler validates its inputs — renderer input is untrusted. Channel names typed, no `ipcMain.handle` passing raw args into `fs`/`child_process`/`shell.openExternal` without allow-listing.
- Paths resolved relative to `import.meta.url` or `__dirname`: verify against the packaged layout (§ Packaged file layout), not just dev.

### Mobile (`mobile/`)

- `mobile/` is **not** a root workspace. Scripts must use `npm --prefix mobile ...`; a diff that "standardizes" this to `--workspace=mobile` breaks it.
- Mobile typecheck needs `packages/protocol` built first.

### Tests

- New behavior in the diff without a test, or a changed behavior whose old test still passes unmodified — ask why.
- Vitest in `packages/`, Jest in `web/`/`electron/`, files in `__tests__/`.
- RTL queries by role/label, `userEvent`, `waitFor`/`findBy*` — no `setTimeout` sleeps, no `getByTestId` where a role query works.
- A test that mocks the unit under review, or re-implements its logic in the fixture, verifies nothing.

### Config / CI / docs

- `package.json` script or dependency changes: check the lockfile moved with it, and that sandboxed-install caveats (CLAUDE.md § Common Pitfalls) still hold.
- Changes to commands, architecture, or rules documented in `CLAUDE.md`/`AGENTS.md`: the doc must move in the same PR — that's a written rule, cite it.
- Prose follows [docs/WRITING_STYLE.md](../../../docs/WRITING_STYLE.md); flag slop words but leave the full prose pass to `unslop`.

## Quick greps

Run these over the changed files (not the whole repo — pre-existing hits are out of scope):

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

- Anything `npm run lint` or `npm run typecheck` already rejects — run them and report the output instead of duplicating it as prose findings.
- Style preferences with no backing in the repo docs. "I'd have written it differently" is not a finding.
- Pre-existing problems outside the diff. Mention once at the end if serious, don't mix into the findings list.
- Slop (comments, dead abstractions, prose filler) — one pointer to `unslop`, not itemized findings.

## Output format

Order findings blockers → should-fix → nits. Each one:

```
[BLOCKER] packages/kernel/src/actor.ts:142 — `pending` is never cleared on error
When a node throws, `handleError` returns early before `this.pending.delete(id)`,
so the runner waits forever on the next `sync_mode: on_any` join.
Fix: move the delete into a `finally`.
```

One line of location + claim, the failure scenario, the fix. End with the verification you actually ran and its result:

```
Verified: npm run build --workspace=packages/kernel ✓, npm run test --workspace=packages/kernel ✓ (34 passed)
```

If nothing is wrong, say so plainly and list what you checked — a clean review is a valid result, not a failure to find something.
