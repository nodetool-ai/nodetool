---
layout: page
title: "Development Standards"
permalink: /development-standards
description: "Canonical development standards for NodeTool — enforceable rules and aspirational targets, derived from best practices for the actual stack in use."
---

# NodeTool Development Standards

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [CLAUDE.md](../CLAUDE.md) → **Development Standards**

This is the single canonical source for the engineering standards we enforce. Every other AGENTS.md file links here for area-specific rules. Standards are written as **enforceable rules** ("must", "never") with the underlying **principle** when non-obvious. Aspirational targets (north-stars we have not yet reached everywhere) are marked **target**.

When in doubt, the order of precedence is:

1. Security — never weaken security to ship a feature.
2. Correctness — types pass, tests pass, no runtime regressions.
3. Maintainability — small surface area, clear ownership, no dead code.
4. Performance — measured, not assumed.
5. Convenience — last priority.

---

## 1. TypeScript

NodeTool is TypeScript-first. Strict mode is on everywhere (`tsconfig.base.json`, `web/tsconfig.json`, `electron/tsconfig.json`).

### Rules

- **Strict mode is non-negotiable.** Never turn off `strict`, `noImplicitAny`, `strictNullChecks`, or `strictFunctionTypes` in any tsconfig.
- **Documented tsconfig exception — `noUnusedLocals` / `noUnusedParameters`.** `tsconfig.base.json` enables both, but the node-implementation, codegen, and agent packages (`agents`, `cli`, `*-nodes`, `*-codegen`, `nodes-utils`, `workflow-runner`) override them to `false`. This is intentional: decorator-`declare`d node props, generated code, and interface-driven `process()` signatures routinely leave locals/params unused. Do not "fix" these overrides; keep new packages of the same kind consistent. All other packages inherit the strict base.
- **No `any`** in new code. **target**: zero `any` in `web/src` and `electron/src`. The ESLint override that allows `any` in `packages/*` (see `eslint.config.mjs`) is a transitional concession — new code must use `unknown` + narrowing, generics, or proper types.
- **Prefer `unknown` over `any`** at boundaries (parsed JSON, IPC, network). Narrow with a type guard or Zod schema before use.
- **No non-null assertions (`!`)** except in tests. Use a type guard, `assertDefined()` helper, or an `if (!x) throw` check.
- **No `as` casts** to widen or sidestep types. `as const` and `as unknown as T` (with a comment explaining why) are the only acceptable forms.
- **Prefer discriminated unions** over optional fields with implicit invariants. If a `result` shape varies by `status`, model it as `{ status: "ok"; data } | { status: "error"; error }`.
- **`readonly` by default** for public properties and array params that are not mutated. **target**: all DTOs returned from `packages/protocol` are `readonly`.
- **Branded types** for IDs that must not be confused (`type WorkflowId = string & { readonly __brand: "WorkflowId" }`). **target**: all entity IDs in `@nodetool-ai/models` and `@nodetool-ai/protocol`.
- **`exactOptionalPropertyTypes`** is currently `false` in `tsconfig.base.json`. **target**: flip to `true`. Until then, do not pass `undefined` explicitly for absent fields — omit the key.
- **No `// @ts-ignore`.** Use `// @ts-expect-error <reason>` so the suppression is removed when the error goes away.
- **No `Function`, `Object`, `{}` types.** Use specific signatures.
- **No `enum`** in new code — use `as const` objects + `keyof typeof` unions. Enums break tree-shaking and emit runtime code.
- **`const` by default**, `let` only when reassignment is required, never `var`.
- **Strict equality (`===` / `!==`)**, except `== null` for null/undefined checks.

### Type-level principles

- Make illegal states unrepresentable. If two fields cannot both be set, the type must enforce that.
- Push narrowing as close to the boundary as possible — once data has crossed the boundary it should be in its final, fully-typed shape.
- Prefer inference for locals, explicit types for public function signatures and module exports.

---

## 2. ES Modules & Node Runtime

All packages use `"type": "module"`. The required runtime is **Node.js 22.22.1** (see `.nvmrc`) to match Electron 39's embedded Node.

### Rules

- **ESM only.** No `require()`, no `module.exports` in new code.
- **Imports in source must omit extensions for workspace packages** (`@nodetool-ai/foo`) and **include `.js` for relative imports in compiled output** (TypeScript NodeNext rule). When in doubt, look at neighboring files.
- **Never import from `dist/`** in source code. Always `@nodetool-ai/<package>`.
- **Top-level `await` is allowed** in ESM but should be reserved for initialization paths that block startup intentionally. Don't use it to dodge proper async wiring.
- **`AbortController` / `AbortSignal`** is mandatory for any cancellable async operation — long-running fetches, streams, subprocesses, LLM calls. Plumb the signal through; do not invent custom cancellation flags.
- **Native fetch (Node 22)** — no `node-fetch`, no `axios` in new code unless there is a specific reason (e.g. interceptor needs) documented in the PR.
- **No CommonJS interop hacks.** If a dep is CJS-only, import its default export and document the constraint.
- **Pin Node version** in CI and package `engines`. **target**: every workspace `package.json` declares `"engines": { "node": ">=22.22.1 <23" }`.

---

## 3. React

The web app runs **React 18.2**; Electron renderer runs **React 19.1**. Mobile uses React Native + Expo. Treat React 19 features (use, transitions, async actions, Server Components — Electron only) as opt-in for the Electron tree; the web tree must remain compatible with 18.

### Rules

- **Functional components only.** No class components. No legacy lifecycle methods.
- **Typed props interfaces** for every component. Do not infer props from JSX usage.
- **One default export per file** for components; named exports for hooks and utilities.
- **Never mutate state.** Use immutable updates; pass new references.
- **Stable keys** in lists — never use the array index when the list reorders. Use a stable ID.
- **`useEffect` is for side effects only** (subscriptions, timers, DOM, network). **Never** use it to compute derived state — that's what `useMemo` or simple inline computation is for.
- **Effect cleanup is mandatory** for any effect that creates a subscription, timer, controller, or listener. Effects that race must use an `AbortController` or an `isMounted` ref pattern (signal preferred).
- **Don't pass inline functions** to memoized children. Use `useCallback` only when (a) the function is a dependency of an effect/memo, or (b) it's passed to a `React.memo`'d child.
- **`useMemo` / `React.memo` only when measured.** Add only after observing a render problem in React DevTools. Premature memoization is forbidden because it adds maintenance cost.
- **No `useLayoutEffect`** unless you genuinely need synchronous DOM measurement before paint. Document why.
- **Error boundaries** wrap every route and every async data section. **target**: a default error boundary at the route level emits a structured error event to telemetry.
- **Suspense boundaries** wrap every lazy-loaded subtree, every TanStack Query suspense hook, and every `lazy()` component.
- **Refs for imperative APIs only.** Don't use refs to share state between components.
- **No `React.useContext` directly** in `web/src` — go through the typed hook helpers from `web/src/contexts/`. Contexts are for store delivery, not state.
- **Accessibility (a11y) is a build-time concern** — see §15. New components must pass `eslint-plugin-jsx-a11y` rules. **target**: all interactive components pass `axe-core` automated checks.
- **Concurrent-safe rendering.** Components must be idempotent within a single render pass. No mutation, no side effects, no `Math.random` / `Date.now` reads outside `useMemo`/`useEffect`.

### Hooks decision matrix

| Hook | Use when | Don't use when |
|------|----------|----------------|
| `useState` | Local UI state that changes over the component's life | Derived value (compute inline) |
| `useReducer` | Multiple related state transitions, complex logic | Single boolean |
| `useEffect` | Side effects on commit | Deriving data; running on every render |
| `useLayoutEffect` | Measuring DOM before paint | Anything else |
| `useMemo` | Expensive computation (>1ms) or referential stability for deps | Cheap pure functions |
| `useCallback` | Dep of effect/memo, or prop to `React.memo` child | Function used only locally |
| `useTransition` (R18) | Marking state updates as non-urgent | Urgent updates |
| `useDeferredValue` (R18) | Defer expensive child renders | Anything else |
| `use` (R19, Electron) | Reading a Promise/Context conditionally | Code that runs in web (R18) |

---

## 4. Zustand

Stores live in `web/src/stores/` (Zustand 4.5.7) and `electron/src/stores/` (Zustand 5.0.3). Both versions support the slice pattern and `subscribeWithSelector`.

### Rules

- **One store per domain.** Don't fold unrelated concerns into a giant store. Slice pattern is preferred for stores that exceed ~200 lines.
- **Always use selectors.** `useStore(state => state.value)`, never `const state = useStore()`. The latter subscribes to every change.
- **Use `shallow` equality** for multi-field selections: `useStore(state => ({ a: state.a, b: state.b }), shallow)`.
- **Actions live in the store**, alongside state. Don't define mutator hooks elsewhere.
- **Never store derived data.** Compute it in selectors or `useMemo` at the call site.
- **Never store server data in Zustand.** Server state lives in TanStack Query.
- **`persist` middleware** for user preferences only. Validate persisted data on load (use a Zod schema and version field) — never trust localStorage.
- **`subscribe` outside React** must be used carefully — return the unsubscribe function and call it in `useEffect` cleanup.
- **No store imports outside hooks/components.** Side-effecting code (timers, listeners) that needs store access goes in middleware or a wrapper hook, not module-level `useStore.getState()` calls.
- **Action naming**: verbs in present tense (`addNode`, `setActiveTab`, `clearSelection`), never `handleX` or `onX` (those belong on components).

### target

- All stores have an associated `__tests__/<storeName>.test.ts` that covers each action.
- The `temporal` middleware (undo/redo) is the only middleware allowed beyond `persist`, `subscribeWithSelector`, and `devtools`. Justify any others in the PR.

---

## 5. MUI v7 + Emotion + UI Primitives

The frontend uses **MUI v7.2.0** with Emotion. We enforce a **primitives-first** policy: all UI in `web/src/` (and Electron renderer) must use the primitives from `web/src/components/ui_primitives/`. Raw MUI imports are only allowed inside `ui_primitives/` and `editor_ui/`.

See **[UI Primitives Strategy](../web/src/components/ui_primitives/STRATEGY.md)** for the full decision tree and **[Design System](DESIGN.md)** for the complete token reference (spacing, typography, border radius, motion, z-index).

### Rules

- **Never import raw MUI components** (`Typography`, `Button`, `IconButton`, `Tooltip`, `CircularProgress`, `Chip`, `Dialog`, `Alert`, `Divider`, `Paper`, `Skeleton`, `Tabs`, `Drawer`, `Breadcrumbs`, `Select`, `Switch`, `TextField`, ...) in component files outside `ui_primitives/` and `editor_ui/`.
- **Opportunistic migration**: when touching any component file, migrate raw MUI usage to primitives and fix design token violations in the same PR.
- **No hardcoded colors.** Use `theme.palette.*` and CSS variables. No hex literals, no `rgb()` literals.
- **No hardcoded spacing.** Use `SPACING.*` / `GAP.*` / `PADDING.*` from `ui_primitives`. No pixel literals for layout dimensions. Off-grid values (`5px`, `10px`, `13px`, `20px`) are forbidden — snap to the 4px grid (`SPACING.xs`=4, `SPACING.md`=8, `SPACING.lg`=12, `SPACING.xl`=16…).
- **No inline `display: "flex"`** — use the `FlexRow` / `FlexColumn` primitives. `Box` is allowed only when significant `sx` overrides are needed anyway.
- **`sx` for one-off, `styled()` for reusable.** `styled()` is allowed only inside `ui_primitives/` for defining new primitives.
- **No `!important`** in any styles. If a style cascade is fighting you, fix the cascade.
- **Theme is the single source of truth** for design tokens — colors, typography, spacing, shadows, radii, motion. New tokens go in `theme/` and have a name.
- **Dark mode parity**: every new primitive must render correctly in both light and dark themes. Verify in PR screenshots.
- **No new `*.module.css` or `*.scss`** files. Style with Emotion via `sx` or `styled()`.
- **Iconography**: prefer the existing icon set (`@mui/icons-material` re-exported through a primitive). Don't import raw SVG into components.

### Design Token Quick Reference (full details: [DESIGN.md](DESIGN.md))

| Category | Token constant | Forbidden pattern |
|---|---|---|
| Spacing | `SPACING.xs/sm/md/lg/xl/xxl/xxxl` | `5px`, `10px`, `13px`, `20px`, `0.75` theme units |
| Typography size | `var(--fontSizeSmall)` / `<Label>` | Any raw px/rem font size |
| Typography weight | `400`, `500`, `600` | `700`, `"bold"`, `300` |
| Border radius | `BORDER_RADIUS.xs/sm/md/lg/xl/xxl/pill/circle` | `4`, `10`, `18`, raw `"var(--rounded-*)"` |
| Transitions | `MOTION.all/border/background/…` | `"all 200ms ease"`, any raw timing string |
| Z-index | `Z_INDEX.dropdown/modal/tooltip/…` | `9999`, `1000`, arbitrary integers |

### target

- Zero raw MUI imports outside `ui_primitives/` and `editor_ui/` (currently a migration target — `npm run lint` should grow a rule to enforce this).
- All primitives have a Storybook entry (or an in-repo gallery) showing their variants.

---

## 6. TanStack Query v5

Server state lives in TanStack Query (`web/src/serverState/`). Zustand and Query never overlap.

### Rules

- **Hierarchical query keys**: `["workflows"]`, `["workflows", workflowId]`, `["workflows", workflowId, "runs"]`. Define key factories per resource — don't sprinkle keys ad hoc.
- **`staleTime` is set explicitly** for every query. Default `0` is wrong for most server data. Pick a value based on how often the underlying data changes; document in a comment if non-obvious.
- **`enabled`** for conditional queries. Don't ship `useQuery` calls that depend on `undefined` ids.
- **No fetching in `useEffect`.** Use `useQuery` / `useSuspenseQuery`.
- **Mutations always invalidate**: every successful `useMutation` invalidates the related keys via `queryClient.invalidateQueries({ queryKey: [...] })`. Prefer narrow invalidations over broad ones. The call may be indirect — a named `onSuccess` callback, a store action invoked inside `mutationFn`, or inline in `mutationFn` — see [serverState/AGENTS.md](../web/src/serverState/AGENTS.md). Don't add a redundant second invalidation when one of these already covers the data.
- **Optimistic updates** are required for any mutation that affects a list the user sees (workflows, assets, jobs). Roll back on error.
- **Retry policy** — default `retry: 3` is too aggressive for mutations and for queries that fail predictably. Set `retry` per query: `false` for 4xx, `3` for network errors.
- **`queryClient.setQueryData`** is the only way to write into the cache from outside a query. Never reach into internals.
- **Suspense mode** (`useSuspenseQuery`) is the preferred form for required-on-mount data. Pair with a Suspense boundary and an Error Boundary.
- **No global query client mutations** in components. Use mutation hooks or the `useQueryClient` hook locally.

### target

- A central key factory module per resource (`web/src/serverState/keys.ts`) — no string-literal keys outside the factory.
- 100% of mutations specify optimistic updates or document why they don't.

---

## 7. ReactFlow 12

The node graph uses ReactFlow 12.10.0. The runtime semantics live in `@nodetool-ai/kernel`; the UI layer is in `web/src/components/`.

### Rules

- **Node and edge data is plain JSON.** No class instances, no functions, no `Date` objects in node data — it must serialize cleanly to MsgPack.
- **One Zustand store for graph state**, with selectors per node — never subscribe to the full nodes array from a leaf node component.
- **Use `useNodes` / `useEdges` selectors** wrapped from the canonical hooks; don't call ReactFlow internals directly outside `web/src/components/node_graph/`.
- **Custom node components are memoized** (`React.memo`) and rely on prop equality, not store subscriptions, for their inputs.
- **Edge validation** happens at connect time via `isValidConnection`. Don't add edges that the runtime would reject.
- **No layout effects in node renders** — they re-render frequently and pre-paint work tanks frame rate.

---

## 8. Testing

- **Backend packages**: Vitest (each package's `tests/` or `src/__tests__/`).
- **Web**: Jest 29 + React Testing Library 16.
- **Electron**: Jest + Playwright for E2E.
- **Web E2E**: Playwright.

### Rules

- **Tests live next to code** in `__tests__/` directories. Mirror the source layout.
- **Test behavior, not implementation.** No assertions on internal state, no snapshots of internal trees. Use roles, labels, and visible text.
- **React Testing Library queries**: `getByRole` > `getByLabelText` > `getByText` > `getByTestId`. `getByTestId` is the last resort and indicates an accessibility gap.
- **`userEvent` for interactions**, not `fireEvent`. Always `await userEvent.click(...)`.
- **Async assertions use `findBy` or `waitFor`**, never arbitrary `setTimeout`.
- **Mock at the boundary, not internal modules.** Mock `fetch`/`api`/`WebSocket`, not internal helpers.
- **No `expect.anything()` / `expect.any()`** for primary assertions. Be specific.
- **Coverage is not the goal — confidence is.** But: **target** 80% statement coverage on `packages/kernel`, `packages/runtime`, `packages/agents` (the parts that fail silently when wrong).
- **Flaky tests are bugs.** A flaky test that retries to green is broken. Fix it or delete it — never re-enable with `.skip`.
- **Snapshot tests** are forbidden in component testing. They are allowed for stable JSON outputs (e.g. workflow DSL serialization).
- **E2E tests** describe user journeys. Each test is independent — no shared state, no test order dependence. Use `page.goto()` and reset fixtures per test.
- **Tests run in CI on every PR.** Local-only test paths (e.g. ones requiring GPUs or external API keys) are skipped by default and gated by an env var.
- **Test naming**: `describe("WidgetThing", () => it("emits an event when clicked", ...))`. Use sentences for `it`, nouns for `describe`.

### target

- Every new feature ships with at least one test at the lowest level it can fail (unit), and one integration test for cross-module concerns.
- Mutation testing (Stryker or equivalent) on `@nodetool-ai/kernel` to verify tests actually catch regressions.

---

## 9. Fastify (HTTP + WebSocket server)

`@nodetool-ai/websocket` runs on **Fastify v5.8.5**. Read [Fastify docs](https://fastify.dev/docs/latest/) before adding routes.

### Rules

- **Schema-validated routes.** Every route declares `schema: { body, querystring, params, response }` using JSON Schema (or `zod-to-json-schema`). Unvalidated payloads are bugs.
- **Use `reply.send`** — don't return raw HTTP responses. Don't write headers directly except for streaming.
- **Async handlers** return values or Promises; don't mix `reply.send()` and `return`.
- **Plugins** are the unit of composition. New cross-cutting features (auth, rate limiting, CORS) go in `packages/websocket/src/plugins/`. Use `fastify-plugin` when state must escape the encapsulation context.
- **Error handler is centralized.** Use `fastify.setErrorHandler` — don't try/catch every route.
- **Hooks**: prefer `onRequest` and `onResponse` over `preHandler` for cross-cutting concerns.
- **No `app.get('*', ...)`** catch-alls except for the documented SPA fallback.
- **WebSocket handlers** must register a heartbeat (ping/pong) and a connection timeout. Idle connections close after `WS_IDLE_TIMEOUT_MS` (configurable).
- **MsgPack on the wire, not JSON**, for the workflow WebSocket. REST uses JSON.
- **Backpressure**: WebSocket senders check `socket.bufferedAmount`. Drop or pause when above threshold.

### target

- All routes have an OpenAPI entry generated from the schema (via `@fastify/swagger`).
- Rate limiting on every public route (`@fastify/rate-limit`).

---

## 10. Drizzle ORM

`@nodetool-ai/models` uses **Drizzle ORM 0.45.2** against SQLite (local/Electron) and PostgreSQL (Supabase).

### Rules

- **Schemas live in `models/src/schema/`** — one file per table. Tables export both the schema and the inferred `Insert` / `Select` types via `InferInsertModel` / `InferSelectModel`.
- **Migrations are generated, not hand-written.** Use `drizzle-kit generate` and commit the generated SQL.
- **Never use raw SQL strings** when a Drizzle builder works. If you must use `sql\`\``, the file gets a comment explaining why.
- **Transactions** wrap multi-statement writes. Don't rely on SQLite's implicit autocommit.
- **Prepared statements** for hot paths — call `.prepare()` and reuse.
- **No queries in hot loops.** Aggregate, batch, or restructure.
- **No N+1 queries.** Use joins, `with` (relations), or batch fetches.
- **IDs are branded types** (see §1). The schema declares them as branded.
- **Never expose the DB layer above `@nodetool-ai/models`.** Higher-level packages get repository functions, not query builders.

### target

- All write operations have a corresponding test against an in-memory SQLite instance.
- Schema changes go through a migration review checklist (PR template).

---

## 11. Zod Validation

Zod v4 is used in `protocol`, `deploy`, `sandbox`, `sandbox-agent`, `sandbox-tools`, `websocket`. It is the canonical validation library.

### Rules

- **All untrusted input is validated with Zod** at the boundary: HTTP request bodies, WebSocket messages, IPC messages, file reads, env vars.
- **Schemas are exported alongside types**: `export const Foo = z.object({...}); export type Foo = z.infer<typeof Foo>;`. Never define a separate TypeScript type that duplicates the schema.
- **Reuse schemas** — compose with `.merge`, `.pick`, `.omit`, `.partial`. Don't redeclare structures.
- **Custom refinements** (`.refine`, `.superRefine`) document the invariant in a message.
- **No `z.any()` or `z.unknown()`** in network-facing schemas. If the shape is genuinely unknown, validate the surrounding envelope and treat the payload as `unknown`.
- **Parse, don't validate.** Use `schema.parse(input)` (throws) or `schema.safeParse(input)` (returns a discriminated union). Never `.passthrough()` for trusted-side data — strict mode catches typos.

---

## 12. Electron 39 Security

The desktop app embeds Node and exposes native APIs. Every IPC channel is an attack surface. See `electron/src/AGENTS.md` for app-specific patterns.

### Rules (non-negotiable)

- **`contextIsolation: true`** on every `BrowserWindow`. No exceptions.
- **`nodeIntegration: false`** on every `BrowserWindow`. No exceptions.
- **`sandbox: true`** on renderer windows whenever possible.
- **`webSecurity: true`** — never disable.
- **Preload scripts** expose APIs via `contextBridge.exposeInMainWorld`. Never assign to `window` directly.
- **Validate every IPC input** in the main process with Zod before acting on it. Untrusted renderer is an attacker model.
- **`shell.openExternal`** only with an allowlisted URL scheme (`https:`, `mailto:`). Never pass user input directly.
- **`webContents.setWindowOpenHandler`** denies all by default. Allow specific URLs.
- **CSP header** is set in production builds (`Content-Security-Policy: default-src 'self'`). Remove `'unsafe-inline'` for scripts — **target**.
- **No `remote` module.** It's deprecated and was removed; do not reintroduce a polyfill.
- **No `eval`, no `new Function`** in main or preload.
- **File system access** is mediated through validated IPC handlers. Never let the renderer pass arbitrary paths.
- **Auto-update** must verify code signatures. Use `electron-updater` with publisher verification, not custom HTTPS downloads.

### IPC patterns

- Channel names are string constants in a shared module — no string literals inline.
- `ipcMain.handle` / `ipcRenderer.invoke` for request/response (typed).
- `webContents.send` / `ipcRenderer.on` for events, with cleanup on window destroy.
- All handlers wrap their bodies in try/catch and return `{ ok: true, data } | { ok: false, error }` — never throw across the IPC boundary.

---

## 13. WebSocket Protocol

The WebSocket server (port 7777, `/ws`) carries workflow runtime traffic in **MsgPack**.

### Rules

- **Use `GlobalWebSocketManager` singleton** in the frontend. Never construct `WebSocket` directly.
- **MsgPack only** for `/ws` payloads. JSON only on REST.
- **Every message has a `type` discriminator** that is validated with Zod (or the equivalent in the `@nodetool-ai/protocol` schema set).
- **Heartbeat**: client and server exchange ping/pong every 30s. Idle for 2× heartbeat → close.
- **Reconnection**: exponential backoff, max 5 attempts, jitter. Resume by sending a `resume` message with the last seen sequence number.
- **Backpressure**: senders check `bufferedAmount` and pause when it exceeds a threshold (`WS_BACKPRESSURE_BYTES`).
- **Sequence numbers** monotonically increase per connection so the receiver can detect drops.

---

## 14. Accessibility (a11y)

**target**: WCAG 2.2 **AA** on all user-facing surfaces (web, electron renderer, mobile). AAA where text-heavy.

### Rules

- **Semantic HTML first.** A `<button>` is not a `<div onClick>`. A heading is not a styled `<span>`.
- **`eslint-plugin-jsx-a11y` rules** must pass — none disabled per-line without justification.
- **Every interactive element has a keyboard path.** Tab order is logical; focus is visible; `Escape` closes modals; arrow keys traverse lists/menus.
- **Focus management**: opening a dialog moves focus into it; closing returns focus to the trigger. Use `aria-modal` and a focus trap.
- **`aria-label` / `aria-labelledby` / `aria-describedby`** wherever the visible text is insufficient. Icon-only buttons require a label.
- **Color contrast ≥ 4.5:1** for body text, 3:1 for large text and UI components (WCAG AA). Enforce in the design tokens — never override.
- **Don't rely on color alone** to convey information — add an icon, label, or pattern.
- **`prefers-reduced-motion`**: respect it. All animations must have a static fallback.
- **Screen reader testing** for new primitives: VoiceOver (macOS) or NVDA (Windows). Document the expected announcement in the primitive's tests.
- **Forms**: every input has a `<label>` (or `aria-label`). Errors are announced via `role="alert"` or `aria-live="polite"`.

### target

- Automated `axe-core` checks run in Playwright E2E and fail the build on serious/critical violations.
- A manual a11y review is part of every PR that adds or changes a primitive.

---

## 15. Performance

**target budgets** (web bundle):

- Initial JS (gzipped) ≤ **250 KB** for the editor route.
- Largest Contentful Paint ≤ **2.5 s** on a Fast 3G profile.
- Time to Interactive ≤ **3.5 s** on the same profile.
- React render: no component takes >16 ms in the React Profiler under typical workloads.

### Rules

- **Lazy-load routes** with `React.lazy` + `Suspense`. Only the shell is in the initial bundle.
- **Code-split heavy dependencies** (Monaco, charting libs, syntax highlighting). Import them dynamically from the components that need them.
- **No top-level imports** of node modules that pull in megabytes (`lodash`, `moment`). Use targeted imports (`lodash/debounce`) or alternatives (`dayjs`, native `Intl`).
- **`tree-shake` everything.** No `import * as X` from large modules.
- **Memoize at boundaries that get hot**, never globally. Use the React Profiler to find them first.
- **Virtualize long lists** (>50 rows) with `react-virtuoso` or `@tanstack/react-virtual`.
- **No layout thrashing.** Batch DOM reads and writes (read all, then write all). Use `requestAnimationFrame` for visual updates.
- **Images**: use the correct format (AVIF/WebP fallback to PNG), explicit width/height to avoid CLS, `loading="lazy"` for below-the-fold.
- **WebSocket throughput**: send deltas, not snapshots, for long-running workflows.

### target

- A bundle size budget check in CI that fails the PR if any route exceeds its budget by >10%.
- A Lighthouse CI run on every PR with a regression threshold.

---

## 16. Security

We follow the **OWASP Top 10** as the baseline. See [OWASP Top 10:2021](https://owasp.org/Top10/).

### Application security

- **Validate all input** at the boundary with Zod (see §11). Never trust headers, cookies, query params, request bodies, IPC, or WebSocket messages.
- **Output encoding**: React escapes by default. Never use `dangerouslySetInnerHTML` without `DOMPurify.sanitize()`.
- **No `eval`, `new Function`, or `setTimeout("...")`** with string arguments. Anywhere.
- **Secrets are never in code.** They live in `@nodetool-ai/security` (encrypted at rest) and are resolved via `ProcessingContext`. Never log secrets; never put them in error messages or telemetry.
- **API keys and tokens** are scoped, rotatable, and short-lived where possible.
- **CORS** is explicit per route; no wildcards in production.
- **Rate limiting** on every public-facing endpoint (`@fastify/rate-limit`).
- **CSRF**: SameSite=Lax (or Strict) cookies + double-submit token for state-changing endpoints from browsers.
- **Auth checks** run in middleware, not in handlers. Forgetting to add one in a new handler must not be possible.
- **SSRF**: `BrowserTool`, `HttpRequestTool`, `DownloadFileTool` validate URLs against an allowlist of schemes and a blocklist of internal addresses (RFC1918, link-local, `localhost`).

### Supply-chain security

- **`npm audit`** runs in CI on every PR. High and critical advisories block merge unless explicitly waived with rationale.
- **`npm ci`** in CI (not `npm install`) so the lockfile is authoritative.
- **Lockfile is committed.** Never delete `package-lock.json`.
- **Dependabot** (or equivalent) opens PRs for updates weekly.
- **No `postinstall` scripts in untrusted deps.** Audit any new transitive dep that has a postinstall.
- **Pin direct dependency majors.** Use `^x.y.z` for direct deps; allow patch/minor updates via dependabot.

### Sandbox isolation

- User-supplied JavaScript runs in QuickJS WASM (`packages/agents/src/js-sandbox.ts`) — never in Node's `vm`, never in the host process.
- User-supplied shell commands run in Docker or subprocess sandboxes (`@nodetool-ai/code-runners`) — never directly via `child_process.exec`.
- File paths supplied by users are resolved against a workspace root and rejected if they escape it.

### target

- A dedicated `security-review` checklist runs on PRs that touch IPC, auth, network, or sandboxing.
- Quarterly threat-modeling pass on the architecture.

---

## 17. Observability

We use **OpenTelemetry** for tracing across agents and workflows (`workflow.run` → `node.process` → `agent.execute` → `llm.chat`). See CLAUDE.md §"Observing Agent Execution" for sinks.

### Rules

- **Span the right things**: every external call (LLM, HTTP, DB, subprocess) gets a span. Every workflow step gets a span. Every IPC call gets a span.
- **Semantic conventions**: use `gen_ai.*`, `http.*`, `db.*`, `rpc.*` attributes per OpenTelemetry conventions. Don't invent attribute names.
- **No PII in spans.** Names, prompts containing user data, and tool inputs are hashed or redacted before being attached.
- **Errors recorded on spans**: `span.recordException(e)` + `span.setStatus({ code: ERROR })`.
- **Structured logs** only. JSON, single-line, with `level`, `timestamp`, `traceId`, `spanId`, `message`, and contextual fields.
- **Log levels**: `error` (alertable), `warn` (recoverable), `info` (lifecycle), `debug` (developer-only, gated by env). No `console.log` in `packages/*/src/` in committed code.
- **Trace IDs propagate** across process boundaries via `traceparent` (HTTP) and explicit context propagation (WebSocket, IPC).
- **Cost telemetry**: every LLM call records `gen_ai.usage.cost_usd`.

---

## 18. Error Handling

### Rules

- **Throw `Error` objects**, never strings.
- **Custom error classes** extend `Error` and set `name`. Define them in the closest module to where they're thrown.
- **Discriminated `Result` returns** at module boundaries when an error is expected (`{ ok: true, value } | { ok: false, error }`). Throws are for bugs and unexpected conditions.
- **No empty catch blocks.** If a catch is intentional, comment why. Lint allows `allowEmptyCatch` but humans should not.
- **No catch-and-rethrow** without adding context. Either let it propagate, or wrap with a meaningful message: `throw new Error("Loading workflow failed", { cause: err })`.
- **Never swallow errors** in async code — every Promise either has an `await` with a try/catch, a `.catch()`, or is intentionally fired with a documented `void` keyword.
- **AbortError handling**: when an operation is canceled, the `AbortError` propagates and is handled (or ignored intentionally with a comment).
- **No bare `try { } catch (e: any)`.** Use `catch (e)` (it's `unknown` under strict TS) and narrow with `instanceof Error`.
- **User-facing errors** are translated at the UI boundary into actionable messages — never expose stack traces to the user.

---

## 19. Documentation & Comments

### Rules

- **Default to no comments.** Names should carry the meaning. Add comments only when WHY is non-obvious (a workaround, a hidden invariant, a surprising browser quirk, a perf hack).
- **No "this function does X" comments.** The function name is the doc.
- **No `// TODO` without a referenced issue.** `// TODO(#1234): ...`. Untracked TODOs rot.
- **JSDoc** is used on exported public APIs of packages — short summary, params, returns, examples. Internal helpers don't need it.
- **READMEs** are short. Anything longer than a screen lives in `docs/`. Per-package READMEs describe purpose, install, and link to `docs/`.
- **AGENTS.md files** describe enforceable rules for agents and contributors. They are not architecture docs — those live in `docs/architecture.md` and friends.

### target

- Every exported function in `@nodetool-ai/agents`, `@nodetool-ai/kernel`, `@nodetool-ai/runtime`, `@nodetool-ai/node-sdk` has JSDoc.

---

## 20. Git, Commits, PRs

### Commits

- **Conventional commits** preferred: `feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`, `docs(scope): ...`, `refactor(scope): ...`, `test(scope): ...`, `perf(scope): ...`. Subject ≤ 72 chars, imperative mood.
- **One concept per commit.** Don't squash unrelated changes.
- **Body explains WHY**, not WHAT. The diff shows what.
- **No `--no-verify`.** If a hook fails, fix the cause.
- **Never rewrite published history** (`git push --force` on shared branches). Use `--force-with-lease` for your own branches only when necessary.

### Pull Requests

- **Title** matches the lead commit's subject and is descriptive: "fix(kernel): drop stale messages from inbox on actor restart" — not "fix bug".
- **Description** has: a Summary (1–3 bullets), Test Plan (what was verified, how), and any screenshots or recordings for UI changes.
- **CI must be green** before requesting review.
- **One reviewer minimum** for any change that touches security, auth, IPC, sandboxing, or external APIs. Two reviewers for migrations and architecture changes.
- **No merge commits on feature branches.** Rebase to keep history linear.
- **PRs stay small.** **target**: <400 LOC changed. Larger changes get split into stacked PRs.
- **Self-review the diff** before requesting review.

---

## 21. Dependencies & Versions

### Rules

- **One package manager**: npm (root) with workspaces. Never mix in yarn or pnpm files.
- **Adding a dependency** requires PR justification: what does it do, what's the bundle cost (for web), is there a smaller alternative, is it actively maintained (last release < 12 mo)?
- **`devDependencies` for build/test tools**, `dependencies` for runtime. Get this right — `devDependencies` are not installed by consumers.
- **Pin majors**, allow minor/patch via `^`. Use `~` only when the dep has a history of breaking minors.
- **Audit transitive deps** with `npm ls <name>` when adding anything that might bring large subtrees.
- **Don't depend on unstable APIs.** React internals, MUI experimental components, Drizzle alpha schemas — all forbidden.
- **No git URLs, no local file paths** in `dependencies`. Workspace references only.

### Upgrades

- **Minor/patch**: opened by dependabot, merged after CI passes and a smoke check.
- **Major**: requires a tracking issue, a migration plan, and a dedicated PR. React, Electron, Node, MUI, Zustand, Drizzle, Fastify majors are coordinated changes.

---

## 22. Enforcement

The mechanisms that make the above stick:

| Standard | Enforced by |
|---|---|
| TypeScript strict | `tsconfig.base.json` + `npm run typecheck` |
| Lint rules | `eslint.config.mjs`, `oxlint`, `npm run lint` |
| Primitives-first | Manual review + **target** custom ESLint rule |
| Tests required | CI workflow `test.yml` |
| Coverage targets | `npm run test:coverage` + **target** Codecov gate |
| Security advisories | `npm audit` in `security-audit.yaml` |
| Type safety | `type-safety.yaml` workflow |
| Quality | `quality-checks.yml`, `quality-guard.yml`, `quality-assurance.yaml` |
| Dead code | `dead-code-cleanup.yaml` |
| Bundle size | **target** size-limit CI step |
| a11y | **target** `@axe-core/playwright` in E2E |

If a rule is not yet enforced by tooling, it is enforced by review. Reviewers should reject PRs that violate documented standards; if a standard is impractical, change the standard with a PR rather than ignoring it.

---

## Related Documents

- [Root AGENTS.md](../AGENTS.md) — Quick command reference and base TS/React/Zustand/MUI rules
- [packages/AGENTS.md](../packages/AGENTS.md) — Backend package architecture
- [web/src/AGENTS.md](../web/src/AGENTS.md) — Web app patterns
- [electron/src/AGENTS.md](../electron/src/AGENTS.md) — Desktop-specific rules
- [docs/AGENTS.md](AGENTS.md) — Agent system architecture
- [web/src/components/ui_primitives/STRATEGY.md](../web/src/components/ui_primitives/STRATEGY.md) — Primitives-first details
- [web/TESTING.md](../web/TESTING.md) — Web testing guide
- [CLAUDE.md](../CLAUDE.md) — Repo-level instructions for Claude Code sessions

## External References

- [TypeScript Do's and Don'ts](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [React docs — Rules of Hooks](https://react.dev/reference/rules)
- [React docs — Thinking in React](https://react.dev/learn/thinking-in-react)
- [TanStack Query v5 docs](https://tanstack.com/query/v5/docs)
- [Fastify v5 docs](https://fastify.dev/docs/latest/)
- [Drizzle ORM docs](https://orm.drizzle.team/docs/overview)
- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [OWASP Top 10:2021](https://owasp.org/Top10/)
- [WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
