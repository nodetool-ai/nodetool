/**
 * AnimatedEdge component for visualizing real-time data flow through edges.
 *
 * EXPERIMENTAL FEATURE: Renders animated particles along edges during workflow execution
 * to visualize data flowing from source to target nodes.
 *
 * @experimental
 */
import { memo, useMemo, useEffect, useRef } from "react";
import { EdgeProps, getBezierPath, BaseEdge } from "@xyflow/react";
import { useDataFlowAnimationStore, EdgeAnimation } from "../../stores/DataFlowAnimationStore";

interface AnimatedEdgeProps extends EdgeProps {
  workflowId: string;
}

/**
 * Calculate position along a cubic bezier curve at a given progress (0-1)
 */
const getBezierPoint = (
  startX: number,
  startY: number,
  cp1X: number,
  cp1Y: number,
  cp2X: number,
  cp2Y: number,
  endX: number,
  endY: number,
  progress: number
): { x: number; y: number } => {
  const t = progress;
  const mt = 1 - t;
  
  const x = mt * mt * mt * startX +
    3 * mt * mt * t * cp1X +
    3 * mt * t * t * cp2X +
    t * t * t * endX;
    
  const y = mt * mt * mt * startY +
    3 * mt * mt * t * cp1Y +
    3 * mt * t * t * cp2Y +
    t * t * t * endY;
    
  return { x, y };
};

/**
 * Calculate control points for bezier curve based on source and target positions
 */
const getControlPoints = (
  sourceX: number,
  sourceY: number,
  sourcePosition: any,
  targetX: number,
  targetY: number,
  targetPosition: any
): { cp1X: number; cp1Y: number; cp2X: number; cp2Y: number } => {
  // Simple control point calculation - ReactFlow uses internal logic
  // We approximate for the animation particle
  const dy = Math.abs(targetY - sourceY) * 0.5;
  
  return {
    cp1X: sourceX,
    cp1Y: sourceY + (sourcePosition === 'bottom' ? dy : -dy),
    cp2X: targetX,
    cp2Y: targetY + (targetPosition === 'top' ? -dy : dy),
  };
};

const AnimatedEdge: React.FC<AnimatedEdgeProps> = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
  workflowId,
}) => {
  const animationRef = useRef<EdgeAnimation | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeAnimation = useDataFlowAnimationStore((state) =>
    state.getEdgeAnimation(workflowId, id)
  );

  const settings = useDataFlowAnimationStore((state) => state.settings);

  // Memoize control points
  const controlPoints = useMemo(
    () => getControlPoints(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition),
    [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition]
  );

  // Calculate particle position based on animation progress
  const particlePosition = useMemo(() => {
    if (!edgeAnimation) {
      return null;
    }
    
    const point = getBezierPoint(
      sourceX,
      sourceY,
      controlPoints.cp1X,
      controlPoints.cp1Y,
      controlPoints.cp2X,
      controlPoints.cp2Y,
      targetX,
      targetY,
      edgeAnimation.progress
    );
    
    return point;
  }, [edgeAnimation, sourceX, sourceY, targetX, targetY, controlPoints]);

  // Update animation progress
  useEffect(() => {
    if (!edgeAnimation) {
      animationRef.current = null;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    // Skip if we already have a ref to this animation
    if (animationRef.current?.startTime === edgeAnimation.startTime) {
      return;
    }

    animationRef.current = edgeAnimation;
    const startTime = edgeAnimation.startTime;
    const duration = edgeAnimation.duration;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      useDataFlowAnimationStore.getState().updateEdgeAnimation(workflowId, id, progress);

      if (progress >= 1) {
        useDataFlowAnimationStore.getState().completeEdgeAnimation(workflowId, id);
        animationRef.current = null;
        animationFrameRef.current = null;
      } else {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [edgeAnimation, id, workflowId]);

  // Memoize edge style
  const edgeStyle = useMemo(() => ({
    ...style,
    opacity: edgeAnimation ? 0.6 : (style?.opacity ?? 1),
  }), [style, edgeAnimation]);

  // Memoize particle style
  const particleStyle = useMemo(() => {
    if (!particlePosition || !edgeAnimation) {
      return null;
    }

    const particleSize = settings.particleSize;
    const glowSize = particleSize * 2.5;

    return {
      position: "absolute" as const,
      left: `${particlePosition.x - particleSize / 2}px`,
      top: `${particlePosition.y - particleSize / 2}px`,
      width: `${particleSize}px`,
      height: `${particleSize}px`,
      borderRadius: "50%",
      backgroundColor: edgeAnimation.color,
      boxShadow: `0 0 ${glowSize}px ${edgeAnimation.color}`,
      pointerEvents: "none" as const,
      zIndex: selected ? 1001 : 1000,
      transition: "none",
    };
  }, [particlePosition, edgeAnimation, settings.particleSize, selected]);

  // Memoize label style for data labels
  const labelStyle = useMemo(() => {
    if (!edgeAnimation?.dataLabel || !settings.showDataLabels || !particlePosition) {
      return null;
    }

    return {
      position: "absolute" as const,
      left: `${particlePosition.x + 10}px`,
      top: `${particlePosition.y - 20}px`,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      color: "#fff",
      padding: "2px 6px",
      borderRadius: "4px",
      fontSize: "10px",
      pointerEvents: "none" as const,
      whiteSpace: "nowrap" as const,
      zIndex: 1002,
    };
  }, [edgeAnimation, settings.showDataLabels, particlePosition]);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyle}
        markerEnd={markerEnd}
      />
      {particleStyle && <div style={particleStyle} />}
      {labelStyle && <div style={labelStyle}>{edgeAnimation?.dataLabel}</div>}
    </>
  );
});

AnimatedEdge.displayName = "AnimatedEdge";

export default memo(AnimatedEdge, (prevProps, nextProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.workflowId === nextProps.workflowId &&
    prevProps.selected === nextProps.selected &&
    prevProps.sourceX === nextProps.sourceX &&
    prevProps.sourceY === nextProps.sourceY &&
    prevProps.targetX === nextProps.targetX &&
    prevProps.targetY === nextProps.targetY &&
    prevProps.style === nextProps.style
  );
});
