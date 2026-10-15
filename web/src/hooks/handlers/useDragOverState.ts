import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";

type UseDragOverStateOptions = {
  /** Only count drags that carry files (ignores in-app drags of text/assets). */
  filesOnly?: boolean;
  /** Delay before a drag-leave clears the state; a re-entry cancels it. */
  leaveDelayMs?: number;
};

type DragOverState = {
  isOver: boolean;
  /** Mark the target as drag-over. Does not call preventDefault. */
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  /** Clear the state. Call from the drop handler. */
  reset: () => void;
};

const carriesFiles = (event: DragEvent<HTMLElement>): boolean =>
  Array.from(event.dataTransfer?.items ?? []).some(
    (item) => item.kind === "file"
  );

/**
 * Tracks whether a drag is currently over a drop target. Pure state: callers
 * keep their own preventDefault / drop handling (see `useFileDrop`), so this
 * is shared by the `DropZone` primitive and every hand-wired drop target.
 */
export function useDragOverState(
  options: UseDragOverStateOptions = {}
): DragOverState {
  const { filesOnly = false, leaveDelayMs = 0 } = options;
  const [isOver, setIsOver] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      clearTimer();
      setIsOver(filesOnly ? carriesFiles(event) : true);
    },
    [filesOnly, clearTimer]
  );

  const onDragLeave = useCallback(() => {
    clearTimer();
    if (leaveDelayMs > 0) {
      timer.current = setTimeout(() => setIsOver(false), leaveDelayMs);
    } else {
      setIsOver(false);
    }
  }, [leaveDelayMs, clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setIsOver(false);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return { isOver, onDragOver, onDragLeave, reset };
}
