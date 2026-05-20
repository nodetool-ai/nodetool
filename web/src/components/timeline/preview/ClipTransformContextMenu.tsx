/**
 * ClipTransformContextMenu — right-click quick transform actions for a
 * timeline clip. Mirrors the sketch editor's TransformContextMenu (rotate /
 * flip / reset) using the shared `ui_primitives` menu components.
 *
 * @module timeline/preview/ClipTransformContextMenu
 */

import React, { memo, useEffect } from "react";
import { useTheme } from "@mui/material/styles";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import Rotate90DegreesCwIcon from "@mui/icons-material/Rotate90DegreesCw";
import FlipIcon from "@mui/icons-material/Flip";
import TransformIcon from "@mui/icons-material/Transform";

import {
  ContextMenu,
  Divider,
  FlexRow,
  MenuItemPrimitive,
  Text
} from "../../ui_primitives";

export interface ClipTransformContextMenuProps {
  open: boolean;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onReset: () => void;
  onRotate90CW: () => void;
  onRotate90CCW: () => void;
  onRotate180: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
}

const ClipTransformContextMenu: React.FC<ClipTransformContextMenuProps> = ({
  open,
  position,
  onClose,
  onReset,
  onRotate90CW,
  onRotate90CCW,
  onRotate180,
  onFlipHorizontal,
  onFlipVertical
}) => {
  const theme = useTheme();

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <ContextMenu
      open={open}
      onClose={onClose}
      position={position}
      transitionDuration={{ enter: 60, exit: 40 }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      disableRestoreFocus
      minWidth={200}
      paperSx={{
        maxWidth: 280,
        borderRadius: "10px",
        backgroundImage: "none",
        backgroundColor: theme.vars.palette.grey[900],
        backdropFilter: "blur(16px)",
        boxShadow: theme.shadows[12],
        py: 0.5
      }}
    >
      <FlexRow align="center" sx={{ gap: 1, px: 2, py: 0.75, mb: 0.25 }}>
        <TransformIcon sx={{ fontSize: 16, color: "primary.light" }} />
        <Text sx={{ fontSize: 12, fontWeight: 700, color: "text.primary" }}>
          Transform
        </Text>
      </FlexRow>

      <Divider sx={{ mx: 1, borderColor: theme.vars.palette.grey[800] }} />

      <MenuItemPrimitive
        label="Reset"
        icon={<RestartAltIcon sx={{ fontSize: 16 }} />}
        shortcut="."
        compact
        onClick={run(onReset)}
      />

      <Divider sx={{ mx: 1, my: 0.5, borderColor: theme.vars.palette.grey[800] }} />

      <MenuItemPrimitive
        label="Rotate 180°"
        icon={<Rotate90DegreesCwIcon sx={{ fontSize: 16 }} />}
        compact
        onClick={run(onRotate180)}
      />
      <MenuItemPrimitive
        label="Rotate 90° CW"
        icon={<RotateRightIcon sx={{ fontSize: 16 }} />}
        compact
        onClick={run(onRotate90CW)}
      />
      <MenuItemPrimitive
        label="Rotate 90° CCW"
        icon={<RotateLeftIcon sx={{ fontSize: 16 }} />}
        compact
        onClick={run(onRotate90CCW)}
      />

      <Divider sx={{ mx: 1, my: 0.5, borderColor: theme.vars.palette.grey[800] }} />

      <MenuItemPrimitive
        label="Flip Horizontal"
        icon={<FlipIcon sx={{ fontSize: 16 }} />}
        compact
        onClick={run(onFlipHorizontal)}
      />
      <MenuItemPrimitive
        label="Flip Vertical"
        icon={<FlipIcon sx={{ fontSize: 16, transform: "rotate(90deg)" }} />}
        compact
        onClick={run(onFlipVertical)}
      />
    </ContextMenu>
  );
};

export { ClipTransformContextMenu };
export default memo(ClipTransformContextMenu);
