# Web UI

**Navigation**: [Root AGENTS.md](../../AGENTS.md) | [CLAUDE.md](../../CLAUDE.md) → **Web**

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

See the [root AGENTS.md](../../AGENTS.md) for TypeScript, React, Zustand, MUI, and testing rules.

Key reminders for this package:

- **UI Primitives are mandatory.** Never import raw MUI components (`Typography`, `Button`, `IconButton`, `Tooltip`, `CircularProgress`, `Chip`, `Dialog`, `Alert`, `Divider`, `Paper`, etc.) in component files. Use the 90+ primitives from `components/ui_primitives/` instead. See the **[Primitives Strategy](components/ui_primitives/STRATEGY.md)** for the decision tree.
- **Opportunistic migration**: When touching any file for any reason, migrate raw MUI usage to primitives.
- Use TypeScript with explicit types. No `any`.
- Use functional components with typed props interfaces.
- Use Zustand selectors to avoid unnecessary re-renders.
- Use `sx` prop on primitives for one-off styles. Use `styled()` only inside `ui_primitives/` for defining new primitives.
- No inline `display: "flex"` — use `FlexRow`/`FlexColumn` layout primitives.
- No hardcoded hex colors or pixel spacing — use theme values and spacing constants (`SPACING`, `GAP`, `PADDING`).
- Place tests in `__tests__/` directories next to source files.
- Follow the import order: React → third-party → stores/contexts → components → **primitives** → utils → styles.
- Frontend tools (in `lib/`) must be prefixed with `ui_` (e.g., `ui_add_node`).
- Use `GlobalWebSocketManager` singleton — never create WebSocket instances directly.

## Dev Server Proxy

The Vite dev server proxies these paths to the backend:
- `/api/*` → `http://localhost:7777`
- `/ws/*` → `ws://localhost:7777`
- `/storage/*` → `http://localhost:7777`
- `/comfy-api/*` → `http://localhost:8000` (optional ComfyUI)
