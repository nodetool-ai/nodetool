/**
 * useTransformAdapter
 *
 * Shared transform display/action model consumed by ConnectedToolTopBar and
 * ConnectedContextMenu. Resolves the displayed transform from the same
 * transient preview owner used by compositing.
 *
 * Provides:
 * - `scaleX`, `scaleY`, `rotation`: resolved display scalars from the preview
 *   or committed layer transform
 * - `onCommit`, `onCancel`, `onReset`: transform lifecycle callbacks
 */

import { useMemo } from "react";
import { useDisplayedActiveLayerTransform } from "../activeLayerTransform";
import { isAffineTransform } from "../types";

export interface TransformDisplayState {
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface TransformAdapterActions {
  onCommit: () => void;
  onCancel: () => void;
  onReset: () => void;
}

export interface TransformAdapterResult {
  display: TransformDisplayState;
  actions: TransformAdapterActions;
}

export interface UseTransformAdapterParams {
  onTransformCommit: () => void;
  onTransformCancel: () => void;
  onTransformReset: () => void;
}

export function useTransformAdapter({
  onTransformCommit,
  onTransformCancel,
  onTransformReset
}: UseTransformAdapterParams): TransformAdapterResult {
  const activeLayerTransform = useDisplayedActiveLayerTransform();

  const display = useMemo<TransformDisplayState>(() => {
    if (isAffineTransform(activeLayerTransform)) {
      return {
        scaleX: activeLayerTransform.scaleX,
        scaleY: activeLayerTransform.scaleY,
        rotation: activeLayerTransform.rotation
      };
    }
    return { scaleX: 1, scaleY: 1, rotation: 0 };
  }, [activeLayerTransform]);

  const actions = useMemo<TransformAdapterActions>(
    () => ({
      onCommit: onTransformCommit,
      onCancel: onTransformCancel,
      onReset: onTransformReset
    }),
    [onTransformCommit, onTransformCancel, onTransformReset]
  );

  return { display, actions };
}
