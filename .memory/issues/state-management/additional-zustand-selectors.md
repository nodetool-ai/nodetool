# State Management and Type Safety Improvements

**Problem**: Multiple components subscribing to entire Zustand stores instead of selective state slices, causing unnecessary re-renders. Also, catch blocks using `any` type instead of `unknown`.

**Solution**: 
1. Converted useAuth() full store subscriptions to selective selectors
2. Replaced catch(error: any) with proper error handling using createErrorMessage utility

**Files**:
- `web/src/index.tsx` - useAuth selector for state
- `web/src/hooks/useRunningJobs.ts` - useAuth selector for user and state
- `web/src/components/ProtectedRoute.tsx` - useAuth selector for state
- `web/src/hooks/handlers/dropHandlerUtils.ts` - useAuth selector and catch(error: unknown) with AppError type checking
- `web/src/components/node/__tests__/NodeExecutionTime.test.tsx` - Removed unused formatDuration function and fixed lint warnings

**Date**: 2026-01-15
