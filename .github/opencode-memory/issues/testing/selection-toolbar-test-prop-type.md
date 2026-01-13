# SelectionActionToolbar Test Type Error

**Problem**: TypeScript type error in SelectionActionToolbar.test.tsx - tests were passing `onToggleNodeInfo` prop that doesn't exist on the component's interface.

**Solution**: Removed `onToggleNodeInfo={jest.fn()}` from all three test cases since the prop is not defined in SelectionActionToolbarProps.

**Files**: web/src/components/node_editor/__tests__/SelectionActionToolbar.test.tsx

**Date**: 2026-01-13
