# Enhanced Workflow Versioning with Interactive Visual Diff (Experimental)

## Overview

This feature provides enhanced version control and comparison capabilities for NodeTool workflows, allowing users to visualize changes between workflow versions with detailed property-level diffs and interactive visual comparison.

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

- **Researchers**: Track experiment iterations and understand workflow evolution
- **Developers**: Review workflow changes before merging or deploying
- **Teams**: Collaborate on workflow design with clear change visibility
- **Debugging**: Identify what changed when a workflow stopped working

## How It Works

### Enhanced Version Diff Component

The `EnhancedVersionDiff` component displays detailed, human-readable diff information:

```typescript
import { EnhancedVersionDiff } from "./components/version/EnhancedVersionDiff";

<EnhancedVersionDiff
  diff={graphDiff}
  oldVersionNumber={1}
  newVersionNumber={2}
/>
```

**Features:**
- Summary statistics with total change counts
- Color-coded chips for added (+), removed (-), and modified (~) nodes
- Expandable modified node details showing property-level changes
- Before/after value comparison with syntax highlighting
- Connection change visualization

### Interactive Graph Visual Diff Component

The `InteractiveGraphVisualDiff` component provides an interactive visual representation:

```typescript
import { InteractiveGraphVisualDiff } from "./components/version/InteractiveGraphVisualDiff";

<InteractiveGraphVisualDiff
  diff={graphDiff}
  oldGraph={oldVersionGraph}
  newGraph={newVersionGraph}
  width={400}
  height={300}
  onNodeSelect={(nodeId, status) => console.log(nodeId, status)}
/>
```

**Features:**
- Mini node graph visualization with color-coded nodes
- Zoom controls (zoom in/out/reset)
- Click-to-select nodes with highlighted connections
- Hover tooltips showing node status
- Legend with change counts
- Responsive SVG rendering

## Technical Implementation

### Files Created

1. **`web/src/components/version/EnhancedVersionDiff.tsx`**
   - Displays detailed property-level changes
   - Shows summary statistics
   - Expandable node details
   - Connection change visualization

2. **`web/src/components/version/InteractiveGraphVisualDiff.tsx`**
   - Interactive SVG-based visual diff
   - Zoom/pan controls
   - Node selection with connection highlighting
   - Legend and status indicators

3. **`web/src/components/version/__tests__/EnhancedVersionDiff.test.tsx`**
   - Comprehensive test coverage (11 tests)
   - Tests for both components

4. **`web/src/components/version/index.ts`**
   - Export index updated with new components

### Integration with Existing Code

The new components integrate with the existing version history infrastructure:

- Uses `VersionHistoryStore` for UI state management
- Consumes `computeGraphDiff` from `utils/graphDiff`
- Compatible with existing `VersionHistoryPanel`
- Follows existing component patterns and styling

## Usage Example

```typescript
import { computeGraphDiff } from "../../utils/graphDiff";
import { EnhancedVersionDiff } from "./components/version/EnhancedVersionDiff";
import { InteractiveGraphVisualDiff } from "./components/version/InteractiveGraphVisualDiff";

// Compute the diff between two versions
const diff = computeGraphDiff(oldVersion.graph, newVersion.graph);

// Render enhanced diff display
<EnhancedVersionDiff
  diff={diff}
  oldVersionNumber={oldVersion.version}
  newVersionNumber={newVersion.version}
/>

// Render interactive visual diff
<InteractiveGraphVisualDiff
  diff={diff}
  oldGraph={oldVersion.graph}
  newGraph={newVersion.graph}
  width={400}
  height={300}
/>
```

## Limitations

- **Current Limitations**:
  - Visual diff uses grid layout (not preserving original positions)
  - No support for branching/merging workflows
  - No version restore preview
  - Limited to comparing two versions at a time

- **Known Issues**:
  - Large workflows may render slowly in visual diff
  - Mobile view not optimized

## Future Improvements

- [ ] Preserve original node positions in visual diff
- [ ] Add branching/merging visualization
- [ ] Version restore preview mode
- [ ] Multi-version comparison (3+ versions)
- [ ] Export diff as image/PDF
- [ ] Keyboard navigation for diff exploration
- [ ] Mobile-responsive design
- [ ] Performance optimization for large graphs

## Feedback

To provide feedback on this feature:
1. Use the feature in the Version History panel
2. Report issues via GitHub issues
3. Join the NodeTool Discord for discussions

## Related Documentation

- [Version History Panel](../components/version/VersionHistoryPanel.tsx)
- [Graph Diff Utility](../utils/graphDiff.ts)
- [API Types](../stores/ApiTypes.ts)
