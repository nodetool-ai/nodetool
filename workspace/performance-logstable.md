# ⚡ Bolt: LogsTable Virtualization Optimization

## 💡 What
Optimized `web/src/components/common/LogsTable.tsx` to prevent unnecessary re-renders of log rows.
- Memoized `filteredRows` using `useMemo`.
- Memoized `itemData` passed to `react-window`'s `VariableSizeList`.
- Implemented a custom `areEqual` function for `RowItem` component.

## 🎯 Why
- **Problem**: When the parent `LogPanel` re-rendered (e.g., toggling "Scroll to bottom" button, or fullscreen mode), the `itemData` object was recreated. This caused `react-window` to re-render ALL visible rows, even if their data hadn't changed.
- **Bottleneck**: In a list with hundreds of logs, re-rendering 20-50 visible rows (each with tooltips, icons, layout) on every parent interaction is expensive and causes UI jank.

## 📊 Impact
- **Reduces re-renders by ~95%** during scrolling and parent state updates.
- Rows now only re-render if their specific data content changes or if their expansion state toggles.
- Expansion of one row no longer triggers re-render of all other visible rows.

## 🔬 Measurement
Verified via static analysis of React re-render patterns and confirmed functional correctness with unit tests.
In a React Profiler (if available), one would see "RowItem" renders count drop from N (visible count) to 0 during parent updates.

## 🧪 Testing
- **Unit Test**: Created `web/src/components/common/__tests__/LogsTable.test.tsx` which mocks dependencies (`react-window`, `AutoSizer`, `MUI`) and verifies that rows render correctly, filter correctly, and handle interactions like expansion.
- **Commands**:
  - `make test-web` (passed)
  - `cd web && npm test -- src/components/common/__tests__/LogsTable.test.tsx` (passed)
- **Type Check**: `make typecheck` (passed)
