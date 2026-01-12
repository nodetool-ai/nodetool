# Common Issues and Solutions - Redirect

This file has been **deprecated**. Issues have been extracted into individual files organized by category.

## New Location

All issues are now stored in the `issues/` folder:

**Main Index**: [.github/opencode-memory/issues/README.md](./issues/README.md)

## Quick Links by Category

### TypeScript
- [ReactFlow Node Type Mismatches](./issues/typescript/reactflow-node-type-mismatches.md)
- [Zustand Store Type Inference](./issues/typescript/zustand-store-type-inference.md)

### Build
- [Memory Issues During Build](./issues/build/memory-issues-during-build.md)
- [Electron Build Before Web](./issues/build/electron-build-before-web.md)

### Testing
- [E2E Tests Failing to Connect](./issues/testing/e2e-tests-failing-to-connect.md)
- [Port Already in Use](./issues/testing/port-already-in-use.md)
- [Jest Can't Find Modules](./issues/testing/jest-cant-find-modules.md)
- [Test Expectation Mismatch](./issues/testing/test-expectation-mismatch.md)
- [Mobile Package Type Checking Failures](./issues/testing/mobile-package-type-checking-failures.md)
- [Test Failures in useSelectionActions](./issues/testing/test-failures-in-useSelectionActions.md)
- [Jest E2E Test Exclusion](./issues/testing/jest-e2e-test-exclusion.md)
- [Distribute Functions Test Failures](./issues/testing/distribute-functions-test-failures.md)
- [Test Expectation Fix for Distribute Functions](./issues/testing/test-expectation-fix-distribute-functions.md)
- [Performance Test Flakiness](./issues/testing/performance-test-flakiness.md)

### Lint
- [`any` Type Usage](./issues/lint/any-type-usage.md)
- [Empty Catch Blocks](./issues/lint/empty-catch-blocks.md)
- [Strict Equality](./issues/lint/strict-equality.md)
- [`any` Type Usage Throughout Codebase](./issues/lint/any-type-usage-throughout-codebase.md)

### State Management
- [Unnecessary Re-renders](./issues/state-management/unnecessary-re-renders.md)
- [Zustand Temporal (Undo/Redo) Issues](./issues/state-management/zustand-temporal-issues.md)
- [Unnecessary Re-renders from Zustand Store Subscriptions](./issues/state-management/unnecessary-re-renders-zustand-store.md)

### UI/Styling
- [MUI Theme Not Applied](./issues/ui-styling/mui-theme-not-applied.md)
- [ReactFlow Canvas Not Rendering](./issues/ui-styling/reactflow-canvas-not-rendering.md)

### API/Backend
- [WebSocket Connection Failures](./issues/api-backend/websocket-connection-failures.md)
- [CORS Errors in Development](./issues/api-backend/cors-errors-in-development.md)

### Dependencies
- [npm install Failures](./issues/dependencies/npm-install-failures.md)
- [Playwright Browsers Not Installed](./issues/dependencies/playwright-browsers-not-installed.md)

### Git/CI
- [Pre-commit Hooks Failing](./issues/git-ci/pre-commit-hooks-failing.md)
- [CI Tests Passing Locally But Failing in GitHub Actions](./issues/git-ci/ci-tests-passing-locally-failing-in-github.md)
- [GitHub Workflow Missing Package Dependencies](./issues/git-ci/github-workflow-missing-package-dependencies.md)
- [Documentation Port Inconsistency](./issues/git-ci/documentation-port-inconsistency.md)

### Electron
- [Electron Shows Blank Window](./issues/electron/electron-shows-blank-window.md)
- [Native Module Issues](./issues/electron/native-module-issues.md)

### Security
- [Security Vulnerability Fixes](./issues/security/security-vulnerability-fixes.md)

### Other
- [Quality Checks Verification](./issues/other/quality-checks-verification.md)

## How to Add New Issues

When adding new issues, create a file in the appropriate category folder:

```markdown
### Issue Title

**Problem**: Description of the issue

**Solution**: How to fix it

**Files**: Related files

**Date**: YYYY-MM-DD
```

## Last Updated

2026-01-12 - Migrated all issues to individual files in `issues/` folder
