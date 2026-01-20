# Testing Insights

This directory contains documentation about NodeTool's testing practices, patterns, and coverage status.

## Files

- **[test-coverage-status.md](./test-coverage-status.md)** - Main coverage status document with metrics and recommendations
- **[test-coverage-status-2026-01-20.md](./test-coverage-status-2026-01-20.md)** - Latest coverage status (2026-01-20)
- **[test-coverage-improvements.md](./test-coverage-improvements.md)** - Documentation of coverage improvements made
- **[testing-library-patterns.md](./testing-library-patterns.md)** - React Testing Library best practices
- **[hook-tests-added.md](./hook-tests-added.md)** - Documentation of hook tests added
- **[e2e-test-strategy.md](./e2e-test-strategy.md)** - End-to-end testing strategy
- **[test-expectation-alignment.md](./test-expectation-alignment.md)** - How to align test expectations with code behavior

## Quick Reference

### Current Coverage Status (2026-01-20)
- **Total Tests**: 3,106
- **Passing**: 3,097 (99.7%)
- **Failing**: 6 (React.createContext issue)
- **Test Suites**: 239

### Key Testing Patterns
1. **Store Testing**: Use `useStore.setState()` for reset, test actions directly
2. **Hook Testing**: Use `renderHook()` from React Testing Library
3. **Component Testing**: Use accessible queries (`getByRole`, `getByLabelText`)
4. **Utility Testing**: Test pure functions with various inputs

### Testing Commands
```bash
cd web
npm test                  # Run all tests
npm run typecheck         # TypeScript checking
npm run lint              # ESLint
make test                 # Run via Makefile
```

## Related Documentation

- **AGENTS.md**: `web/src/AGENTS.md` - Testing guidelines in main agent documentation
- **Build/Test/Lint**: `.github/opencode-memory/build-test-lint.md` - Build and test requirements
- **Testing Guide**: `web/TESTING.md` - Comprehensive testing guide
- **Issues**: `.github/opencode-memory/issues/testing/` - Known testing issues and fixes

---

**Last Updated**: 2026-01-20
