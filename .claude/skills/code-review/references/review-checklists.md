# Review checklists

Read the sections relevant to the changed files. Repository instructions take
precedence over the smell heuristics below.

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
- **Design tokens**: hardcoded border radii, font sizes, transition strings, off-4px-grid spacing, raw z-indexes → `BORDER_RADIUS`, `TYPOGRAPHY`/`var(--fontSize*)`, `MOTION`, `SPACING`, `Z_INDEX` from `ui_primitives` ([docs/DESIGN.md](../../../../docs/DESIGN.md)).
- **Zustand**: a whole-store subscription (`useFooStore()` with no selector) re-renders on every store write. Multi-key object selectors need `useShallow`. `getState()` in a render body is a bug; in handlers and effects it's fine.
- **New `WebSocket(...)`** anywhere — use the `GlobalWebSocketManager` singleton.
- **TanStack Query**: server data via `useQuery`/`useMutation`, hierarchical keys (`["workflows", id]`), `enabled` for conditional fetches, mutations invalidate affected keys. `useEffect`+`fetch` for backend data is should-fix.
- **ReactFlow**: unstable references passed as `nodes`/`edges`/`nodeTypes` (a fresh array or object each render) tank canvas performance — hoist or memoize `nodeTypes`, derive nodes and edges via selectors.
- **Effects**: check every new `useEffect` dependency array against what the body reads; a stale closure over a store value or prop is a classic bug here.

### Electron (`electron/src/`)

Non-negotiable ([electron/src/AGENTS.md](../../../../electron/src/AGENTS.md) § Security):

- `contextIsolation: true`, `nodeIntegration: false`, no `webSecurity: false`, no remote-content `BrowserWindow` without a strict preload.
- Every new IPC handler validates its inputs — renderer input is untrusted. Channel names typed, no `ipcMain.handle` passing raw args into `fs`, `child_process`, or `shell.openExternal` without allow-listing.
- Paths resolved relative to `import.meta.url` or `__dirname`: verify against the packaged layout (§ Packaged file layout), not just dev.

### Mobile (`mobile/`)

- `mobile/` is **not** a root workspace. Scripts must use `npm --prefix mobile ...`; a diff that "standardizes" this to `--workspace=mobile` breaks it.
- Mobile typecheck needs `packages/protocol` built first.

### Tests

- Check that tests detect the changed behavior. Passing existing tests alone do not establish coverage, and a small reversible edit does not automatically need a new test.
- Vitest in `packages/`, Jest in `web/` and `electron/`, files in `__tests__/`.
- RTL queries by role or label, `userEvent`, `waitFor`/`findBy*` — no `setTimeout` sleeps, no `getByTestId` where a role query works.
- A test that mocks the unit under review, or re-implements its logic in the fixture, verifies nothing.

### Config, CI, docs

- `package.json` script or dependency changes: check the lockfile moved with it, and that the sandboxed-install caveats (AGENTS.md § Common Pitfalls) still hold.
- Changes to commands, architecture, or rules documented in `AGENTS.md`: the doc must move in the same PR — that's a written rule, cite it.
- Prose follows [docs/WRITING_STYLE.md](../../../../docs/WRITING_STYLE.md); flag slop words but leave the full prose pass to `unslop`.
- User-facing copy (marketing site, product strings, release notes, node and workflow descriptions) also follows [docs/BRAND.md](../../../../docs/BRAND.md): outcome before mechanism, no `credits`/`tokens` as billing, no `chatbot` for the agent, no `powered by AI` where a model name fits.

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
