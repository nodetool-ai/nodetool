# Mobile Package Type Checking Failures

**Problem**: Mobile package type check fails with "Cannot find module 'react'" and similar errors for React Native dependencies.

**Root Cause**: The mobile package's `node_modules` directory was not installed, causing TypeScript to fail finding type declarations.

**Solution**: Run `npm install` in the mobile package directory to install dependencies:
```bash
cd mobile && npm install
```

**Verification**: After installation, `make typecheck` passes for all packages.

**Files**: `mobile/package.json`, `mobile/tsconfig.json`

**Prevention**: Ensure dependencies are installed before running type checks. The Makefile's `typecheck-mobile` target should ensure npm install is run, or CI pipeline should install all package dependencies.

**Date**: 2026-01-10
