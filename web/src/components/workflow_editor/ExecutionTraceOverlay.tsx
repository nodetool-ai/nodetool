/**
 * ExecutionTraceOverlay component for visualizing workflow execution traces.
 *
 * Provides visual feedback on the workflow canvas by highlighting nodes and edges
 * based on execution trace data. Shows which nodes have executed, their status,
 * and the execution path through the workflow.
 *
 * @module ExecutionTraceOverlay
 */

import React, { useMemo } from 'react';
import { Box, Portal } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Node, Edge } from '@xyflow/react';
import useExecutionTrace from '../../hooks/useExecutionTrace';
import { type TraceEvent } from '../../stores/ExecutionTraceStore';

export interface ExecutionTraceOverlayProps {
  workflowId: string;
  nodes: Node[];
  edges: Edge[];
  container?: HTMLElement | null;
}

/**
 * Get the style for a node based on its trace status
 */
const getNodeStyle = (
  event: TraceEvent | undefined,
  isCurrent: boolean,
  theme: any
): React.CSSProperties => {
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none',
    transition: 'all 0.3s ease',
    zIndex: 1000,
  };

  if (!event) {
    return baseStyle;
  }

  const statusColors: Record<string, string> = {
    running: theme.palette.info.main,
    completed: theme.palette.success.main,
    error: theme.palette.error.main,
    cancelled: theme.palette.warning.main,
  };

  const color = statusColors[event.status] || theme.palette.info.main;

  if (isCurrent) {
    return {
      ...baseStyle,
      boxShadow: `0 0 0 3px ${color}, 0 0 20px ${color}80`,
      borderRadius: '4px',
      animation: 'pulse 1.5s ease-in-out infinite',
    };
  }

  if (event.status === 'completed') {
    return {
      ...baseStyle,
      boxShadow: `0 0 0 2px ${color}40`,
      borderRadius: '4px',
    };
  }

  if (event.status === 'error') {
    return {
      ...baseStyle,
      boxShadow: `0 0 0 2px ${color}, 0 0 10px ${color}60`,
      borderRadius: '4px',
    };
  }

  return baseStyle;
};

/**
 * Get the style for an edge based on trace completion
 */
const getEdgeStyle = (
  isCompleted: boolean,
  isCurrent: boolean,
  theme: any
): React.CSSProperties => {
  if (!isCompleted && !isCurrent) {
    return {};
  }

  const color = isCurrent
    ? theme.palette.info.main
    : theme.palette.success.main;

  return {
    stroke: color,
    strokeWidth: isCurrent ? 3 : 2,
    strokeOpacity: isCurrent ? 1 : 0.6,
    animation: isCurrent ? 'dash 1s linear infinite' : 'none',
  };
};

/**
 * ExecutionTraceOverlay component provides visual feedback for workflow execution.
 *
 * @param props - Component props
 * @returns JSX Element
 *
 * @example
 * ```tsx
 * <ExecutionTraceOverlay
 *   workflowId={workflowId}
 *   nodes={nodes}
 *   edges={edges}
 *   container={reactFlowWrapper}
 * />
 * ```
 */
const ExecutionTraceOverlay: React.FC<ExecutionTraceOverlayProps> = ({
  workflowId,
  nodes,
  edges,
  container,
}) => {
  const theme = useTheme();
  const {
    completedEvents,
    currentEvent,
    activeTrace,
    hasTrace,
  } = useExecutionTrace(workflowId);

  // Create a map of node IDs to their trace events
  const nodeEventMap = useMemo(() => {
    const map = new Map<string, TraceEvent>();
    if (activeTrace) {
      activeTrace.events.forEach((event) => {
        map.set(event.nodeId, event);
      });
    }
    return map;
  }, [activeTrace]);

  // Create a set of completed node IDs
  const completedNodeIds = useMemo(() => {
    const set = new Set<string>();
    completedEvents.forEach((event) => {
      set.add(event.nodeId);
    });
    return set;
  }, [completedEvents]);

  // Don't render if no trace data
  if (!hasTrace || !activeTrace) {
    return null;
  }

  // Create SVG overlay for edges
  const edgeOverlays = edges.map((edge) => {
    const sourceCompleted = completedNodeIds.has(edge.source);
    const targetCompleted = completedNodeIds.has(edge.target);
    const isCurrentPath = currentEvent?.nodeId === edge.target;

    if (!sourceCompleted && !isCurrentPath) {
      return null;
    }

    const edgeStyle = getEdgeStyle(targetCompleted, isCurrentPath, theme);

    return (
      <g key={edge.id} style={{ pointerEvents: 'none' }}>
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="0"
          style={{
            ...edgeStyle,
            vectorEffect: 'non-scaling-stroke',
          }}
          className="react-flow__edge-path"
          data-edge-id={edge.id}
        />
      </g>
    );
  });

  // Create node highlight overlays
  const nodeOverlays = nodes.map((node) => {
    const event = nodeEventMap.get(node.id);
    const isCurrent = currentEvent?.nodeId === node.id;

    if (!event && !isCurrent) {
      return null;
    }

    const nodeStyle = getNodeStyle(event, isCurrent, theme);

    return (
      <Box
        key={node.id}
        sx={{
          ...nodeStyle,
          left: node.position.x,
          top: node.position.y,
          width: node.width || 200,
          height: node.height || 100,
        }}
      />
    );
  });

  const content = (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      {/* SVG layer for edge highlighting */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {edgeOverlays}
      </svg>

      {/* Node highlight overlays */}
      {nodeOverlays}

      {/* Global styles for animations */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.7;
            }
          }
          @keyframes dash {
            to {
              stroke-dashoffset: -20;
            }
          }
        `}
      </style>
    </Box>
  );

  // Use Portal if container is provided, otherwise render directly
  if (container) {
    return <Portal container={container}>{content}</Portal>;
  }

  return content;
};

export default ExecutionTraceOverlay;
