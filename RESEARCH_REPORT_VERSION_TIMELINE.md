# Research Report: Workflow Version Branching & Timeline View

## Summary

Researched and prototyped an enhanced version history visualization for NodeTool that adds a visual timeline view with experiment branching capabilities, metrics tracking, and version annotations. This feature builds on the existing `VersionHistoryPanel` implementation and provides researchers with better tools for tracking AI workflow experiments.

## Implementation

### Files Created

1. **VersionTimeline.tsx** - Main timeline component (636 lines)
   - Vertical timeline with version history
   - Metrics overview with trend indicators
   - Branch creation and annotation support
   - Compare mode for A/B testing

2. **VersionTimelineItem.tsx** - Individual version entry (481 lines)
   - Version number, timestamp, save type display
   - Quick metrics (nodes, edges, complexity)
   - Expandable details with actions
   - Annotation display

3. **VersionMetricsPanel.tsx** - Comparison panel (142 lines)
   - Side-by-side metric comparison
   - Change indicators (↑/↓)
   - Change summary chips

4. **VersionTimelineStore.ts** - State management (183 lines)
   - Annotations and branches persistence
   - View state (metrics visibility, sort order, filters)
   - LocalStorage persistence

### Key Features Implemented

1. **Visual Timeline**
   - Vertical timeline with dot indicators
   - Color-coded save types (manual, autosave, checkpoint, restore)
   - Latest version highlighted
   - Branch indicators

2. **Metrics Tracking**
   - Node count
   - Edge (connection) count
   - Complexity score (nodes + edges×2)
   - Storage size
   - Trend indicators vs previous version

3. **Experiment Branching**
   - Create named branches from any version
   - Track experiment variants
   - Branch metadata persistence

4. **Version Annotations**
   - Add notes to versions
   - Annotations displayed in timeline
   - Persisted across sessions

5. **Comparison Mode**
   - Select two versions to compare
   - Metrics delta display
   - Change summary

## Findings

### What Works Well

1. **Integration with Existing Codebase**: The new components follow established patterns (Zustand stores, React hooks, MUI components)
2. **Persistence**: Annotations and branches are persisted to localStorage
3. **Visual Design**: Timeline view provides good overview of version history
4. **Metrics Tracking**: Complexity scoring helps researchers understand workflow evolution

### What Doesn't Work

1. **Backend Integration Required**: Branch creation and annotations require backend API endpoints for full functionality
2. **No Merge Functionality**: Cannot merge branches back together
3. **Local-Only Annotations**: Current implementation stores annotations locally
4. **No Real-time Sync**: Changes don't sync across sessions/devices

### Unexpected Discoveries

1. The existing `VersionHistoryPanel` already provides visual diff functionality that could be leveraged
2. `Branch` icon doesn't exist in MUI icons - used `CallSplit` instead
3. Many existing test files have type errors that are unrelated to new code

## Evaluation

| Criteria | Rating | Notes |
|----------|--------|-------|
| Feasibility | ⭐⭐⭐⭐ | Frontend-only prototype works; backend needed for full features |
| Impact | ⭐⭐⭐⭐⭐ | High value for researchers tracking experiments |
| Complexity | ⭐⭐⭐ | Medium complexity; ~1,400 lines of code |
| Alignment | ⭐⭐⭐⭐⭐ | Fits NodeTool's visual-first, research-friendly philosophy |

## Recommendation

**Needs More Work**: This feature is a solid research prototype that demonstrates value. Next steps needed:

1. **Backend API Design**: Define endpoints for:
   - Creating branches
   - Saving annotations
   - Merging branches
   - Branch lineage tracking

2. **Merge Functionality**: Implement branch merging capability

3. **Export Capabilities**: Export version history as JSON/CSV for research documentation

4. **UI Refinements**: 
   - Add Gantt chart for branch timeline
   - Animated transitions between versions
   - Commit graph (like git)

## Next Steps

If this feature should be pursued further:

1. Design and implement backend API endpoints
2. Add branch merging capability
3. Implement export functionality
4. Add real-time sync for collaborative research
5. Create visual branch graph (like git log --graph)

## Files Modified

- `.github/opencode-memory/features.md` - Added research feature documentation
- `.github/opencode-memory/project-context.md` - Added recent change entry
- `.github/opencode-memory/insights/research/version-timeline-branching.md` - New research insights

## Files Created

- `web/src/components/version/VersionTimeline.tsx`
- `web/src/components/version/VersionTimelineItem.tsx`
- `web/src/components/version/VersionMetricsPanel.tsx`
- `web/src/stores/VersionTimelineStore.ts`
