# Workflow Version Diff Viewer (Experimental)

## Overview

**WorkflowDiff** is an experimental research feature that provides visual comparison between workflow versions. It enables users to track changes, identify modifications, and understand workflow evolution over time.

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

- **Version History Analysis**: Compare workflow versions to understand evolution
- **Debugging**: Identify what changed when a workflow stopped working
- **Collaboration Review**: Review workflow changes made by team members
- **Audit Trail**: Document workflow modifications for compliance
- **Template Management**: Compare template versions to understand updates

## How It Works

The WorkflowDiff feature uses a three-stage approach:

1. **Node Comparison**: Matches nodes by ID and compares:
   - Position changes (x, y coordinates)
   - Data changes (label, properties)
   - Type changes

2. **Edge Comparison**: Matches edges by ID and compares:
   - Source and target node references
   - Edge labels

3. **Visualization**: Renders diff with color-coded indicators:
   - **Green (+)** for added elements
   - **Red (-)** for removed elements
   - **Yellow (~)** for modified elements
   - **Gray (=)** for unchanged elements

## Usage Example

```typescript
import { WorkflowDiffView, computeWorkflowDiff, useWorkflowDiff } from './WorkflowDiff';

// Using the hook in a component
const diff = useWorkflowDiff({
  oldVersion: { nodes: oldNodes, edges: oldEdges },
  newVersion: { nodes: newNodes, edges: newEdges },
});

// Or compute directly
const diff = computeWorkflowDiff(oldNodes, oldEdges, newNodes, newEdges);

// Render the diff view
<WorkflowDiffView
  oldVersion={{
    id: 'v1',
    name: 'Version 1',
    nodes: oldNodes,
    edges: oldEdges,
    updatedAt: '2026-01-15T10:00:00Z',
  }}
  newVersion={{
    id: 'v2',
    name: 'Version 2',
    nodes: newNodes,
    edges: newEdges,
    updatedAt: '2026-01-18T14:30:00Z',
  }}
  diff={diff}
  viewMode="unified"
  onNodeClick={(nodeId) => console.log('Clicked:', nodeId)}
  onClose={() => setShowDiff(false)}
/>
```

## API Reference

### Types

```typescript
type NodeChangeType = 'added' | 'removed' | 'modified' | 'unchanged';
type EdgeChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

interface NodeDiff {
  nodeId: string;
  changeType: NodeChangeType;
  node?: Node;
  changes?: {
    position?: { old: { x: number; y: number }; new: { x: number; y: number } };
    data?: { old: Record<string, unknown>; new: Record<string, unknown> };
    label?: { old: string; new: string };
  };
}

interface EdgeDiff {
  edgeId: string;
  changeType: EdgeChangeType;
  edge?: Edge;
  changes?: {
    source?: { old: string; new: string };
    target?: { old: string; new: string };
    label?: { old: string; new: string };
  };
}

interface WorkflowDiff {
  addedNodes: NodeDiff[];
  removedNodes: NodeDiff[];
  modifiedNodes: NodeDiff[];
  unchangedNodes: NodeDiff[];
  addedEdges: EdgeDiff[];
  removedEdges: EdgeDiff[];
  modifiedEdges: EdgeDiff[];
  unchangedEdges: EdgeDiff[];
  summary: {
    nodesAdded: number;
    nodesRemoved: number;
    nodesModified: number;
    edgesAdded: number;
    edgesRemoved: number;
    edgesModified: number;
  };
}
```

### Functions

```typescript
// Compute diff between two workflow versions
function computeWorkflowDiff(
  oldNodes: Node[],
  oldEdges: Edge[],
  newNodes: Node[],
  newEdges: Edge[]
): WorkflowDiff;

// Hook for computing diff
function useWorkflowDiff(options: UseWorkflowDiffOptions): WorkflowDiff;
```

## Limitations

- **Single ID Matching**: Elements must have stable IDs for accurate comparison
- **Deep Data Comparison**: Complex nested data structures may not be fully compared
- **Visual Only**: Does not highlight changes within nested properties
- **No Edge Label Diff**: Edge label changes are detected but not displayed in UI
- **Performance**: May be slow for workflows with 100+ nodes

## Future Improvements

- **Split View Mode**: Side-by-side comparison of versions
- **Property-Level Diff**: Show exact property changes
- **Change Revert**: Ability to revert individual changes
- **Change Export**: Export diff as JSON/CSV
- **Graph Visualization**: Show diff directly on workflow canvas

## Files

- `types.ts` - Type definitions
- `algorithm.ts` - Core diff computation logic
- `WorkflowDiffView.tsx` - Main visualization component
- `useWorkflowDiff.ts` - React hook for diff computation
- `__tests__/WorkflowDiff.test.ts` - Unit tests

## Feedback

To provide feedback on this feature:
1. Test with real workflow versions
2. Report edge cases in comparison
3. Suggest UI improvements
4. Propose additional features
