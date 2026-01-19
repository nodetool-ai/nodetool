# Workflow Versioning Research Features (Experimental)

## Overview

This document describes experimental research features for workflow versioning and visual diff capabilities in NodeTool.

**Status**: ⚠️ **Experimental** - These features are research prototypes. API and behavior may change.

## Features Implemented

### 1. WorkflowChangeTimeline

Visual timeline component showing workflow version history with change indicators.

**Features**:
- Horizontal timeline view of all versions
- Node size indicates change magnitude from previous version
- Color-coded by save type (manual, autosave, checkpoint, restore)
- Click to view version details
- Right-click to compare with previous version
- Shows current workflow position ("Now" marker)
- Change count indicators above each node

**Usage**:
```typescript
import { WorkflowChangeTimeline } from "./components/version";

<WorkflowChangeTimeline
  workflowId={workflowId}
  versions={versions}
  currentGraph={currentGraph}
  onVersionClick={(v) => setSelectedVersion(v)}
  onVersionCompare={(a, b) => compareVersions(a, b)}
  selectedVersionId={selectedVersionId}
  height={120}
/>
```

**Key Props**:
| Prop | Type | Description |
|------|------|-------------|
| `workflowId` | `string` | Current workflow ID |
| `versions` | `Array<WorkflowVersion>` | Array of version objects |
| `currentGraph` | `Graph \| null` | Current workflow graph state |
| `onVersionClick` | `(version) => void` | Callback when version is clicked |
| `onVersionCompare` | `(a, b) => void` | Callback for comparison |
| `selectedVersionId` | `string \| null` | Currently selected version |
| `height` | `number` | Timeline height (default: 120) |

### 2. VersionCompareWithCurrent

Component for comparing a historical version with the current workflow state.

**Features**:
- Shows all changes since the historical version
- Visual diff using GraphVisualDiff
- Change summary with counts and types
- Detailed change list (added/removed/modified nodes)
- Impact analysis before restore
- Restore with warning about lost changes

**Usage**:
```typescript
import { VersionCompareWithCurrent } from "./components/version";

<VersionCompareWithCurrent
  historicalVersion={selectedVersion}
  currentGraph={currentGraph}
  onRestore={(v) => restoreVersion(v)}
  onClose={() => setCompareDialogOpen(false)}
/>
```

**Key Props**:
| Prop | Type | Description |
|------|------|-------------|
| `historicalVersion` | `WorkflowVersion` | Version to compare |
| `currentGraph` | `Graph` | Current workflow graph |
| `onRestore` | `(version) => void` | Callback to restore version |
| `onClose` | `() => void` | Callback to close dialog |

## Technical Implementation

### Architecture

```
components/version/
├── index.ts                     # Exports
├── VersionHistoryPanel.tsx      # Existing panel
├── VersionListItem.tsx          # Existing list item
├── VersionDiff.tsx              # Existing text diff
├── GraphVisualDiff.tsx          # Existing visual diff
├── WorkflowMiniPreview.tsx      # Existing preview
├── WorkflowChangeTimeline.tsx   # NEW: Timeline view
└── VersionCompareWithCurrent.tsx # NEW: Current comparison
```

### Dependencies

Uses existing infrastructure:
- `VersionHistoryStore` for UI state
- `useWorkflowVersions` for data fetching
- `computeGraphDiff()` for diff computation
- `GraphVisualDiff` for visual representation

### Integration Points

1. **VersionHistoryPanel**: Can add Timeline at top of panel
2. **Right Panel**: Can add CompareWithCurrent as a view
3. **Dashboard**: Can show timeline of recent workflows

## Limitations

### Current Limitations

1. **Timeline Scale**: Large number of versions (>50) may cause performance issues
2. **No Persisted State**: Timeline view state not persisted
3. **No Zoom Controls**: Timeline doesn't support zooming/panning
4. **No Merge**: Cannot merge changes from historical version
5. **Backend Required**: Full versioning requires backend API

### Future Improvements

1. **Virtualized Timeline**: Use react-window for many versions
2. **Zoom/Pan**: Add scroll and zoom controls
3. **Search**: Find versions by change type or content
4. **Branch View**: Show workflow branching/merging
5. **Annotation**: Add comments/notes to versions
6. **Export**: Generate diff reports

## Research Findings

### What Works Well

1. **Visual Timeline**: Users can quickly understand workflow evolution
2. **Change Magnitude**: Sizing nodes by change count is intuitive
3. **Color Coding**: Save type colors are distinguishable
4. **Comparison Mode**: Right-click to compare is discoverable

### What Doesn't Work Well

1. **Dense Timelines**: With many versions, nodes overlap
2. **No Scale Context**: "Now" position may be far from last version
3. **Limited Interaction**: Only click and compare actions available

### Unexpected Discoveries

1. Users want to see "what's new" since a specific version
2. Change magnitude is more useful than expected for finding major revisions
3. The "Now" marker helps ground the timeline

## Evaluation

| Criteria | Rating | Notes |
|----------|--------|-------|
| Feasibility | ⭐⭐⭐⭐ | Frontend-only, uses existing infrastructure |
| Impact | ⭐⭐⭐⭐ | Solves real problem of version comparison |
| Complexity | ⭐⭐⭐ | Moderate, ~300 lines per component |
| Maintainability | ⭐⭐⭐ | Follows existing patterns |
| User Value | ⭐⭐⭐⭐ | Clear improvement over list-only view |

## Recommendation

- [x] **Ready for Limited Testing** - Features work correctly
- [x] **Needs Integration** - Add to VersionHistoryPanel
- [ ] **Needs Optimization** - Handle 50+ versions
- [ ] **Needs User Feedback** - Test with actual users

## Next Steps

1. Add Timeline to VersionHistoryPanel
2. Add "Compare with Current" option to VersionListItem
3. Optimize for 100+ versions
4. Add keyboard shortcuts
5. Conduct user testing

## Feedback

To provide feedback on these features:
1. File an issue with "versioning-research" tag
2. Comment on the PR
3. Reach out to the NodeTool team

## Related Files

- `utils/graphDiff.ts` - Core diff computation
- `stores/VersionHistoryStore.ts` - UI state
- `serverState/useWorkflowVersions.ts` - Data fetching
