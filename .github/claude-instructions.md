# Claude AI Instructions for NodeTool

This file provides guidance for Claude AI when working with the NodeTool codebase.

## Project Overview

NodeTool is a React/TypeScript application for building AI workflows visually with a Python backend for workflow execution.

## Quick Setup for E2E Testing

### Prerequisites

- Python 3.11+ with conda
- Node.js 20+
- Git

### Setup Steps

1. **Create Python Environment:**
   ```bash
   conda env create -f environment.yml -n nodetool
   conda activate nodetool
   uv pip install git+https://github.com/nodetool-ai/nodetool-core git+https://github.com/nodetool-ai/nodetool-base
   ```

2. **Install Web Dependencies:**
   ```bash
   cd web
   npm install
   npx playwright install chromium
   ```

3. **Run E2E Tests:**
   ```bash
   cd web
   npm run test:e2e
   ```

## Key Technologies

- **Frontend**: React 18.2, TypeScript 5.7, Vite, Material-UI v7
- **State Management**: Zustand 4.5
- **Testing**: Jest 29, React Testing Library 16, Playwright 1.57
- **Backend**: Python with FastAPI/Uvicorn

## Code Patterns

### TypeScript

Always use explicit types:

```typescript
// ✅ Good
interface NodeData {
  properties: Record<string, unknown>;
  workflow_id: string;
}

const updateNode = (id: string, data: NodeData): void => {
  // implementation
};

// ❌ Avoid
const updateNode = (id: any, data: any) => {
  // implementation
};
```

### React Components

Use functional components with proper typing:

```typescript
interface MyComponentProps {
  title: string;
  onSave?: (data: string) => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ title, onSave }) => {
  return <div>{title}</div>;
};
```

### E2E Tests

Use Playwright with proper ES module imports:

```typescript
import { test, expect } from "@playwright/test";

if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test("should load page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await page.title()).toBeTruthy();
  });
}
```

## Testing Guidelines

### Unit Tests (Jest + RTL)
- Test user-facing behavior, not implementation
- Use `screen` queries from React Testing Library
- Mock external dependencies
- Use `userEvent` for interactions

### E2E Tests (Playwright)
- Test complete user workflows
- Verify frontend-backend integration
- Check for proper loading states
- Test navigation between pages

## File Structure

```
/web
├── src/
│   ├── components/     # React components
│   ├── stores/         # Zustand stores
│   ├── hooks/          # Custom hooks
│   ├── utils/          # Utility functions
│   └── contexts/       # React contexts
├── tests/
│   ├── e2e/           # Playwright e2e tests
│   └── __tests__/     # Jest unit tests
└── playwright.config.ts
```

## Common Commands

```bash
# Development
cd web && npm start

# Unit Tests
cd web && npm test

# E2E Tests
cd web && npm run test:e2e          # Run all e2e tests
cd web && npm run test:e2e:ui       # Interactive UI mode
cd web && npm run test:e2e:headed   # See browser

# Linting
cd web && npm run lint
cd web && npm run lint:fix

# Type Checking
cd web && npm run typecheck

# Build
cd web && npm run build
```

## Backend Server

Start the backend for manual testing:

```bash
conda activate nodetool
nodetool serve --port 7777
```

Access at: http://localhost:7777

Health check: http://localhost:7777/health

## Resources

- Main documentation: `/AGENTS.md`
- Web testing guide: `/web/TESTING.md`
- Component guide: `/web/src/components/AGENTS.md`
- Store patterns: `/web/src/stores/AGENTS.md`

## Best Practices

1. **Always use TypeScript** - No `any` types
2. **Write tests** - Unit tests for logic, e2e for workflows
3. **Follow existing patterns** - Check similar code first
4. **Use proper imports** - ES modules, not CommonJS
5. **Handle errors** - Try/catch with proper error messages
6. **Document complex code** - JSDoc for functions
7. **Accessibility** - ARIA labels, keyboard navigation
8. **Performance** - useMemo, useCallback when needed

## Debugging

### E2E Test Failures

```bash
# View Playwright trace
npx playwright show-trace test-results/path-to-trace/trace.zip

# Run specific test
npx playwright test --grep "test name"

# Debug mode
npx playwright test --debug
```

### Backend Issues

Check server logs:
```bash
tail -f /tmp/nodetool-server.log  # In CI
# Or check console output when running manually
```

## CI/CD

The GitHub Actions workflow (`.github/workflows/e2e.yml`) automatically:
1. Sets up Python environment with conda
2. Installs nodetool packages
3. Sets up Node.js and installs dependencies
4. Starts backend server
5. Runs Playwright e2e tests
6. Uploads artifacts on failure

---

**Remember**: Always test changes locally with `npm run test:e2e` before pushing!
