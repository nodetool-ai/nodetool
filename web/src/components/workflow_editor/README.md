# Workflow Execution Trace Visualization

## Overview

The Execution Trace Visualization feature provides visual feedback on workflow execution by showing the execution path through nodes with animated edges and highlighted nodes. This helps users understand how their workflows execute and debug issues.

## Features

- **Real-time Trace Recording**: Captures node execution order, timing, and status during workflow runs
- **Visual Playback**: Replay workflow execution with animated edges and node highlighting
- **Playback Controls**: Play, pause, step through, and adjust playback speed (0.5x to 4x)
- **Status Indicators**: Visual feedback for running, completed, error, and cancelled states
- **Performance Metrics**: View execution time for each node

## Components

### ExecutionTraceStore

Manages workflow execution trace data. Located at `/web/src/stores/ExecutionTraceStore.ts`.

```typescript
import useExecutionTraceStore from '../stores/ExecutionTraceStore';

// Start recording a trace
store.startTrace(workflowId, workflowName);

// Add an event when a node starts/changes state
store.addEvent(workflowId, nodeId, nodeName, nodeType, status, errorMessage);

// Complete an event with duration
store.completeEvent(workflowId, nodeId, duration);

// End the trace
store.endTrace(workflowId);
```

### useExecutionTrace Hook

React hook for managing execution traces. Located at `/web/src/hooks/useExecutionTrace.ts`.

```typescript
import { useExecutionTrace } from '../hooks/useExecutionTrace';

const {
  activeTrace,
  playback,
  currentEvent,
  completedEvents,
  startRecording,
  addTraceEvent,
  completeNode,
  endRecording,
  play,
  pause,
  reset,
  step,
  setPlaybackSpeed,
  getNodeStatus,
  getNodeDuration,
  isRecording,
  hasTrace,
} = useExecutionTrace(workflowId);
```

### TraceControls Component

UI controls for trace playback. Located at `/web/src/components/workflow_editor/TraceControls.tsx`.

```tsx
import TraceControls from '../components/workflow_editor/TraceControls';

<TraceControls
  workflowId={workflowId}
  onClear={() => console.log('Trace cleared')}
/>
```

### ExecutionTraceOverlay Component

Visual overlay for displaying trace on the workflow canvas. Located at `/web/src/components/workflow_editor/ExecutionTraceOverlay.tsx`.

```tsx
import ExecutionTraceOverlay from '../components/workflow_editor/ExecutionTraceOverlay';

<ExecutionTraceOverlay
  workflowId={workflowId}
  nodes={nodes}
  edges={edges}
  container={reactFlowWrapper}
/>
```

## Integration Example

To integrate trace visualization with a workflow editor:

```tsx
import React, { useEffect } from 'react';
import { useExecutionTrace } from '../hooks/useExecutionTrace';
import TraceControls from '../components/workflow_editor/TraceControls';
import ExecutionTraceOverlay from '../components/workflow_editor/ExecutionTraceOverlay';

const WorkflowEditor = ({ workflow, nodes, edges }) => {
  const {
    startRecording,
    addTraceEvent,
    completeNode,
    endRecording,
    isRecording,
    hasTrace,
  } = useExecutionTrace(workflow.id);

  // Start recording when workflow execution begins
  useEffect(() => {
    if (isRecording) {
      startRecording(workflow.id, workflow.name);
    }
  }, [isRecording]);

  // Record node execution
  const handleNodeStart = (nodeId, nodeName, nodeType) => {
    addTraceEvent(nodeId, nodeName, nodeType, 'running');
  };

  const handleNodeComplete = (nodeId, duration) => {
    completeNode(nodeId, duration);
  };

  return (
    <div>
      {/* Trace Controls */}
      <TraceControls workflowId={workflow.id} />

      {/* Workflow Canvas */}
      <div ref={reactFlowWrapper}>
        <ReactFlow nodes={nodes} edges={edges} />
        
        {/* Trace Visualization Overlay */}
        <ExecutionTraceOverlay
          workflowId={workflow.id}
          nodes={nodes}
          edges={edges}
          container={reactFlowWrapper.current}
        />
      </div>
    </div>
  );
};
```

## Visual States

### Node States
- **Running**: Blue pulsing glow around the node
- **Completed**: Green outline indicating successful execution
- **Error**: Red outline indicating failure
- **Cancelled**: Yellow outline indicating cancellation

### Edge States
- **Active Path**: Animated dashed line showing current execution flow
- **Completed Path**: Solid line showing completed data flow

## Performance Considerations

- Trace data is stored in-memory using Zustand
- Traces are automatically cleared when switching workflows
- Playback uses requestAnimationFrame for smooth animations
- Minimal performance impact on workflow execution

## Future Enhancements

Potential improvements for future iterations:
- Persist traces to localStorage for later review
- Export traces as JSON for analysis
- Compare multiple execution traces
- Timeline view for multi-threaded execution
- Integration with performance profiling tools

## Testing

Tests are located in:
- `/web/src/stores/__tests__/ExecutionTraceStore.test.ts`
- `/web/src/components/workflow_editor/__tests__/TraceControls.test.tsx`

Run tests with:
```bash
npm test -- --testPathPattern="ExecutionTraceStore|TraceControls"
```

## Files Created

- `/web/src/stores/ExecutionTraceStore.ts` - Trace data store
- `/web/src/hooks/useExecutionTrace.ts` - React hook for trace management
- `/web/src/components/workflow_editor/TraceControls.tsx` - Playback controls UI
- `/web/src/components/workflow_editor/ExecutionTraceOverlay.tsx` - Visualization overlay
- `/web/src/stores/__tests__/ExecutionTraceStore.test.ts` - Store tests
- `/web/src/components/workflow_editor/__tests__/TraceControls.test.tsx` - Component tests

## License

This feature is part of NodeTool and follows the same license.
