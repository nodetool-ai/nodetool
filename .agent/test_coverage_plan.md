# Test Coverage Improvement Plan

## Current Coverage Summary
- Overall coverage is very low (almost 0%)
- Many files have 0% coverage
- Tests are failing due to canvas module dependency issue

## Priority Areas to Test (0% Coverage)

### High Priority - Core Utilities
1. **Utils** (src/utils/)
   - formatDateAndTime.ts - Date/time formatting
   - getFileExtension.ts - Simple utility
   - truncateString.ts - String manipulation
   - formatUtils.ts - General formatting
   - groupByDate.ts - Date grouping logic

### Medium Priority - Stores (State Management)
2. **Simple Stores** (src/stores/)
   - AppHeaderStore.ts - UI state
   - NotificationStore.ts - Notification state
   - ErrorStore.ts - Error handling
   - LogStore.ts - Logging state

### Components with Existing Tests
3. **Components** (src/components/)
   - Logo.tsx - has test but low coverage
   - ProtectedRoute.tsx - has test but low coverage
   - InfiniteScroll.tsx - has test but low coverage

## Testing Strategy
1. Start with simple utility functions (quick wins)
2. Move to simple stores with minimal dependencies
3. Focus on components that already have test files
4. Ensure each test file works independently

## Canvas Module Issue
- Tests fail due to missing canvas.node binary
- This is related to jsdom/jest-environment-jsdom dependency
- Need to mock or bypass canvas-related functionality