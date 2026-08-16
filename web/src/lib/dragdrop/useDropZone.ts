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
        // SAFETY: not a claim that this zone accepts files — `includes` types
        // its argument as T, so the assertion only lets the literal be tested
        // against `accepts`. A zone that does not list "file" returns false.
        return config.accepts.includes("file" as T);
      }

      if (!data) {return false;}

      // SAFETY: `includes` types its argument as T; the assertion only lets
      // `data.type` be tested against `accepts`, and an unaccepted type falls
      // out here rather than reaching a handler.
      if (!config.accepts.includes(data.type as T)) {
        return false;
      }

      if (config.validate) {
        // SAFETY: the check above proved `data.type` is one of T, and
        // `DragData` is a union discriminated by `type`, so `data` is the
        // member of `DragData<T>` that carries that type's payload.
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
        // SAFETY: not a claim that this zone accepts files — `includes` types
        // its argument as T, so the assertion only lets the literal be tested
        // against `accepts`. A zone that omits "file" fails the test.
        config.accepts.includes("file" as T)
      ) {
        const files = extractFiles(event.dataTransfer);
        for (const file of files) {
          // SAFETY: this branch is entered only when `accepts` contains
          // "file", so "file" is one of T and the literal below is exactly
          // `DragDataFor<"file">` — a File payload, which `extractFiles`
          // returns.
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

      // SAFETY: `includes` types its argument as T; the assertion only lets
      // `data.type` be tested against `accepts`, and an unaccepted type
      // returns here without reaching a handler.
      if (!config.accepts.includes(data.type as T)) {return;}

      if (
        config.validate &&
        // SAFETY: the `accepts.includes` check above proved `data.type` is one
        // of T, and `DragData` is a union discriminated by `type`, so `data`
        // is the member of `DragData<T>` carrying that type's payload.
        !(await config.validate(data as DragData<T>, event))
      ) {
        return;
      }

      // SAFETY: same check — `data.type` is one of T, and `DragData` is
      // discriminated by `type`, so `data` is a `DragData<T>`.
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
