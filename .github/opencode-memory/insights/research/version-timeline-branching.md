# Workflow Version Branching & Timeline View (Research)

## Overview

Research and prototype for enhanced version history visualization with timeline view, experiment branching, and metrics tracking.

## Status
⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

1. **Experiment Tracking**: Researchers can create branches to track different approaches (e.g., "prompt-v2-test", "ab-test-variant-a")
2. **Version Comparison**: Compare metrics between versions to understand workflow evolution
3. **Progress Visualization**: See how complexity, node count, and structure change over time
4. **Collaboration**: Add annotations to versions for documentation and context

## How It Works

### Components Created

1. **VersionTimeline.tsx** - Main timeline component
   - Vertical timeline with version history
   - Metrics overview with trend indicators
   - Branch creation and annotation support
   - Compare mode for A/B testing

2. **VersionTimelineItem.tsx** - Individual version entry
   - Shows version number, timestamp, save type
   - Quick metrics (nodes, edges, complexity)
   - Expandable details with actions
   - Annotation display

3. **VersionMetricsPanel.tsx** - Comparison panel
   - Side-by-side metric comparison
   - Change indicators (↑/↓)
   - Change summary chips

4. **VersionTimelineStore.ts** - State management
   - Annotations and branches persistence
   - View state (metrics visibility, sort order, filters)
   - LocalStorage persistence

### Key Features

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

## Usage Example

```typescript
import { VersionTimeline } from "./components/version/VersionTimeline";

// In the editor component
const handleRestore = (version: WorkflowVersion) => {
  // Restore workflow to this version
};

const handleCreateBranch = (version: WorkflowVersion, branchName: string) => {
  // Create experiment branch
  timelineStore.addBranch(version.id, branchName);
};

const handleAnnotate = (version: WorkflowVersion, annotation: string) => {
  // Add annotation
  timelineStore.addAnnotation(version.id, annotation);
};

<VersionTimeline
  workflowId={workflowId}
  onRestore={handleRestore}
  onCreateBranch={handleCreateBranch}
  onAnnotate={handleAnnotate}
/>
```

## Implementation Details

### Metrics Calculation

```typescript
const calculateMetrics = (graph: Graph): VersionMetrics => {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const sizeBytes = new Blob([JSON.stringify(graph)]).size;
  const complexity = nodeCount + edgeCount * 2;
  return { nodeCount, edgeCount, complexity, sizeBytes };
};
```

### Persistence

All state is persisted to localStorage:
- Annotations per version
- Branches per version
- View preferences (metrics visibility, sort order, filters)

## Limitations

1. **Backend Support Needed**: Branch creation and annotations require backend API endpoints
2. **No Merge Functionality**: Cannot merge branches back together
3. **Local-Only Annotations**: Current implementation stores annotations locally
4. **No Real-time Sync**: Changes don't sync across sessions/devices

## Future Improvements

1. **Backend Integration**
   - API endpoints for branch management
   - Cloud sync for annotations
   - Branch merging capability

2. **Enhanced Visualization**
   - Gantt chart for branch timeline
   - Commit graph (like git)
   - Animated transitions between versions

3. **Export Capabilities**
   - Export version history as JSON/CSV
   - Export comparison report
   - Export to research formats (Jupyter notebooks)

4. **Collaboration Features**
   - Shared annotations
   - Branch sharing
   - Review comments

## Files Created

- `web/src/components/version/VersionTimeline.tsx` - Main component
- `web/src/components/version/VersionTimelineItem.tsx` - Item component
- `web/src/components/version/VersionMetricsPanel.tsx` - Metrics panel
- `web/src/stores/VersionTimelineStore.ts` - State management

## Related

- Existing `VersionHistoryPanel` - Basic version list
- Existing `GraphVisualDiff` - Visual diff component
- Existing `VersionDiff` - Text-based diff
- `useWorkflowVersions` - API integration

## Feedback

This feature is a research prototype. Feedback and contributions welcome:
- API design suggestions
- UX improvements
- Additional use cases
- Performance optimizations
