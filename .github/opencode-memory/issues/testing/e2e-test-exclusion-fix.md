# E2E Test Exclusion Fix

**Problem**: Playwright E2E tests were failing when run via Jest with "TransformStream is not defined" error because E2E test files in `tests/e2e/` directory were being collected by Jest despite having a skip check that runs after the import statements.

**Solution**: Updated `testPathIgnorePatterns` in `web/jest.config.ts` to properly exclude the `tests/e2e/` directory by using the correct path pattern with leading slash.

**Files**: web/jest.config.ts

**Date**: 2026-01-20
