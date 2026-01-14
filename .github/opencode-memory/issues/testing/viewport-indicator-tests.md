# Missing ThemeProvider in ViewportStatusIndicator Tests

**Problem**: `ViewportStatusIndicator.test.tsx` was rendering the component without wrapping it in a `ThemeProvider`, causing tests to fail when the component tried to access theme variables.

**Solution**: Added `ThemeProvider` wrapper and `renderWithTheme` helper function to the test file, consistent with other component tests in the codebase.

**Files**:
- `web/src/components/node_editor/__tests__/ViewportStatusIndicator.test.tsx`

**Date**: 2026-01-14
