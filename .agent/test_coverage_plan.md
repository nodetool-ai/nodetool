# Test Coverage Improvement Plan

## Current Coverage Analysis
- Overall coverage: ~14% lines, ~5% branches, ~6% functions
- Tests are running but many areas have 0% coverage

## Priority Areas (0% coverage, high impact):
1. **Stores** (src/stores/) - Critical state management with 0% coverage
   - ApiClient.ts
   - NodeStore.ts (35KB - largest store)
   - GlobalChatStore.ts (24KB)
   - AssetStore.ts
   - WorkflowRunner.ts

2. **Hooks** (src/hooks/) - Core functionality with minimal coverage
   - useWorkflowActions.ts
   - useNodeEditorShortcuts.ts
   - useCreateNode.ts
   - useDuplicate.ts

3. **Components** (src/components/) - UI components need testing
   - Chat components
   - Node editor components
   - Asset management components

4. **Utils** (src/utils/) - ~7% coverage
   - formatUtils.ts (100% - good!)
   - ColorUtils.ts (0%)
   - NodeTypeMapping.ts (0%)
   - TypeHandler.ts (0%)

## Test Strategy
1. Start with pure utility functions (easiest to test)
2. Move to hooks (testable with renderHook)
3. Test critical stores (Zustand stores)
4. Add component tests for high-use components

## Files to Test First
1. src/utils/ColorUtils.ts - Pure functions, easy wins
2. src/utils/truncateString.ts - Simple utility
3. src/utils/titleizeString.ts - Simple utility
4. src/hooks/useDelayedHover.ts - Simple hook
5. src/stores/KeyPressedStore.ts - Simple state management
