# Build, Test, and Lint Requirements

## 🛡️ Automated Quality Guardrails

**NEW**: OpenCode workflows now enforce quality standards automatically!

All OpenCode workflows include:
- **Pre-flight checks**: Baseline quality assessment before agent runs
- **Post-change verification**: Ensures no NEW errors introduced
- **Automatic failure**: Workflow fails if quality degrades

**See [Quality Guardrails Documentation](./quality-guardrails.md) for complete details.**

## Mandatory Commands

**All PRs must pass these three commands before merging:**

```bash
make typecheck  # TypeScript type checking
make lint       # ESLint code quality checks
make test       # Jest unit and integration tests
```

### Keep it Green

These commands MUST exit with code 0. If any fail:
1. Fix the reported errors
2. Re-run the failing command
3. Continue until all pass

## Individual Package Commands

### Web Package

```bash
cd web

# Type checking
npm run typecheck         # Check types only

# Linting
npm run lint              # Check for issues
npm run lint:fix          # Auto-fix issues

# Testing
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
npm run test:summary      # Summary output

# E2E Testing
npm run test:e2e          # Run E2E tests (requires backend)
npm run test:e2e:ui       # Interactive mode
npm run test:e2e:headed   # See browser

# Build
npm run build             # Production build
```

### Electron Package

```bash
cd electron

# Type checking
npm run typecheck         # Check types only

# Linting
npm run lint              # Check for issues
npm run lint:fix          # Auto-fix issues

# Testing
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report

# E2E Testing
npm run test:e2e          # Run E2E tests
npm run test:e2e:ui       # Interactive mode
npm run test:e2e:headed   # See browser

# Build
npm run build             # Production build
```

### Mobile Package

```bash
cd mobile

# Type checking
npm run typecheck         # Check types only

# Testing
npm test                  # Run all tests
```

## Make Commands

The Makefile provides unified commands across all packages:

```bash
# Run all checks
make check                # typecheck + lint + test

# Individual checks
make typecheck            # All packages
make typecheck-web        # Web only
make typecheck-electron   # Electron only
make typecheck-mobile     # Mobile only

make lint                 # All packages
make lint-web             # Web only
make lint-electron        # Electron only

make lint-fix             # Auto-fix all packages
make format               # Alias for lint-fix

make test                 # All packages
make test-web             # Web only
make test-electron        # Electron only
make test-mobile          # Mobile only

# Build
make build                # All packages
make build-web            # Web only
make build-electron       # Electron only

# Combined
make all                  # install + typecheck + lint + test + build
```

## Testing Requirements

### Unit/Integration Tests

- **Location**: `src/**/__tests__/**/*.test.ts(x)`
- **Framework**: Jest 29.7 with React Testing Library 16.1
- **Coverage**: Not required but encouraged for new features
- **Patterns**: Follow existing test patterns in the codebase

### E2E Tests

- **Location**: `tests/e2e/**/*.spec.ts` (web), `electron/tests/e2e/**/*.spec.ts` (electron)
- **Framework**: Playwright 1.57
- **Backend**: E2E tests require Python backend running on port 7777
- **Setup**: Tests automatically start/stop servers via Playwright config

### Test Guidelines

1. **Test Behavior**: Test what users see/do, not implementation
2. **Accessible Queries**: Use `getByRole`, `getByLabelText`, not `getByTestId`
3. **User Events**: Use `userEvent` not `fireEvent`
4. **Mock External**: Mock API calls and external dependencies
5. **Isolate Tests**: Each test should be independent
6. **Follow Patterns**: Look at existing tests in the same area

## Linting Rules

### TypeScript

- **Strict Mode**: Enabled
- **No `any`**: Use explicit types
- **No `var`**: Use `const` or `let`
- **Explicit Returns**: Function return types required

### React

- **Functional Components**: No class components
- **Hooks Rules**: Follow Rules of Hooks
- **Props Types**: Explicit interfaces for all props
- **No Unused**: No unused variables or imports

### Code Quality

- **Strict Equality**: Use `===` not `==`
- **Array Checks**: Use `Array.isArray()` not `typeof`
- **Curly Braces**: Always use braces for control statements
- **Error Objects**: Throw `new Error()` not strings
- **Catch Comments**: Explain empty catch blocks

## Common Lint Errors

### `@typescript-eslint/no-explicit-any`

```typescript
// ❌ Bad
const data: any = fetchData();

// ✅ Good
interface Data {
  id: string;
  name: string;
}
const data: Data = fetchData();
```

### `eqeqeq` - Require Strict Equality

```typescript
// ❌ Bad
if (value == null) { }

// ✅ Good
if (value === null) { }
// Or for null/undefined check:
if (value == null) { } // Exception: checking both null and undefined
```

### `curly` - Require Braces

```typescript
// ❌ Bad
if (condition) doSomething();

// ✅ Good
if (condition) {
  doSomething();
}
```

### `@typescript-eslint/no-throw-literal`

```typescript
// ❌ Bad
throw "Error message";

// ✅ Good
throw new Error("Error message");
```

### `no-empty` - No Empty Blocks

```typescript
// ❌ Bad
try {
  JSON.parse(str);
} catch (e) {}

// ✅ Good
try {
  JSON.parse(str);
} catch (e) {
  // JSON parse failed, continue with default
}
```

## TypeScript Errors

### Common Type Issues

1. **ReactFlow Node Types**: Need explicit casting
2. **Zustand Store Types**: Define state interface first
3. **Event Handlers**: Use React event types
4. **Async Functions**: Promise return types required

## Build Errors

### Web Build

- **Memory**: Large builds may need `NODE_OPTIONS=--max-old-space-size=4096`
- **Dependencies**: Run `npm ci` not `npm install` in CI
- **Assets**: Static assets go in `/public`

### Electron Build

- **Web First**: Build web package before electron
- **Native Modules**: Some require rebuild for Electron

## CI/CD

GitHub Actions runs these checks automatically:
- `.github/workflows/test.yml` - Run tests on PRs
- `.github/workflows/e2e.yml` - E2E tests on web changes
- `.github/workflows/autofix.yml` - Auto-fix lint issues

## Quick Reference

| Command | Purpose | Exit Code |
|---------|---------|-----------|
| `make typecheck` | Check TypeScript types | Must be 0 |
| `make lint` | Check code quality | Must be 0 |
| `make test` | Run unit tests | Must be 0 |
| `make lint-fix` | Auto-fix lint issues | Use before commit |
| `make check` | All checks | Must be 0 |

## Tips for OpenCode Workflows

1. **Run checks early**: Run `make check` before making complex changes
2. **Fix incrementally**: Fix lint/type errors as you introduce them
3. **Use lint-fix**: Run `make lint-fix` to auto-fix many issues
4. **Check existing tests**: Look at similar tests for patterns
5. **Test before PR**: Always run `make check` before opening PR

---

## Test Coverage Improvements (2026-01-20)

**Tests Added**: 5 new test files

**Files Created**:
- `web/src/stores/ResultsStore.test.ts` - Tests for workflow execution results store
- `web/src/stores/SettingsStore.test.ts` - Tests for user settings store
- `web/src/utils/colorConversion.test.ts` - Tests for color conversion utilities (100+ test cases)
- `web/src/utils/PrefixTreeSearch.test.ts` - Tests for trie-based search implementation
- `web/src/components/inputs/NumberInput.utils.test.ts` - Tests for number input calculation utilities

**Areas Covered**:
- Zustand store state management (ResultsStore, SettingsStore)
- Color model conversions (HEX, RGB, HSL, HSB, CMYK, LAB)
- Color parsing and WCAG accessibility compliance
- Prefix tree search for fast node lookups
- Number input drag handling calculations

**Patterns Used**:
- Jest + React Testing Library for store tests
- Pure function testing for utilities
- AAA pattern (Arrange, Act, Assert)
- Edge case testing for boundary conditions

**Verification**:
- ✅ All 3252+ tests pass
- ✅ Type checking passes (pre-existing WorkflowForm.tsx issue excluded)
- ✅ Linting passes
