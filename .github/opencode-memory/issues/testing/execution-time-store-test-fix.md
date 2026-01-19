# Execution Time Store Test Fix

**Problem**: Test expected exact 2500ms duration but got 2501ms due to timing precision issues when mocking Date.now().

**Solution**: Fixed test by properly mocking Date.now() in sequence - mock starts at base time, call startExecution, then advance mock time, then call endExecution.

**Files**:
- web/src/stores/__tests__/ExecutionTimeStore.test.ts

**Date**: 2026-01-19
