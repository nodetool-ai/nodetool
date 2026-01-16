# Workflow Versioning UI (Experimental)

## Overview

Workflow Versioning UI is an experimental feature that enables users to track, compare, and restore workflow versions. It provides visual diff capabilities to understand changes between workflow versions, supporting both individual version viewing and side-by-side comparison modes.

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

- **Users**: Track workflow evolution over time, understand what changed between saves
- **Developers**: Debug issues by comparing working vs broken versions
- **Researchers**: A/B testing workflows, experiment tracking, reproducibility

## How It Works

### Architecture

The feature consists of three main components:

1. **VersionHistoryStore** (`web/src/stores/VersionHistoryStore.ts`)
   - Manages UI state for version history panel
   - Tracks selected version, compare mode, panel open state
   - Persists autosave timestamps and edit counters

2. **useWorkflowDiff Hook** (`web/src/hooks/useWorkflowDiff.ts`)
   - Computes differences between two workflow versions
   - Identifies added/removed/modified nodes and edges
   - Returns structured diff data for visualization

3. **VersionHistoryPanel Component** (`web/src/components/workflows/VersionHistoryPanel.tsx`)
   - Drawer panel for browsing version history
   - Supports compare mode for side-by-side diff
   - Integrates with WorkflowDiffViewer for visual diff display

### Data Model

```typescript
interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version: number;
  created_at: string;
  name?: string;
  description?: string;
  graph: {
    nodes: Array<{ id: string; type: string; data?: Record<string, unknown> }>;
    edges: Array<{ id: string; source: string; target: string }>;
  };
  save_type?: "manual" | "autosave" | "restore" | "checkpoint";
}

interface WorkflowDiff {
  addedNodes: AddedNode[];
  removedNodes: RemovedNode[];
  modifiedNodes: ModifiedNode[];
  addedEdges: AddedEdge[];
  removedEdges: RemovedEdge[];
  unchangedNodes: string[];
  unchangedEdges: string[];
}
```

## Usage Example

```typescript
import { useWorkflowVersions } from "../hooks/useWorkflowVersions";
import { VersionHistoryPanel } from "../components/workflows/VersionHistoryPanel";
import { useVersionHistoryStore } from "../stores/VersionHistoryStore";

function WorkflowEditor() {
  const workflowId = "workflow-123";
  const { data: versions, isLoading } = useWorkflowVersions(workflowId);
  const { isHistoryPanelOpen, setHistoryPanelOpen } = useVersionHistoryStore();

  const handleRestoreVersion = (version: WorkflowVersion) => {
    // Restore workflow to this version
    console.log("Restore to:", version);
  };

  return (
    <>
      <Button onClick={() => setHistoryPanelOpen(true)}>
        View History
      </Button>

      <VersionHistoryPanel
        workflowId={workflowId}
        versions={versions || []}
        onRestoreVersion={handleRestoreVersion}
      />
    </>
  );
}
```

## Integration Points

- **API Integration**: Uses `useWorkflowVersions` hook to fetch versions from `/api/workflows/{workflow_id}/versions`
- **Store Integration**: Integrates with existing `VersionHistoryStore` for UI state
- **UI Integration**: Fits into existing workflow editor layout as a drawer panel

## Limitations

- Version history must be stored on the server (no local-only history yet)
- Diff visualization is list-based, not graph-based (future enhancement)
- No merge capabilities (future enhancement)
- No branch/parallel version support (future enhancement)

## Future Improvements

- Graph-based visual diff showing node positions
- Automatic version naming based on changes
- Version tagging and annotations
- Branch support for parallel workflow variants
- Merge conflict resolution UI
- Export version history to JSON/Git

## Feedback

Provide feedback by opening an issue at https://github.com/nodetool-ai/nodetool/issues
