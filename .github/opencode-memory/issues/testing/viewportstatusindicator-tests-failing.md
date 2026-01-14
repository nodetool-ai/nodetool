# ViewportStatusIndicator Tests Failing

**Problem**: 8 tests failing in ViewportStatusIndicator.test.tsx due to missing ThemeProvider and incomplete component implementation.

**Root Causes**:
1. Component uses `useTheme()` and accesses `theme.vars.palette.Paper.paper` but tests didn't wrap with ThemeProvider
2. Component computed `nodeCount` and `selectedCount` but never displayed them (incomplete feature)
3. themeMock.ts was missing `Paper` property in vars.palette

**Solution**:
1. Added `renderWithTheme` helper using ThemeProvider wrapper
2. Added node count display to ViewportStatusIndicator showing "selected/total" or just total
3. Added `Paper: { paper: "#232323" }` to themeMock.ts

**Files**:
- `web/src/components/node_editor/ViewportStatusIndicator.tsx`
- `web/src/components/node_editor/__tests__/ViewportStatusIndicator.test.tsx`
- `web/src/__mocks__/themeMock.ts`

**Date**: 2026-01-14
