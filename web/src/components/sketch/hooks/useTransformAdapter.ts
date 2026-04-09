/**
 * useTransformAdapter
 *
 * Shared transform display/action model consumed by both ConnectedToolTopBar
 * and ConnectedContextMenu. Unifies the displayed transform consumption with
 * the same transient preview owner used by compositing, eliminating the
 * parallel active-layer preview channel that both components previously wired
 * independently.
 *
 * ## What it provides
 * - `scaleX`, `scaleY`, `rotation`: resolved display scalars from the preview
 *   or committed layer transform
 * - `onCommit`, `onCancel`, `onReset`: transform lifecycle callbacks
 *
 * ## Why
 * ConnectedToolTopBar and ConnectedContextMenu both called
 * `useDisplayedActiveLayerTransform()` independently and separately wired
 * `onTransformCommit`, `onTransformCancel`, `onTransformReset` through
 * `SketchEditor.tsx` props. This hook centralizes both the display and action
 * sides into one model.
 */

import { useMemo } from "react";
import { useDisplayedActiveLayerTransform } from "../activeLayerTransform";

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

  const display = useMemo<TransformDisplayState>(
    () => ({
      scaleX: activeLayerTransform.scaleX ?? 1,
      scaleY: activeLayerTransform.scaleY ?? 1,
      rotation: activeLayerTransform.rotation ?? 0
    }),
    [activeLayerTransform.scaleX, activeLayerTransform.scaleY, activeLayerTransform.rotation]
  );

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
