# Web UI

**Navigation**: [Root AGENTS.md](../../AGENTS.md) | [CLAUDE.md](../../CLAUDE.md) → **Web**

> **Read [docs/DEVELOPMENT_STANDARDS.md](../../docs/DEVELOPMENT_STANDARDS.md) first.** It is the canonical source for React, Zustand, MUI/primitives, TanStack Query, ReactFlow, testing, accessibility, performance, and security standards. The rules below are the area-specific overlay for the web app.

React single-page application for the NodeTool workflow editor. Runs on port 3000 in development, proxies API calls to the backend on port 7777.

## Build, Lint & Test

```bash
cd web
npm install              # Install dependencies
npm start                # Start dev server (http://localhost:3000)
npm run build            # Production build
npm run typecheck        # TypeScript check
npm run lint             # ESLint
npm run lint:fix         # Auto-fix lint issues
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run test:e2e         # E2E tests (requires backend on port 7777)
```

## Directory Structure

```
web/src/
├── components/    # React UI components (PascalCase .tsx files)
├── stores/        # Zustand state stores (single-domain each)
├── hooks/         # Custom React hooks (useX naming)
├── contexts/      # React contexts wrapping Zustand stores
├── serverState/   # TanStack Query hooks for server data
├── lib/           # Third-party integrations (WebSocket, Supabase, frontend tools)
├── config/        # Constants, shortcuts, model definitions, data types
├── utils/         # Pure utility functions
└── api.ts         # Generated OpenAPI client
```

## Specialized Guides

- **[Components](components/AGENTS.md)** — UI component guidelines, MUI styling
- **[UI Primitives Strategy](components/ui_primitives/STRATEGY.md)** — **MUST READ for all frontend work.** Primitives-first policy, decision tree for which primitive to use, migration rules, and full catalog of 90+ primitives.
- **[Design System](../../docs/DESIGN.md)** — **MUST READ for any UI work.** Token rules for SPACING, TYPOGRAPHY, BORDER_RADIUS, MOTION, Z_INDEX. Includes migration checklist and forbidden-value tables.
- **[Stores](stores/AGENTS.md)** — Zustand state management, selectors, persist/temporal middleware
- **[Contexts](contexts/AGENTS.md)** — React context patterns, provider hierarchy
- **[Hooks](hooks/AGENTS.md)** — Custom React hook rules, useEffect/useMemo/useCallback guidance
- **[Utils](utils/AGENTS.md)** — Utility function patterns
- **[ServerState](serverState/AGENTS.md)** — TanStack Query patterns, cache invalidation
- **[Lib](lib/AGENTS.md)** — WebSocket, Supabase, frontend tool integration
- **[Config](config/AGENTS.md)** — Constants, shortcuts, model definitions

## Key Technologies

| Library | Version | Purpose |
|---------|---------|---------|
| React | 18.2 | UI framework |
| TypeScript | 5.7 | Type safety |
| Vite | 6.4 | Build tool and dev server |
| MUI | v7.2 | Component library (with Emotion for CSS-in-JS) |
| Zustand | 4.5.7 | State management |
| ReactFlow | 12.10 | Node graph editor |
| TanStack Query | v5.62.3 | Server state management |
| React Router | v7.12 | Client-side routing |
| Jest | 29.7 | Unit testing |
| React Testing Library | 16.1 | Component testing |
| Playwright | — | E2E testing |

## State Management Architecture

```
Zustand stores (web/src/stores/)        — UI state, user preferences, editor state
    ↓ wrapped by
React Contexts (web/src/contexts/)      — provide stores to component tree
    ↓ consumed via
Custom hooks (useNodes, useWorkflow)    — type-safe selectors with equality checks

TanStack Query (web/src/serverState/)   — server data (workflows, assets, jobs)
```

**Rules**:
- Zustand for UI/editor state. TanStack Query for server data. Never mix.
- Always use selectors: `useStore(state => state.value)`, never `useStore()`.
- Use `shallow` equality for multi-value selections.
- Contexts exist to provide Zustand stores to the tree — access via custom hooks, not `useContext` directly.

## Coding Guidelines

See **[DEVELOPMENT_STANDARDS.md](../../docs/DEVELOPMENT_STANDARDS.md)** for the canonical rules and the [root AGENTS.md](../../AGENTS.md) for the base TypeScript/React/Zustand/MUI/testing reminders.

Key reminders for this package:

- **UI Primitives are mandatory.** Never import raw MUI components (`Typography`, `Button`, `IconButton`, `Tooltip`, `CircularProgress`, `Chip`, `Dialog`, `Alert`, `Divider`, `Paper`, etc.) in component files. Use the 90+ primitives from `components/ui_primitives/` instead. See the **[Primitives Strategy](components/ui_primitives/STRATEGY.md)** for the decision tree and [DEVELOPMENT_STANDARDS §5](../../docs/DEVELOPMENT_STANDARDS.md#5-mui-v7--emotion--ui-primitives).
- **Opportunistic migration**: When touching any file for any reason, migrate raw MUI usage to primitives and fix design token violations (see checklist below).
- Use TypeScript with explicit types. No `any` — use `unknown` + narrowing or generics. See [§1](../../docs/DEVELOPMENT_STANDARDS.md#1-typescript).
- Use functional components with typed props interfaces.
- Use Zustand selectors to avoid unnecessary re-renders. See [§4](../../docs/DEVELOPMENT_STANDARDS.md#4-zustand).
- Use `sx` prop on primitives for one-off styles. Use `styled()` only inside `ui_primitives/` for defining new primitives.
- No inline `display: "flex"` — use `FlexRow`/`FlexColumn` layout primitives.
- No hardcoded hex colors or pixel spacing — use theme values and spacing constants (`SPACING`, `GAP`, `PADDING`).

### Design Token Checklist (full reference: [docs/DESIGN.md](../../docs/DESIGN.md))

When writing or editing any style, check these rules. Violations in the file you're touching must be fixed in the same PR.

**Spacing** — use `SPACING.*` / `GAP.*` / `PADDING.*` from `ui_primitives`. Forbidden: `5px`, `10px`, `13px`, `20px`, theme units `0.25 / 0.75 / 1.25 / 2.5 / 5`.

**Typography** — use `<Text>` / `<Label>` / `<Caption>` or `TYPOGRAPHY.*` from `ui_primitives`. Forbidden: any raw `fontSize` px/rem literal (`"14px"`, `"0.85rem"`); weights `700 / "bold" / 300`; size+weight combos outside the [4-pair table](../../docs/DESIGN.md#2-typography--4-size-scale-typography).

**Border radius** — use `BORDER_RADIUS.sm / lg / pill / circle` from `ui_primitives`. Forbidden: magic numbers (`1 / 3 / 4 / 7 / 10 / 18`), raw `"var(--rounded-*)"` strings, `"50%"` for circles.

**Transitions** — use `MOTION.all / border / background / transform / opacity / shadow` from `ui_primitives`. Forbidden: raw timing strings (`"all 200ms ease"`, `"0.2s ease-in-out"`).

**Z-index** — use `Z_INDEX.*` from `ui_primitives`. Forbidden: raw integers (`9999`, `1000`, `2`).
- Place tests in `__tests__/` directories next to source files. See [§8](../../docs/DEVELOPMENT_STANDARDS.md#8-testing).
- Follow the import order: React → third-party → stores/contexts → components → **primitives** → utils → styles.
- Frontend tools (in `lib/`) must be prefixed with `ui_` (e.g., `ui_add_node`).
- Use `GlobalWebSocketManager` singleton — never create WebSocket instances directly. See [§13](../../docs/DEVELOPMENT_STANDARDS.md#13-websocket-protocol).
- **TanStack Query**: hierarchical keys via a per-resource factory, explicit `staleTime`, optimistic updates for list mutations. See [§6](../../docs/DEVELOPMENT_STANDARDS.md#6-tanstack-query-v5).
- **Accessibility**: WCAG 2.2 AA target. `eslint-plugin-jsx-a11y` rules must pass. Every interactive element has a keyboard path and a visible focus ring. See [§14](../../docs/DEVELOPMENT_STANDARDS.md#14-accessibility-a11y).
- **Performance budgets**: initial JS ≤ 250KB gzipped on the editor route; LCP ≤ 2.5s on Fast 3G. Lazy-load routes; code-split heavy deps. See [§15](../../docs/DEVELOPMENT_STANDARDS.md#15-performance).
- **Error boundaries** wrap every route and every async data section. Suspense boundaries wrap every `lazy()` and every `useSuspenseQuery`.
- **No `dangerouslySetInnerHTML`** without `DOMPurify.sanitize()`. See [§16](../../docs/DEVELOPMENT_STANDARDS.md#16-security).

## Dev Server Proxy

The Vite dev server proxies these paths to the backend:
- `/api/*` → `http://localhost:7777`
- `/ws/*` → `ws://localhost:7777`
- `/storage/*` → `http://localhost:7777`
