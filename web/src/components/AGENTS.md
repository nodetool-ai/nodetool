# Components Guidelines

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web](../AGENTS.md) → **Components**

## Rules

- Use functional components only. No class components.
- Define a TypeScript interface for all component props.
- Keep components focused on a single responsibility.
- Use composition over inheritance and deep prop drilling.
- Use `React.memo` only when the component is pure, receives stable props, renders often, and is expensive to render.
- Don't create new inline objects/functions in JSX when passing to memoized children.
- Co-locate tests in `__tests__/` subdirectories next to source files.

## Styling

- Use MUI components over custom HTML elements when available.
- Use `sx` prop for one-off styles.
- Use `styled()` for reusable styled components.
- Use theme values (`theme.spacing()`, `theme.palette`, etc.) — never hardcode colors or spacing.

## Testing

```bash
cd web
npm test                          # Run all tests
npm run test:watch                # Watch mode
npm test -- --testPathPattern=components  # Components only
```

- Use React Testing Library queries (`getByRole`, `getByLabelText`, `getByText`).
- Use `userEvent` for interactions.
- Test user-facing behavior, not implementation details.
- Mock external dependencies (stores, API calls).
