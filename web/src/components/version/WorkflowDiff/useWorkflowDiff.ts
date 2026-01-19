import { useMemo } from 'react';
import { type Node, type Edge } from '@xyflow/react';
import { computeWorkflowDiff, type WorkflowDiff } from './algorithm';
import type { WorkflowDiffViewProps } from './types';

interface UseWorkflowDiffOptions {
  oldVersion: {
    nodes: Node[];
    edges: Edge[];
  };
  newVersion: {
    nodes: Node[];
    edges: Edge[];
  };
}

export function useWorkflowDiff(options: UseWorkflowDiffOptions): WorkflowDiff {
  const { oldVersion, newVersion } = options;

  const diff = useMemo(() => {
    return computeWorkflowDiff(
      oldVersion.nodes,
      oldVersion.edges,
      newVersion.nodes,
      newVersion.edges
    );
  }, [oldVersion, newVersion]);

  return diff;
}

export function useWorkflowDiffViewProps(
  oldVersion: WorkflowDiffViewProps['oldVersion'],
  newVersion: WorkflowDiffViewProps['newVersion'],
  diff: WorkflowDiff
): WorkflowDiffViewProps {
  return useMemo(() => ({
    oldVersion,
    newVersion,
    diff,
  }), [oldVersion, newVersion, diff]);
}
