import { useRef, useCallback } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

/**
 * Snap tolerance in pixels for alignment guides.
 * When a dragged node is within this distance of an alignment point,
 * the guide will appear.
 */
const SNAP_TOLERANCE = 8;

/**
 * Represents a single alignment guide line.
 */
export interface AlignmentGuide {
  /** The position of the guide (x for vertical lines, y for horizontal) */
  position: number;
  /** The start and end of the visible portion of the guide */
  start: number;
  end: number;
  /** The type of guide (vertical or horizontal) */
  orientation: "vertical" | "horizontal";
  /** The type of alignment that triggered this guide */
  type: "start" | "center" | "end" | "spacing";
}

/**
 * The bounds of a node for alignment calculations.
 */
interface NodeBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  endX: number;
  endY: number;
}

/**
 * Result of alignment guide calculations.
 */
export interface AlignmentGuidesResult {
  /** Callback to calculate guides during drag */
  calculateGuides: (
    draggedNodes: Node<NodeData>[],
    allNodes: Node<NodeData>[]
  ) => AlignmentGuide[];
  /** Callback to clear guides */
  clearGuides: () => void;
}

/**
 * Hook for calculating and managing smart alignment guides.
 *
 * This hook provides visual feedback when dragging nodes by showing
 * guide lines that align with:
 * - Node edges (top, bottom, left, right)
 * - Node centers
 * - Equal spacing between nodes
 *
 * @returns Alignment guides handlers
 *
 * @example
 * ```tsx
 * const { calculateGuides, clearGuides } = useAlignmentGuides();
 * const setGuides = useAlignmentGuidesStore(state => state.setGuides);
 *
 * <ReactFlow
 *   onNodeDrag={(event, node) => {
 *     const guides = calculateGuides([node], allNodes);
 *     setGuides(guides);
 *   }}
 *   onNodeDragStop={clearGuides}
 * />
 * ```
 */
export function useAlignmentGuides(): AlignmentGuidesResult {
  const guidesRef = useRef<AlignmentGuide[]>([]);

  /**
   * Calculate the bounds of a node for alignment calculations.
   */
  const getNodeBounds = useCallback((node: Node<NodeData>): NodeBounds => {
    const width = node.width || node.data?.size?.width || 200;
    const height = node.height || node.data?.size?.height || 100;
    return {
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width,
      height,
      centerX: node.position.x + width / 2,
      centerY: node.position.y + height / 2,
      endX: node.position.x + width,
      endY: node.position.y + height
    };
  }, []);

  /**
   * Check if a value is within snap tolerance of a target.
   */
  const isWithinTolerance = useCallback(
    (value: number, target: number): boolean => {
      return Math.abs(value - target) <= SNAP_TOLERANCE;
    },
    []
  );

  /**
   * Find vertical alignment guides for dragged nodes against reference nodes.
   */
  const findVerticalGuides = useCallback(
    (
      draggedBounds: NodeBounds[],
      referenceBounds: NodeBounds[]
    ): AlignmentGuide[] => {
      const guides: AlignmentGuide[] = [];
      const guidePositions = new Set<number>();

      // Collect all unique x-positions from reference nodes
      const referencePositions: number[] = [];
      referenceBounds.forEach((ref) => {
        referencePositions.push(ref.x, ref.centerX, ref.endX);
      });

      // For each dragged node, check alignment with reference positions
      draggedBounds.forEach((dragged) => {
        referencePositions.forEach((refPos) => {
          // Check start alignment
          if (isWithinTolerance(dragged.x, refPos)) {
            if (!guidePositions.has(refPos)) {
              guidePositions.add(refPos);
              const guideStart = Math.min(
                ...referenceBounds.map((b) => b.y),
                dragged.y
              );
              const guideEnd = Math.max(
                ...referenceBounds.map((b) => b.endY),
                dragged.endY
              );
              guides.push({
                position: refPos,
                start: guideStart - 50,
                end: guideEnd + 50,
                orientation: "vertical",
                type: dragged.x === refPos ? "start" : "center"
              });
            }
          }

          // Check center alignment
          if (isWithinTolerance(dragged.centerX, refPos)) {
            if (!guidePositions.has(refPos)) {
              guidePositions.add(refPos);
              const guideStart = Math.min(
                ...referenceBounds.map((b) => b.y),
                dragged.y
              );
              const guideEnd = Math.max(
                ...referenceBounds.map((b) => b.endY),
                dragged.endY
              );
              guides.push({
                position: refPos,
                start: guideStart - 50,
                end: guideEnd + 50,
                orientation: "vertical",
                type: "center"
              });
            }
          }

          // Check end alignment
          if (isWithinTolerance(dragged.endX, refPos)) {
            if (!guidePositions.has(refPos)) {
              guidePositions.add(refPos);
              const guideStart = Math.min(
                ...referenceBounds.map((b) => b.y),
                dragged.y
              );
              const guideEnd = Math.max(
                ...referenceBounds.map((b) => b.endY),
                dragged.endY
              );
              guides.push({
                position: refPos,
                start: guideStart - 50,
                end: guideEnd + 50,
                orientation: "vertical",
                type: "end"
              });
            }
          }
        });
      });

      return guides;
    },
    [isWithinTolerance]
  );

  /**
   * Find horizontal alignment guides for dragged nodes against reference nodes.
   */
  const findHorizontalGuides = useCallback(
    (
      draggedBounds: NodeBounds[],
      referenceBounds: NodeBounds[]
    ): AlignmentGuide[] => {
      const guides: AlignmentGuide[] = [];
      const guidePositions = new Set<number>();

      // Collect all unique y-positions from reference nodes
      const referencePositions: number[] = [];
      referenceBounds.forEach((ref) => {
        referencePositions.push(ref.y, ref.centerY, ref.endY);
      });

      // For each dragged node, check alignment with reference positions
      draggedBounds.forEach((dragged) => {
        referencePositions.forEach((refPos) => {
          // Check start alignment
          if (isWithinTolerance(dragged.y, refPos)) {
            if (!guidePositions.has(refPos)) {
              guidePositions.add(refPos);
              const guideStart = Math.min(
                ...referenceBounds.map((b) => b.x),
                dragged.x
              );
              const guideEnd = Math.max(
                ...referenceBounds.map((b) => b.endX),
                dragged.endX
              );
              guides.push({
                position: refPos,
                start: guideStart - 50,
                end: guideEnd + 50,
                orientation: "horizontal",
                type: "start"
              });
            }
          }

          // Check center alignment
          if (isWithinTolerance(dragged.centerY, refPos)) {
            if (!guidePositions.has(refPos)) {
              guidePositions.add(refPos);
              const guideStart = Math.min(
                ...referenceBounds.map((b) => b.x),
                dragged.x
              );
              const guideEnd = Math.max(
                ...referenceBounds.map((b) => b.endX),
                dragged.endX
              );
              guides.push({
                position: refPos,
                start: guideStart - 50,
                end: guideEnd + 50,
                orientation: "horizontal",
                type: "center"
              });
            }
          }

          // Check end alignment
          if (isWithinTolerance(dragged.endY, refPos)) {
            if (!guidePositions.has(refPos)) {
              guidePositions.add(refPos);
              const guideStart = Math.min(
                ...referenceBounds.map((b) => b.x),
                dragged.x
              );
              const guideEnd = Math.max(
                ...referenceBounds.map((b) => b.endX),
                dragged.endX
              );
              guides.push({
                position: refPos,
                start: guideStart - 50,
                end: guideEnd + 50,
                orientation: "horizontal",
                type: "end"
              });
            }
          }
        });
      });

      return guides;
    },
    [isWithinTolerance]
  );

  /**
   * Calculate all alignment guides for the currently dragged nodes.
   *
   * @param draggedNodes - The nodes currently being dragged
   * @param allNodes - All nodes in the workflow (excluding dragged nodes)
   * @returns Array of alignment guides to display
   */
  const calculateGuides = useCallback(
    (
      draggedNodes: Node<NodeData>[],
      allNodes: Node<NodeData>[]
    ): AlignmentGuide[] => {
      if (draggedNodes.length === 0 || allNodes.length === 0) {
        guidesRef.current = [];
        return [];
      }

      // Get bounds for dragged and reference nodes
      const draggedBounds = draggedNodes.map(getNodeBounds);
      const draggedIds = new Set(draggedNodes.map((n) => n.id));
      const referenceBounds = allNodes
        .filter((n) => !draggedIds.has(n.id))
        .map(getNodeBounds);

      if (referenceBounds.length === 0) {
        guidesRef.current = [];
        return [];
      }

      // Find vertical and horizontal guides
      const verticalGuides = findVerticalGuides(draggedBounds, referenceBounds);
      const horizontalGuides = findHorizontalGuides(
        draggedBounds,
        referenceBounds
      );

      guidesRef.current = [...verticalGuides, ...horizontalGuides];
      return guidesRef.current;
    },
    [getNodeBounds, findVerticalGuides, findHorizontalGuides]
  );

  /**
   * Clear all active alignment guides.
   */
  const clearGuides = useCallback(() => {
    guidesRef.current = [];
  }, []);

  return {
    calculateGuides,
    clearGuides
  };
}

export default useAlignmentGuides;
