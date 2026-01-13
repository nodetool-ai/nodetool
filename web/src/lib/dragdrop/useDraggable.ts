/**
 * useDraggable Hook
 *
 * Makes any element draggable with type-safe data and customizable options.
 *
 * @example
 * // Basic usage - make a node menu item draggable
 * const NodeMenuItem = ({ node }: { node: NodeMetadata }) => {
 *   const dragProps = useDraggable({
 *     type: 'create-node',
 *     payload: node
 *   });
 *   return <div {...dragProps}>{node.title}</div>;
 * };
 *
 * @example
 * // With count badge for multiple selection
 * const AssetItem = ({ asset, selectedCount }: Props) => {
 *   const dragProps = useDraggable(
 *     { type: 'asset', payload: asset },
 *     { dragImage: { count: selectedCount } }
 *   );
 *   return <div {...dragProps}>{asset.name}</div>;
 * };
 *
 * @example
 * // With thumbnail preview for images
 * const ImageItem = ({ asset }: Props) => {
 *   const dragProps = useDraggable(
 *     { type: 'asset', payload: asset },
 *     { dragImage: { thumbnailUrl: asset.get_url } }
 *   );
 *   return <div {...dragProps}><img src={asset.get_url} /></div>;
 * };
 */

import { useCallback, useMemo, useRef } from "react";
import { useDragDropStore } from "./store";
import type {
  DragData,
  DragDataType,
  DraggableOptions,
  DragImageConfig
} from "./types";
import {
  serializeDragData,
  createDragCountBadge,
  createDragImagePreview
} from "./serialization";

export function useDraggable<T extends DragDataType>(
  data: DragData<T>,
  options?: DraggableOptions
) {
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);
  const dragImageRef = useRef<HTMLElement | null>(null);

  const handleDragStart = useCallback(
    (event: React.DragEvent) => {
      if (options?.disabled) {
        event.preventDefault();
        return;
      }

      // Serialize data to dataTransfer
      serializeDragData(data, event.dataTransfer);

      // Set effect
      event.dataTransfer.effectAllowed = options?.effectAllowed ?? "move";

      // Handle drag image
      if (options?.dragImage) {
        let imageElement: HTMLElement;

        if (options.dragImage instanceof HTMLElement) {
          imageElement = options.dragImage;
        } else {
          // DragImageConfig
          const config = options.dragImage as DragImageConfig;
          if (config.thumbnailUrl) {
            // Use thumbnail preview with optional count badge
            imageElement = createDragImagePreview(
              config.thumbnailUrl,
              config.count,
              config.maxSize
            );
          } else if (config.count !== undefined) {
            imageElement = createDragCountBadge(config.count);
          } else if (config.content) {
            imageElement = document.createElement("div");
            imageElement.textContent = config.content;
            imageElement.style.cssText = "position: absolute; top: -99999px;";
          } else {
            imageElement = event.currentTarget as HTMLElement;
          }
        }

        // Append temporarily if not in DOM
        if (!imageElement.parentElement) {
          document.body.appendChild(imageElement);
          dragImageRef.current = imageElement;
        }

        const offset = (options.dragImage as DragImageConfig)?.offset ?? {
          x: 25,
          y: 30
        };
        event.dataTransfer.setDragImage(imageElement, offset.x, offset.y);
      }

      // Update global state
      setActiveDrag(data);

      // Call user callback
      options?.onDragStart?.(event);
    },
    [data, options, setActiveDrag]
  );

  const handleDragEnd = useCallback(
    (event: React.DragEvent) => {
      // Clean up drag image using modern remove() method
      if (dragImageRef.current) {
        dragImageRef.current.remove();
        dragImageRef.current = null;
      }

      clearDrag();
      options?.onDragEnd?.(event);
    },
    [clearDrag, options]
  );

  return useMemo(
    () => ({
      draggable: !options?.disabled,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      "data-drag-type": data.type
    }),
    [data.type, handleDragStart, handleDragEnd, options?.disabled]
  );
}
