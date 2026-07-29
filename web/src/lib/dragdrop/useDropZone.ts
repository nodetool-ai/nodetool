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

import React, { useCallback, useMemo, useState, useRef } from "react";
import { useDragDropStore } from "./store";
import type { DragData, DragDataType, DropZoneConfig } from "./types";
import {
  deserializeDragData,
  hasExternalFiles,
  extractFiles
} from "./serialization";

export interface DropZoneProps {
  onDragEnter: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => Promise<void>;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => Promise<void>;
  isOver: boolean;
  canDrop: boolean;
  className: string | undefined;
  "data-dropzone": true;
}

export function useDropZone<T extends DragDataType = DragDataType>(
  config: DropZoneConfig<T>
): DropZoneProps {
  const [isOver, setIsOver] = useState(false);
  const [canDrop, setCanDrop] = useState(false);
  const activeDrag = useDragDropStore((s) => s.activeDrag);
  const dragCounter = useRef(0); // Track nested drag enter/leave

  const getPosition = useCallback(
    (event: React.DragEvent) => {
      // Position conversion should be done by the caller if needed
      // via config.onDrop
      return { x: event.clientX, y: event.clientY };
    },
    []
  );

  const checkCanDrop = useCallback(
    async (data: DragData | null, event: React.DragEvent): Promise<boolean> => {
      if (hasExternalFiles(event.dataTransfer)) {
        return config.accepts.includes("file" as T);
      }

      if (!data) {return false;}

      if (!config.accepts.includes(data.type as T)) {
        return false;
      }

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

      if (config.disabled) {return;}

      const position = getPosition(event);

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

      const data = deserializeDragData(event.dataTransfer);
      if (!data) {return;}

      if (!config.accepts.includes(data.type as T)) {return;}

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
