/**
 * Right-click menu on a clip's fade handle: the curve that edge ramps along.
 * Final Cut puts the same four shapes on the same gesture.
 */

import { CLIP_FADE_SHAPES, type ClipFadeShape } from "@nodetool-ai/timeline";
import { useTranslation } from "react-i18next";

import { ContextMenu, MenuItemPrimitive } from "../../ui_primitives";
import {
  CLIP_FADE_SHAPE_HINTS,
  CLIP_FADE_SHAPE_LABELS
} from "../fadeShapes";
import type { ClipFadeEdge } from "./useClipFade";

interface ClipFadeShapeMenuProps {
  edge: ClipFadeEdge;
  current: ClipFadeShape;
  position: { x: number; y: number };
  onSelect: (shape: ClipFadeShape) => void;
  onClose: () => void;
}

export function ClipFadeShapeMenu({
  edge,
  current,
  position,
  onSelect,
  onClose
}: ClipFadeShapeMenuProps) {
  const { t } = useTranslation();
  return (
    <ContextMenu
      open
      position={position}
      onClose={onClose}
      MenuListProps={{
        "aria-label": t(edge === "in" ? "i18n-next59.fadeShapes.fadeIn" : "i18n-next59.fadeShapes.fadeOut")
      }}
    >
      {CLIP_FADE_SHAPES.map((shape) => (
        <MenuItemPrimitive
          key={shape}
          label={t(`i18n-next59.fadeShapes.labels.${shape}`, { defaultValue: CLIP_FADE_SHAPE_LABELS[shape] })}
          tooltip={t(`i18n-next59.fadeShapes.hints.${shape}`, { defaultValue: CLIP_FADE_SHAPE_HINTS[shape] })}
          selected={shape === current}
          onClick={() => {
            onSelect(shape);
            onClose();
          }}
        />
      ))}
    </ContextMenu>
  );
}
