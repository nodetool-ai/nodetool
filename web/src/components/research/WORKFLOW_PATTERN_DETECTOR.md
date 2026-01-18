# Workflow Pattern Detector (Experimental)

## Overview

The **Workflow Pattern Detector** is an experimental research feature that analyzes NodeTool workflows to identify patterns, performance issues, and optimization opportunities. It helps users understand their workflow structure and provides actionable recommendations for improvement.

## Status

⚠️ **Experimental**: This is a research feature. API and UI may change.

## Use Cases

- **Performance Optimization**: Identify slow nodes and optimization opportunities
- **Workflow Quality**: Detect structural issues like unconnected nodes or missing Preview nodes
- **Best Practices**: Learn workflow design patterns and conventions
- **Debugging**: Find potential issues before running workflows

## How It Works

### Pattern Detection

The detector analyzes workflows in several categories:

1. **Structure Patterns**:
   - Sequential processing chains
   - Multiple similar nodes (potential for consolidation)
   - Complex branching structures
   - Deep nesting (long dependency chains)

2. **Performance Patterns**:
   - Long execution times (>10s)
   - Deep dependency chains (>10 nodes)

3. **Best Practice Patterns**:
   - Missing Preview nodes
   - Unconnected nodes

4. **Optimization Patterns**:
   - Consolidation opportunities
   - Caching suggestions

### Data Sources

The detector uses existing NodeTool stores:
- `NodeStore` for workflow structure (nodes, edges)
- `ExecutionTimeStore` for performance data
- `MetadataStore` for node type information
- `ResultsStore` for execution results

### Analysis Algorithm

```typescript
// Simplified pattern detection logic
const patterns = analyzeWorkflow(nodes, edges, metadata, timings);

// Each pattern includes:
// - id: Unique identifier
// - name: Pattern name
// - description: What was detected
// - category: structure | performance | best-practice | optimization
// - severity: info | warning | suggestion
// - nodes: Affected node IDs
// - recommendation: Suggested action
```

## Usage Example

```tsx
import { WorkflowPatternDetector } from '../components/research/WorkflowPatternDetector';

// Add to a panel or sidebar
<WorkflowPatternDetector workflowId={currentWorkflowId} />
```

## UI Components

### Pattern List
Patterns are grouped by category with expandable sections:
- Structure patterns (blue)
- Performance patterns (orange/warning)
- Best practice patterns (info)
- Optimization patterns (success)

Each pattern shows:
- Pattern name and description
- Affected nodes
- Severity indicator
- Recommendation

### Optimization Suggestions
Actionable recommendations with:
- Potential gain estimate
- Implementation complexity
- Related patterns

## Limitations

- **Timing Data**: Requires previous workflow execution to detect performance patterns
- **Static Analysis**: Cannot detect runtime-only issues
- **Recommendations**: Suggestions are general guidelines, not guaranteed improvements
- **Scope**: Limited to frontend-available data; cannot analyze backend performance

## Future Improvements

- **Real-time Analysis**: Update patterns during editing
- **Historical Comparison**: Compare current vs. previous runs
- **ML-powered Suggestions**: Use ML to suggest optimizations based on successful workflows
- **Auto-fix**: Apply simple optimizations automatically
- **Export Analysis**: Export pattern report for debugging

## Feedback

To provide feedback:
1. Report issues via GitHub
2. Suggest new pattern types
3. Share workflow examples for improvement

## Technical Details

### Files
- `web/src/components/research/WorkflowPatternDetector.tsx` - Main component
- `web/src/stores/ExecutionTimeStore.ts` - Execution timing data
- `web/src/stores/NodeStore.ts` - Workflow structure
- `web/src/core/graph.ts` - Graph utilities

### Dependencies
- React 18.2
- TypeScript 5.7
- MUI v7 (components)
- Zustand (state access)

### Performance
- Analysis runs in <100ms for typical workflows
- Memoized to prevent unnecessary recalculations
- Only recalculates when relevant data changes
