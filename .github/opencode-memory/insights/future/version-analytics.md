# Version Analytics Research Feature

**Insight**: Created a comprehensive version analytics dashboard that provides workflow evolution insights.

**What Was Built**:
- `web/src/utils/versionAnalytics.ts` - Core analytics computation utility
- `web/src/components/version/VersionAnalyticsDashboard.tsx` - Visual analytics dashboard

**Key Features**:
1. **Workflow Evolution Metrics** - Tracks node growth, edge growth, complexity over versions
2. **Edit Patterns** - Heatmap showing when edits happen (day/hour)
3. **Save Type Distribution** - Breakdown of manual vs auto-save vs checkpoint versions
4. **Node Type Changes** - Tracks which node types are added/removed/modified
5. **Peak Complexity Detection** - Identifies version with highest complexity
6. **Timeline Visualization** - SVG-based graph showing metric progression

**Data Sources Used**:
- Existing `useWorkflowVersions` hook for fetching version data
- Existing `computeGraphDiff` utility for computing changes between versions
- Existing `VersionHistoryStore` for UI state

**Type Safety Approach**:
- Used `WorkflowVersion` from `ApiTypes` (not the store type) to match API response structure
- Graph types imported directly from `ApiTypes` to ensure compatibility

**Code Patterns Followed**:
- Memoized computations using `useMemo`
- Selective Zustand store subscriptions
- MUI theme integration with `useTheme` hook
- Component composition with proper TypeScript interfaces

**Files**:
- `web/src/utils/versionAnalytics.ts` - Analytics computation
- `web/src/components/version/VersionAnalyticsDashboard.tsx` - Dashboard UI

**Date**: 2026-01-19
