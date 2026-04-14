import React from 'react';
import { render, act } from '@testing-library/react';
import useLogsStore, { nodeLogKey } from '../../stores/LogStore';

// Stable empty array returned when a node has no logs yet.
const EMPTY_NODE_LOGS: ReturnType<typeof useLogsStore.getState>['logsByNode'][string] = [];

// Optimised component: O(1) logsByNode lookup instead of O(n) filter.
const OptimizedComponent = ({ workflowId, nodeId, onRender }: { workflowId: string, nodeId: string, onRender: () => void }) => {
  const logs = useLogsStore(
    (state) => state.logsByNode[nodeLogKey(workflowId, nodeId)] ?? EMPTY_NODE_LOGS
  );

  onRender();
  return <div>Log count: {logs.length}</div>;
};

describe('LogStore Performance', () => {
  beforeEach(() => {
    useLogsStore.getState().clearLogs();
  });

  it('does NOT re-render OptimizedComponent when unrelated logs are added', () => {
    const renderCount = jest.fn();
    render(<OptimizedComponent workflowId="wf1" nodeId="node1" onRender={renderCount} />);

    expect(renderCount).toHaveBeenCalledTimes(1);

    // Add log for UNRELATED node
    act(() => {
      useLogsStore.getState().appendLog({
        workflowId: 'wf1',
        nodeId: 'node2', // Different node
        workflowName: 'wf',
        nodeName: 'n2',
        content: 'test',
        severity: 'info',
        timestamp: 123
      });
    });

    // logsByNode['wf1:node1'] reference unchanged → no re-render
    expect(renderCount).toHaveBeenCalledTimes(1);
  });

  it('re-renders OptimizedComponent when RELATED logs are added', () => {
    const renderCount = jest.fn();
    render(<OptimizedComponent workflowId="wf1" nodeId="node1" onRender={renderCount} />);

    expect(renderCount).toHaveBeenCalledTimes(1);

    // Add log for RELATED node
    act(() => {
      useLogsStore.getState().appendLog({
        workflowId: 'wf1',
        nodeId: 'node1', // Same node
        workflowName: 'wf',
        nodeName: 'n1',
        content: 'test',
        severity: 'info',
        timestamp: 123
      });
    });

    // It SHOULD re-render
    expect(renderCount).toHaveBeenCalledTimes(2);
  });
});
