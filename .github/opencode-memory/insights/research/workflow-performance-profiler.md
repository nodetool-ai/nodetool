# Workflow Performance Profiler (Experimental)

## Overview

The **Workflow Performance Profiler** is an experimental feature that analyzes workflows to identify performance bottlenecks, estimate resource usage, and provide optimization suggestions. It helps researchers and developers understand the computational characteristics of their AI workflows.

## Status

**Experimental**: This is a research feature. API may change based on user feedback.

## Use Cases

- **Researchers**: Understand computational characteristics of AI pipelines
- **Developers**: Identify performance bottlenecks before deployment
- **Optimizers**: Find opportunities for parallelization and optimization
- **Debuggers**: Diagnose slow or resource-intensive workflows

## How It Works

### Analysis Engine

The profiler analyzes workflow structure to compute metrics:

1. **Node Complexity Analysis**: Each node type has a base complexity score modified by parameters (model size, iterations, batch size)

2. **Runtime Estimation**: Estimates execution time based on:
   - Node type (LLM vs. embeddings vs. I/O)
   - Model parameters (larger models = longer runtime)
   - Configuration (max_tokens, guidance_scale, iterations)

3. **Memory Usage Estimation**: Estimates peak memory based on:
   - Node type (video generation uses more memory than text)
   - Model size (70b models use ~2x memory of 7b)
   - Processing parameters

4. **Dependency Analysis**: Calculates:
   - Fan-in (dependencies per node)
   - Fan-out (dependents per node)
   - Critical path length (sequential bottleneck)

5. **Optimization Scoring**: Generates a grade (A-F) based on:
   - Estimated total runtime
   - Memory footprint
   - Bottleneck count
   - Parallelization opportunities

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `PerformanceProfileStore` | `web/src/stores/PerformanceProfileStore.ts` | Zustand store for profiling state and analysis logic |
| `PerformanceProfiler` | `web/src/components/profiling/PerformanceProfiler.tsx` | UI component for visualization |
| `usePerformanceProfiler` | `web/src/hooks/usePerformanceProfiler.ts` | Hook for easy integration |

## Usage Example

```typescript
import { PerformanceProfiler } from '../components/profiling';
import { usePerformanceProfiler } from '../hooks/usePerformanceProfiler';

// In a component:
const { profile, analyzeWorkflow, isAnalyzing } = usePerformanceProfiler();

const handleAnalyze = () => {
  const nodes = getNodesFromStore();
  const edges = getEdgesFromStore();
  analyzeWorkflow('workflow-id', nodes, edges);
};

// Or use the full component:
<PerformanceProfiler
  workflowId={workflowId}
  nodes={nodes}
  edges={edges}
  onAnalyze={(profile) => console.log(profile)}
/>
```

## Keyboard Shortcut

- **Ctrl+P** (or **Cmd+P** on Mac): Open Performance Profiler panel

## Metrics Explained

### Optimization Score (0-100)

- **90+ (A)**: Well-optimized workflow
- **75-89 (B)**: Good performance with minor issues
- **60-74 (C)**: Some optimization opportunities
- **40-59 (D)**: Significant bottlenecks
- **<40 (F)**: Major performance issues

### Node Metrics

| Metric | Description |
|--------|-------------|
| Complexity | Computational intensity (1-20 scale) |
| Estimated Runtime | Predicted execution time |
| Memory Usage | Estimated peak memory (MB) |
| Dependencies | Number of input connections |
| Dependents | Number of output connections |
| Parallelizable | Can run concurrently with siblings |

### Workflow Metrics

| Metric | Description |
|--------|-------------|
| Total Estimated Runtime | Sum of all node runtimes |
| Total Memory Usage | Peak combined memory |
| Critical Path Length | Sequential execution time |
| Parallel Opportunities | Nodes that could run concurrently |

## Limitations

- **Estimates Only**: Numbers are estimates based on typical performance; actual results vary by hardware
- **No Runtime Data**: Currently doesn't use actual execution times; requires historical data for accuracy
- **Limited Node Coverage**: Base metrics defined for common node types; new nodes need metric definitions
- **Static Analysis**: Can't account for dynamic behavior (loops, conditionals)

## Future Improvements

- [ ] Integrate with actual execution metrics from `ExecutionTimeStore`
- [ ] Add historical trending across workflow versions
- [ ] Support custom metric definitions for user nodes
- [ ] Add export to JSON/CSV for external analysis
- [ ] Compare multiple workflow versions side-by-side
- [ ] Add GPU memory estimation for ML nodes

## Feedback

To provide feedback on this feature:
1. Test with various workflow types and sizes
2. Report estimation accuracy vs. actual execution
3. Suggest additional node types or metrics
4. Share optimization suggestions that helped

## Related Files

- Store: `web/src/stores/PerformanceProfileStore.ts`
- Component: `web/src/components/profiling/PerformanceProfiler.tsx`
- Hook: `web/src/hooks/usePerformanceProfiler.ts`
- Tests: `web/src/stores/__tests__/PerformanceProfileStore.test.ts`
- Tests: `web/src/components/profiling/__tests__/PerformanceProfiler.test.tsx`
