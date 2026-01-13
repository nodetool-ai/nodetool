# Mobile Package TypeScript Type Definitions Missing

**Problem**: Mobile package type check fails with "Cannot find type definition file for 'jest'", 'node', and 'react-native'.

**Solution**: Run `npm install` in the mobile package directory before type checking. Updated Makefile's `typecheck-mobile` target to include `npm install` step.

**Files**: `Makefile`

**Date**: 2026-01-13
