/**
 * Research Components Index
 * 
 * Experimental and research features for NodeTool.
 * 
 * @experimental
 * These components are research prototypes. APIs may change.
 */

export { WorkflowProfiler, analyzeWorkflow } from './WorkflowProfiler';
export type { PerformanceMetrics, Bottleneck } from './WorkflowProfiler';

export { ProfilerPanel } from './ProfilerPanel';
export type { ProfilerPanelProps } from './ProfilerPanel';

export { useProfiler } from '../../hooks/research/useProfiler';
export type { UseProfilerOptions, UseProfilerResult } from '../../hooks/research/useProfiler';
