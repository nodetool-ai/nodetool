# AGENT RULES

Guidelines for working with code in this repository. These are linter-like rules and build/test instructions — not a code summary.

## Quick Navigation

- **[Web UI](web/src/AGENTS.md)** — React web application
  - [Components](web/src/components/AGENTS.md), [Stores](web/src/stores/AGENTS.md), [Contexts](web/src/contexts/AGENTS.md), [Hooks](web/src/hooks/AGENTS.md), [Utils](web/src/utils/AGENTS.md), [ServerState](web/src/serverState/AGENTS.md), [Lib](web/src/lib/AGENTS.md), [Config](web/src/config/AGENTS.md)
- **[Electron](electron/src/AGENTS.md)** — Desktop app
- **[Documentation](docs/AGENTS.md)** — Docs site
- **[Scripts](scripts/AGENTS.md)** — Build and release scripts
- **[Workflow Runner](workflow_runner/AGENTS.md)** — Standalone workflow runner

---

## Build, Lint & Test Commands

### Make Targets (Recommended)

```bash
make install          # Install all dependencies (web, electron, mobile)
make build            # Build all packages
make typecheck        # Type check all packages
make lint             # Lint all packages
make lint-fix         # Auto-fix linting issues
make test             # Run all tests
make check            # Run all checks (typecheck, lint, test)
```

### Web Package

```bash
cd web
npm install              # Install dependencies
npm start                # Start dev server
npm run build            # Production build
npm run typecheck        # TypeScript check
npm run lint             # ESLint
npm run lint:fix         # Auto-fix lint issues
npm test                 # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
npm run test:e2e         # Run e2e tests (requires backend)
```

### Electron Package

```bash
cd electron
npm install              # Install dependencies
npm start                # Start electron
npm run build            # Production build
npm run typecheck        # TypeScript check
npm run lint             # ESLint
npm run lint:fix         # Auto-fix lint issues
npm test                 # Run tests
```

### Mandatory Post-Change Verification

After **any** code change, run:

```bash
make typecheck  # Type check all packages
make lint       # Lint all packages
make test       # Run all tests
```

All three must pass before the task is complete.

---

## TypeScript Rules

- Use TypeScript for all new code. Never use `any`.
- Use `const` by default, `let` when reassignment is needed. Never use `var`.
- Use strict equality (`===` / `!==`). Exception: `== null` for null/undefined checks.
- Always use curly braces for control statements.
- Use `Array.isArray()` to check for arrays, not `typeof`.
- Throw `Error` objects, not strings.
- Always add comments for intentionally empty catch blocks.

## React Rules

- Use functional components only. No class components.
- Always define a TypeScript interface for component props.
- Never mutate state directly. Use immutable patterns.
- Don't use inline functions in JSX when passed to memoized child components.
- Test behavior, not implementation details.

### Hooks

| Hook | Use When | Do Not Use When |
|------|----------|-----------------|
| `useEffect` | Side effects (network, subscriptions, timers, DOM) | Deriving data from props/state |
| `useMemo` | Expensive computation, referential stability | Cheap computation |
| `useCallback` | Passing to memoized children, dependency of effect/memo | Function used only locally |
| `React.memo` | Pure component, stable props, renders often, expensive | Props change every render |

**Never** add these "just in case." If performance is fine, do nothing.

### Custom Hooks

- Always prefix with `use`.
- Use descriptive names: `useWorkflowActions` not `useActions`.
- Include all dependencies in `useEffect`, `useCallback`, `useMemo` arrays.
- Provide TypeScript types for all return values.

## Zustand Rules

- Keep stores focused on a single domain.
- Use selectors to prevent unnecessary re-renders: `useStore(state => state.value)`.
- Use shallow equality for object selections.
- Define actions within the store alongside state.
- Use `persist` middleware for settings stored in localStorage.

## MUI / Styling Rules

- Use MUI components over custom HTML when available.
- Use `sx` prop for one-off styles, `styled()` for reusable styles.
- Use theme values for spacing, colors, and typography — not hardcoded values.
- Prefer composition over deep prop drilling.

## TanStack Query Rules

- Use hierarchical query keys: `['workflows', workflowId]`.
- Set appropriate `staleTime` based on data volatility.
- Use `enabled` option for conditional queries.
- Use optimistic updates for mutations where appropriate.
- Always invalidate related queries after successful mutations.

## File & Naming Conventions

- **Components**: PascalCase (`MyComponent.tsx`)
- **Hooks**: camelCase with `use` prefix (`useMyHook.ts`)
- **Stores**: PascalCase file, camelCase `use` prefix for hook (`useMyStore`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_NODES`)
- **Types/Interfaces**: PascalCase (`NodeData`)
- **Tests**: Same as source + `.test.ts(x)`, placed in `__tests__/` directories

## Import Order

1. React and core libraries
2. Third-party libraries (MUI, TanStack Query, etc.)
3. Internal stores and contexts
4. Internal components
5. Internal utilities and types
6. Styles

## Testing Rules

- Use React Testing Library queries (`getByRole`, `getByLabelText`).
- Use `userEvent` for interactions, not `fireEvent`.
- Use `waitFor` for async assertions.
- Mock external dependencies and API calls.
- Test user-facing behavior, not implementation details.
- Keep tests independent and isolated.

## E2E Testing Setup

E2E tests require the Python backend and Node.js frontend:

```bash
# Install and run
cd web
npm install
npx playwright install chromium
npm run test:e2e           # Automatically starts servers

# Manual setup for debugging
# Terminal 1: conda activate nodetool && nodetool serve --port 7777
# Terminal 2: cd web && npm start
# Terminal 3: cd web && npx playwright test
```

## Security

- Use `DOMPurify.sanitize()` for user input rendered as HTML.
- Never use `dangerouslySetInnerHTML` with unsanitized input.
- Use `contextBridge` for Electron IPC — never expose `nodeIntegration`.
- Validate all IPC inputs.

## Technologies

- **React 18.2**, **TypeScript 5.7**, **Vite 6**
- **MUI v7** + Emotion, **Zustand 4.5**, **ReactFlow 12.8**
- **TanStack Query v5**, **React Router v7**
- **Jest 29** + React Testing Library 16, **Playwright** for E2E
- **Electron** for desktop
