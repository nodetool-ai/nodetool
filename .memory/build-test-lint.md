# Build, Test & Lint

## Quick Reference

```bash
make check      # Run all checks (typecheck + lint + test)
make typecheck  # TypeScript type checking — must exit 0
make lint       # ESLint — must exit 0
make test       # Jest tests — must exit 0
make lint-fix   # Auto-fix lint issues
```

## Package Commands

```bash
# Web
cd web && npm run typecheck && npm run lint && npm test

# Electron
cd electron && npm run typecheck && npm run lint && npm test

# Mobile
cd mobile && npm run typecheck && npm test
```

## Key Rules

- Use `===` not `==`, `Array.isArray()` not `typeof`, throw `new Error()` not strings
- No `any` types — use explicit interfaces
- Explain empty catch blocks with comments
- Always use curly braces for control statements
- Test behavior, not implementation — use `getByRole`, `userEvent`, `waitFor`
