/**
 * Tests for TraceControls component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import TraceControls from '../TraceControls';
import useExecutionTraceStore from '../../../stores/ExecutionTraceStore';

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('TraceControls', () => {
  beforeEach(() => {
    // Reset store state before each test
    useExecutionTraceStore.getState().clearAllTraces();
  });

  it('should not render when no trace exists', () => {
    renderWithTheme(<TraceControls workflowId="workflow-1" />);

    // Component should not render anything when there's no trace
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should render controls when trace exists', () => {
    const store = useExecutionTraceStore.getState();

    // Setup trace
    store.startTrace('workflow-1', 'Test Workflow');
    store.addEvent('workflow-1', 'node-1', 'Node 1', 'nodetool.test.Node', 'running');
    store.completeEvent('workflow-1', 'node-1', 1000);
    store.endTrace('workflow-1');

    const { container } = renderWithTheme(<TraceControls workflowId="workflow-1" />);

    // Should render buttons
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should display recording status when trace is incomplete', () => {
    const store = useExecutionTraceStore.getState();

    store.startTrace('workflow-1', 'Test Workflow');
    store.addEvent('workflow-1', 'node-1', 'Node 1', 'nodetool.test.Node', 'running');

    renderWithTheme(<TraceControls workflowId="workflow-1" />);

    expect(screen.getByText('Recording')).toBeInTheDocument();
  });

  it('should display completed status when trace is complete', () => {
    const store = useExecutionTraceStore.getState();

    store.startTrace('workflow-1', 'Test Workflow');
    store.addEvent('workflow-1', 'node-1', 'Node 1', 'nodetool.test.Node', 'running');
    store.completeEvent('workflow-1', 'node-1', 1000);
    store.endTrace('workflow-1');

    renderWithTheme(<TraceControls workflowId="workflow-1" />);

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('should render clear button', () => {
    const store = useExecutionTraceStore.getState();

    store.startTrace('workflow-1', 'Test Workflow');
    store.addEvent('workflow-1', 'node-1', 'Node 1', 'nodetool.test.Node', 'running');
    store.completeEvent('workflow-1', 'node-1', 1000);
    store.endTrace('workflow-1');

    const { container } = renderWithTheme(<TraceControls workflowId="workflow-1" />);

    // Find the clear button (has DeleteIcon)
    const deleteIcons = container.querySelectorAll('[data-testid="DeleteIcon"]');
    expect(deleteIcons.length).toBeGreaterThan(0);
  });

  it('should render playback controls for completed trace', () => {
    const store = useExecutionTraceStore.getState();

    store.startTrace('workflow-1', 'Test Workflow');
    store.addEvent('workflow-1', 'node-1', 'Node 1', 'nodetool.test.Node', 'running');
    store.completeEvent('workflow-1', 'node-1', 1000);
    store.endTrace('workflow-1');

    const { container } = renderWithTheme(<TraceControls workflowId="workflow-1" />);

    // Should have play button (PlayArrowIcon)
    const playIcons = container.querySelectorAll('[data-testid="PlayArrowIcon"]');
    expect(playIcons.length).toBeGreaterThan(0);
  });
});
