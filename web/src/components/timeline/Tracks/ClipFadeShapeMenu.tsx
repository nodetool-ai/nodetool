/**
 * Right-click menu on a clip's fade handle: the curve that edge ramps along.
 * Final Cut puts the same four shapes on the same gesture.
 */

import { CLIP_FADE_SHAPES, type ClipFadeShape } from "@nodetool-ai/timeline";

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
  return (
    <ContextMenu
      open
      position={position}
      onClose={onClose}
      compact
      MenuListProps={{
        "aria-label": edge === "in" ? "Fade-in shape" : "Fade-out shape"
      }}
    >
      {CLIP_FADE_SHAPES.map((shape) => (
        <MenuItemPrimitive
          key={shape}
          label={CLIP_FADE_SHAPE_LABELS[shape]}
          tooltip={CLIP_FADE_SHAPE_HINTS[shape]}
          selected={shape === current}
          compact
          onClick={() => {
            onSelect(shape);
            onClose();
          }}
        />
      ))}
    </ContextMenu>
  );
}
