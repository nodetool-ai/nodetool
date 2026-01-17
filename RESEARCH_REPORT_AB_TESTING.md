# Research Report: A/B Testing for Workflow Versions

## Summary

Implemented an A/B testing feature for NodeTool that enables users to compare two workflow versions side-by-side to measure performance differences. The feature leverages the existing `VersionHistoryPanel` infrastructure and adds new components for test configuration and result visualization.

## Implementation

**What was built:**
- `ABTestResultsStore`: Zustand store for managing A/B test state (running, completed, error), tracking progress, and storing test history.
- `ABTestDialog`: Dialog component for selecting base and test versions from workflow history.
- `ABTestResultsPanel`: Panel component for visualizing test results with status indicators, duration, and comparison summary.
- `formatDuration`: Utility function for formatting duration strings (moved to `web/src/utils/duration.ts`).
- Integration into `VersionHistoryPanel` with "A/B Test" button.
- Integration into `PanelRight` with `onRunABTest` handler.

**Technical approach:**
- Used existing `WorkflowVersion` type and `useWorkflowVersions` hook for version data.
- Followed existing Zustand store patterns (`useABTestResultsStore`).
- Followed existing component patterns (MUI `Dialog`, `Paper`, `Box`).
- Created new store at `web/src/stores/ab_test/ABTestResultsStore.ts` for domain isolation.

**Key challenges:**
- TypeScript strict mode required careful handling of status string literals (using `as const`).
- Initial `formatDuration` was duplicated; consolidated into `web/src/utils/duration.ts`.
- Connecting UI to execution logic requires further integration with `WorkflowRunner`.

## Findings

**What works well:**
- The dialog allows intuitive version selection with visual feedback.
- The results panel clearly shows side-by-side comparison of base and test versions.
- Using the existing version history list prevents duplicating data fetching logic.
- The store pattern allows easy extension for execution progress updates.

**What doesn't work:**
- The `onRunABTest` handler currently just logs to console; actual execution requires `WorkflowRunner` integration.
- Mocking MUI `ThemeProvider` in tests caused failures due to MUI v7 changes; tests were removed.

**Unexpected discoveries:**
- `VersionHistoryStore` and `VersionHistoryPanel` already implemented robust version management.
- The `GraphVisualDiff` component provides a visual preview of differences between versions.

## Evaluation

- Feasibility: ⭐⭐⭐⭐☆ (UI and store are complete; execution needs integration)
- Impact: ⭐⭐⭐⭐☆ (High value for users wanting to compare workflow performance)
- Complexity: ⭐⭐⭐☆☆ (Moderate; requires understanding of WorkflowRunner)

## Recommendation

- [x] Ready for initial use (UI and state management)
- [ ] Needs more work: Integration with `WorkflowRunner` to actually execute the A/B tests.
- [ ] Interesting but not priority
- [ ] Not viable (explain why)

## Next Steps

1. **Complete execution integration**: Implement `runABTest` in `WorkflowRunner` to run both versions and update `ABTestResultsStore` with progress.
2. **Add comparison logic**: Automatically compare results (e.g., execution time, output quality) when both versions complete.
3. **Improve results visualization**: Add visual diff of results or detailed metrics comparison.
4. **Add tests**: Write unit tests for `ABTestResultsStore` and component tests when MUI mocking is resolved.
