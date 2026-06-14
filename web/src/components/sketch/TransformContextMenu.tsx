import React, { memo, useEffect } from "react";
import { useTheme } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
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
  Text,
  BORDER_RADIUS
} from "../ui_primitives";
import { SKETCH_FONT } from "./sketchStyles";

export interface TransformContextMenuProps {
  open: boolean;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onTransformCommit?: () => void;
  onTransformCancel?: () => void;
  onTransformReset?: () => void;
  onRotate90CW?: () => void;
  onRotate90CCW?: () => void;
  onRotate180?: () => void;
  onFlipHorizontal?: () => void;
  onFlipVertical?: () => void;
}

const TransformContextMenu: React.FC<TransformContextMenuProps> = ({
  open,
  position,
  onClose,
  onTransformCommit,
  onTransformCancel,
  onTransformReset,
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

  return (
    <ContextMenu
      open={open}
      onClose={onClose}
      position={position}
      transitionDuration={{ enter: 60, exit: 40 }}
      transformOrigin={{
        vertical: "top",
        horizontal: "left"
      }}
      disableRestoreFocus
      minWidth={200}
      paperSx={{
        maxWidth: 280,
        borderRadius: BORDER_RADIUS.lg,
        backgroundImage: "none",
        backgroundColor: theme.vars.palette.grey[900],
        backdropFilter: "blur(16px)",
        boxShadow: theme.shadows[12],
        py: 0.5
      }}
      slotProps={{
        paper: {
          className: "sketch-transform-context-menu"
        }
      }}
    >
      <FlexRow
        align="center"
        sx={{
          gap: 1,
          px: 2,
          py: 1,
          mb: 0.5
        }}
      >
        <TransformIcon sx={{ fontSize: 16, color: "primary.light" }} />
        <Text
          sx={{
            fontSize: SKETCH_FONT.section,
            fontWeight: 600,
            color: "text.primary"
          }}
        >
          Free Transform
        </Text>
      </FlexRow>

      <Divider sx={{ mx: 1, borderColor: theme.vars.palette.grey[800] }} />

      <MenuItemPrimitive
        label="Commit"
        icon={<CheckIcon sx={{ fontSize: 16, color: "success.main" }} />}
        shortcut="Enter"
        compact
        onClick={() => {
          onTransformCommit?.();
          onClose();
        }}
      />
      <MenuItemPrimitive
        label="Cancel"
        icon={<CloseIcon sx={{ fontSize: 16, color: "error.main" }} />}
        shortcut="Esc"
        compact
        onClick={() => {
          onTransformCancel?.();
          onClose();
        }}
      />
      <MenuItemPrimitive
        label="Reset"
        icon={<RestartAltIcon sx={{ fontSize: 16 }} />}
        compact
        onClick={() => {
          onTransformReset?.();
          onClose();
        }}
      />

      <Divider sx={{ mx: 1, my: 0.5, borderColor: theme.vars.palette.grey[800] }} />

      <MenuItemPrimitive
        label="Rotate 180°"
        icon={<Rotate90DegreesCwIcon sx={{ fontSize: 16 }} />}
        compact
        onClick={() => {
          onRotate180?.();
          onClose();
        }}
      />
      <MenuItemPrimitive
        label="Rotate 90° CW"
        icon={<RotateRightIcon sx={{ fontSize: 16 }} />}
        compact
        onClick={() => {
          onRotate90CW?.();
          onClose();
        }}
      />
      <MenuItemPrimitive
        label="Rotate 90° CCW"
        icon={<RotateLeftIcon sx={{ fontSize: 16 }} />}
        compact
        onClick={() => {
          onRotate90CCW?.();
          onClose();
        }}
      />

      <Divider sx={{ mx: 1, my: 0.5, borderColor: theme.vars.palette.grey[800] }} />

      <MenuItemPrimitive
        label="Flip Horizontal"
        icon={<FlipIcon sx={{ fontSize: 16 }} />}
        compact
        onClick={() => {
          onFlipHorizontal?.();
          onClose();
        }}
      />
      <MenuItemPrimitive
        label="Flip Vertical"
        icon={<FlipIcon sx={{ fontSize: 16, transform: "rotate(90deg)" }} />}
        compact
        onClick={() => {
          onFlipVertical?.();
          onClose();
        }}
      />
    </ContextMenu>
  );
};

export default memo(TransformContextMenu);
