# Workflow Performance Profiler (Experimental)

## Overview

Workflow Profiler is a research feature that analyzes workflow structure to identify performance bottlenecks, complexity issues, and optimization opportunities. It helps users understand their workflow's structure and provides actionable suggestions for improvement.

## Status

⚠️ **Experimental**: This is a research feature. API may change based on user feedback.

## Use Cases

- **Workflow Optimization**: Identify nodes with high fan-out or fan-in that may cause performance issues
- **Complexity Assessment**: Understand overall workflow complexity with a numeric score
- **Structure Analysis**: View critical path length, branching factor, and node distribution
- **AI Model Detection**: Automatically detect AI/ML model nodes and suggest caching strategies
- **Optimization Guidance**: Receive actionable suggestions for improving workflow performance

## How It Works

### Analysis Components

1. **Complexity Score**: Calculates workflow complexity based on:
   - Node count (weight: 1)
   - Edge count (weight: 2)
   - Critical path depth (weight: 3)
   - Average branching factor (weight: 1.5)

2. **Bottleneck Detection**: Identifies potential performance issues:
   - High fan-out nodes (>5 outgoing connections) - severity: high
   - Moderate fan-out nodes (>3 outgoing connections) - severity: medium
   - High fan-in nodes (>8 incoming connections) - severity: high
   - AI/ML model nodes - severity: low (informational)

3. **Metrics Analysis**:
   - Total/Input/Output/Processing node counts
   - Critical path length
   - Branching factor
   - Estimated runtime

4. **Suggestions Engine**: Generates optimization recommendations based on:
   - Overall complexity score
   - Workflow depth
   - Number of bottlenecks
   - Node count

## Usage Example

```typescript
import { useWorkflowProfiler } from "../../hooks/useWorkflowProfiler";
import { useNodes } from "../../contexts/NodeContext";

function WorkflowAnalysisPanel() {
  const { profile, isAnalyzing, analyzeWorkflow } = useWorkflowProfiler();
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);

  const handleAnalyze = () => {
    analyzeWorkflow(nodes, edges, "my-workflow");
  };

  return (
    <Box>
      <Button onClick={handleAnalyze} disabled={isAnalyzing}>
        {isAnalyzing ? "Analyzing..." : "Analyze Workflow"}
      </Button>
      {profile && (
        <Box>
          <Typography>
            Complexity Score: {profile.complexityScore}
          </Typography>
          <Typography>
            Bottlenecks: {profile.bottlenecks.length}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
```

## Files Created

- `web/src/stores/WorkflowProfilerStore.ts` - Zustand store for profiling state
- `web/src/hooks/useWorkflowProfiler.ts` - Hook for accessing profiler functionality
- `web/src/components/node_editor/WorkflowProfiler.tsx` - UI component
- `web/src/stores/__tests__/WorkflowProfilerStore.test.ts` - Unit tests

## Limitations

- **Static Analysis**: Only analyzes workflow structure, not actual runtime performance
- **No Execution Data**: Cannot use actual execution times without backend integration
- **Complexity Scoring**: Formula is heuristic-based and may not reflect true performance
- **Detection Accuracy**: Node type detection relies on string matching, may have false positives

## Future Improvements

- Integration with actual execution metrics from backend
- Historical comparison with previous workflow versions
- Auto-suggestions for restructuring workflows
- Performance predictions based on similar workflows
- Export profiling reports

## Feedback

Provide feedback via GitHub issues with the "research" label.

## Date Added

2026-01-19
