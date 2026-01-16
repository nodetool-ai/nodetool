### Workflow Versioning UI Implementation (2026-01-16)

**Feature**: Visual diff and version history for workflows

**Approach**:
- Leveraged existing `VersionHistoryStore` infrastructure
- Created `useWorkflowDiff` hook for computing differences
- Built `VersionHistoryPanel` component with compare mode
- Used existing MUI components for consistency

**Key Decisions**:
1. **List-based diff visualization**: Chose to show changes as a list rather than graph overlay for simplicity and clarity
2. **Comparison mode toggle**: Added explicit compare mode to select two versions for diff
3. **Type-safe diff interfaces**: Defined clear interfaces for AddedNode, RemovedNode, ModifiedNode, etc.

**Implementation Files**:
- `web/src/hooks/useWorkflowDiff.ts` - Diff computation logic
- `web/src/components/workflows/WorkflowDiffViewer.tsx` - Visual diff display
- `web/src/components/workflows/VersionHistoryPanel.tsx` - History panel UI
- `web/src/hooks/useWorkflowVersions.ts` - API integration
- `web/src/hooks/__tests__/useWorkflowDiff.test.ts` - Hook tests
- `web/src/components/workflows/__tests__/WorkflowDiffViewer.test.tsx` - Component tests

**Pattern Used**:
```typescript
// useMemo for expensive diff computation
const diff = useMemo(() => computeDiff(oldVersion, newVersion), [oldVersion, newVersion]);

// Selective Zustand subscriptions
const selectedVersionId = useVersionHistoryStore(state => state.selectedVersionId);
```

**Lessons Learned**:
1. Existing `VersionHistoryStore` provided solid foundation for UI state management
2. List-based diff is easier to implement but less visual than graph-based diff
3. API integration requires proper type definitions for OpenAPI client

**Next Steps**:
- Add graph-based visual diff showing node positions
- Implement version tagging and annotations
- Add branch support for parallel workflow variants
