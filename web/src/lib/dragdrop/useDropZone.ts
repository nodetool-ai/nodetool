/**
 * useDropZone Hook
 *
 * Creates a drop zone with type-safe handling and optional ReactFlow integration.
 *
 * @example
 * // Basic drop zone for the canvas
 * const Canvas = () => {
 *   const dropProps = useDropZone({
 *     accepts: ['create-node', 'asset', 'file'],
 *     useFlowPosition: true,
 *     onDrop: async (data, event, position) => {
 *       switch (data.type) {
 *         case 'create-node':
 *           createNode(data.payload, position);
 *           break;
 *         case 'asset':
 *           addAssetNode(data.payload, position);
 *           break;
 *       }
 *     }
 *   });
 *
 *   return (
 *     <div
 *       {...dropProps}
 *       className={`canvas ${dropProps.isOver ? 'drag-over' : ''}`}
 *     />
 *   );
 * };
 */

import { useCallback, useMemo, useState, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { useDragDropStore } from "./store";
import type { DragData, DragDataType, DropZoneConfig } from "./types";
import {
  deserializeDragData,
  hasExternalFiles,
  extractFiles
} from "./serialization";

export function useDropZone<T extends DragDataType = DragDataType>(
  config: DropZoneConfig<T>
) {
  const [isOver, setIsOver] = useState(false);
  const [canDrop, setCanDrop] = useState(false);
  const activeDrag = useDragDropStore((s) => s.activeDrag);
  const dragCounter = useRef(0); // Track nested drag enter/leave

  // Optional ReactFlow integration - wrapped in try/catch for use outside ReactFlow context
  let reactFlow: ReturnType<typeof useReactFlow> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    reactFlow = useReactFlow();
  } catch {
    // Not in ReactFlow context - that's fine
  }

  const getPosition = useCallback(
    (event: React.DragEvent) => {
      if (config.useFlowPosition && reactFlow) {
        return reactFlow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY
        });
      }
      return { x: event.clientX, y: event.clientY };
    },
    [config.useFlowPosition, reactFlow]
  );

  const checkCanDrop = useCallback(
    async (data: DragData | null, event: React.DragEvent): Promise<boolean> => {
      // Check for external files
      if (hasExternalFiles(event.dataTransfer)) {
        const acceptsFiles = config.accepts.includes("file" as T);
        return acceptsFiles;
      }

      if (!data) return false;

      // Type check
      if (!config.accepts.includes(data.type as T)) {
        return false;
      }

      // Custom validation
      if (config.validate) {
        return await config.validate(data as DragData<T>, event);
      }

      return true;
    },
    [config]
  );

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current++;

    if (dragCounter.current === 1) {
      setIsOver(true);
    }
  }, []);

  const handleDragOver = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();

      if (config.disabled) {
        event.dataTransfer.dropEffect = "none";
        return;
      }

      const valid = await checkCanDrop(activeDrag, event);
      setCanDrop(valid);
      event.dataTransfer.dropEffect = valid ? "move" : "none";
    },
    [activeDrag, checkCanDrop, config.disabled]
  );

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current--;

    if (dragCounter.current === 0) {
      setIsOver(false);
      setCanDrop(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      dragCounter.current = 0;
      setIsOver(false);
      setCanDrop(false);

      if (config.disabled) return;

      const position = getPosition(event);

      // Handle external files first
      if (
        hasExternalFiles(event.dataTransfer) &&
        config.accepts.includes("file" as T)
      ) {
        const files = extractFiles(event.dataTransfer);
        for (const file of files) {
          await config.onDrop(
            { type: "file", payload: file } as DragData<T>,
            event,
            position
          );
        }
        return;
      }

      // Handle internal drag data
      const data = deserializeDragData(event.dataTransfer);
      if (!data) return;

      if (!config.accepts.includes(data.type as T)) return;

      // Validate
      if (
        config.validate &&
        !(await config.validate(data as DragData<T>, event))
      ) {
        return;
      }

      await config.onDrop(data as DragData<T>, event, position);
    },
    [config, getPosition]
  );

  // Build className
  const className = useMemo(() => {
    const classes: string[] = [];
    if (isOver && config.activeClassName) {
      classes.push(config.activeClassName);
    }
    if (isOver && canDrop && config.validClassName) {
      classes.push(config.validClassName);
    }
    return classes.join(" ") || undefined;
  }, [isOver, canDrop, config.activeClassName, config.validClassName]);

  return useMemo(
    () => ({
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      isOver,
      canDrop,
      className,
      "data-dropzone": true
    }),
    [
      handleDragEnter,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      isOver,
      canDrop,
      className
    ]
  );
}
