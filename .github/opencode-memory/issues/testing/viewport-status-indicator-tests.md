# ViewportStatusIndicator Test Fixes

**Problem**: ViewportStatusIndicator tests failed because the component uses MUI's useTheme() hook but tests didn't wrap the component with ThemeProvider.

**Solution**: Added ThemeProvider wrapper to all test renders using the existing mockTheme, and also:
- Added missing `Paper.paper` property to themeMock.ts for the component's background color
- Fixed the component to actually render nodeCount and selectedCount (they were computed but unused)
- Removed unused variable in NodeExecutionTime.test.tsx

**Files**: 
- web/src/components/node_editor/__tests__/ViewportStatusIndicator.test.tsx
- web/src/components/node_editor/ViewportStatusIndicator.tsx
- web/src/__mocks__/themeMock.ts
- web/src/components/node/__tests__/NodeExecutionTime.test.tsx

**Date**: 2026-01-14
