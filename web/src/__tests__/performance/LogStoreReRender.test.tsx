import React from 'react';
import { render } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import useLogsStore from '../../stores/LogStore';
import { shallow } from 'zustand/shallow';
import { useStoreWithEqualityFn } from 'zustand/traditional';

// Optimized component
const OptimizedComponent = ({ workflowId, nodeId, onRender }: { workflowId: string, nodeId: string, onRender: () => void }) => {
  const logs = useStoreWithEqualityFn(
    useLogsStore,
    (state) => state.logs.filter((log) => log.workflowId === workflowId && log.nodeId === nodeId),
    shallow
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

    // It should NOT re-render because shallow equality check passes
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
