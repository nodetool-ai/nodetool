# Web UI

**Navigation**: [Root AGENTS.md](../../AGENTS.md) → **Web**

## Build, Lint & Test

```bash
npm install              # Install dependencies
npm start                # Start dev server (http://localhost:3000)
npm run build            # Production build
npm run typecheck        # TypeScript check
npm run lint             # ESLint
npm run lint:fix         # Auto-fix lint issues
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run test:e2e         # E2E tests (requires backend)
```

## Specialized Guides

- **[Components](components/AGENTS.md)** — UI component guidelines
- **[Stores](stores/AGENTS.md)** — Zustand state management guidelines
- **[Contexts](contexts/AGENTS.md)** — React context guidelines
- **[Hooks](hooks/AGENTS.md)** — Custom React hook guidelines
- **[Utils](utils/AGENTS.md)** — Utility function guidelines
- **[ServerState](serverState/AGENTS.md)** — TanStack Query guidelines
- **[Lib](lib/AGENTS.md)** — Third-party library integration guidelines
- **[Config](config/AGENTS.md)** — Configuration guidelines

## Coding Guidelines

See the [root AGENTS.md](../../AGENTS.md) for TypeScript, React, Zustand, MUI, and testing rules.

Key reminders for this package:

- Use TypeScript with explicit types. No `any`.
- Use functional components with typed props interfaces.
- Use Zustand selectors to avoid unnecessary re-renders.
- Use `sx` prop for one-off MUI styles, `styled()` for reusable styles.
- Place tests in `__tests__/` directories next to source files.
- Follow the import order: React → third-party → stores/contexts → components → utils → styles.
