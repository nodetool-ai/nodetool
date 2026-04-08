/** @jsxImportSource @emotion/react */
import React, { memo, useEffect } from "react";
import { SKETCH_FONT } from "./sketchStyles";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  Divider,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Popover,
  Typography
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import Rotate90DegreesCwIcon from "@mui/icons-material/Rotate90DegreesCw";
import FlipIcon from "@mui/icons-material/Flip";
import TransformIcon from "@mui/icons-material/Transform";

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

  const menuItemSx = {
    fontSize: SKETCH_FONT.md,
    py: 0.6,
    px: 1.5,
    minHeight: 32,
    borderRadius: "6px",
    mx: 0.5,
    "&:hover": {
      backgroundColor: theme.vars.palette.grey[800]
    }
  };

  const shortcutSx = {
    fontSize: SKETCH_FONT.xs,
    color: "text.secondary",
    ml: 2,
    fontWeight: 600
  };

  return (
    <Popover
      open={open}
      onClose={onClose}
      transitionDuration={{ enter: 60, exit: 40 }}
      anchorReference="anchorPosition"
      transformOrigin={{
        vertical: "top",
        horizontal: "left"
      }}
      anchorPosition={
        open && position ? { top: position.y, left: position.x } : undefined
      }
      disableRestoreFocus
      slotProps={{
        paper: {
          className: "sketch-transform-context-menu",
          sx: {
            minWidth: 200,
            maxWidth: 280,
            borderRadius: "10px",
            backgroundImage: "none",
            backgroundColor: theme.vars.palette.grey[900],
            backdropFilter: "blur(16px)",
            boxShadow: theme.shadows[12],
            py: 0.5
          }
        }
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 0.75,
          mb: 0.25
        }}
      >
        <TransformIcon sx={{ fontSize: 16, color: "primary.light" }} />
        <Typography
          sx={{
            fontSize: SKETCH_FONT.section,
            fontWeight: 700,
            color: "text.primary"
          }}
        >
          Free Transform
        </Typography>
      </Box>

      <Divider sx={{ mx: 1, borderColor: theme.vars.palette.grey[800] }} />

      {/* Commit / Cancel / Reset */}
      <MenuItem
        onClick={() => {
          onTransformCommit?.();
          onClose();
        }}
        sx={menuItemSx}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <CheckIcon sx={{ fontSize: 16, color: "success.main" }} />
        </ListItemIcon>
        <ListItemText
          primaryTypographyProps={{ fontSize: SKETCH_FONT.md }}
        >
          Commit
        </ListItemText>
        <Typography sx={shortcutSx}>Enter</Typography>
      </MenuItem>

      <MenuItem
        onClick={() => {
          onTransformCancel?.();
          onClose();
        }}
        sx={menuItemSx}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <CloseIcon sx={{ fontSize: 16, color: "error.main" }} />
        </ListItemIcon>
        <ListItemText
          primaryTypographyProps={{ fontSize: SKETCH_FONT.md }}
        >
          Cancel
        </ListItemText>
        <Typography sx={shortcutSx}>Esc</Typography>
      </MenuItem>

      <MenuItem
        onClick={() => {
          onTransformReset?.();
          onClose();
        }}
        sx={menuItemSx}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <RestartAltIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText
          primaryTypographyProps={{ fontSize: SKETCH_FONT.md }}
        >
          Reset
        </ListItemText>
      </MenuItem>

      <Divider sx={{ mx: 1, my: 0.5, borderColor: theme.vars.palette.grey[800] }} />

      {/* Rotation options */}
      <MenuItem
        onClick={() => {
          onRotate180?.();
          onClose();
        }}
        sx={menuItemSx}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <Rotate90DegreesCwIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText
          primaryTypographyProps={{ fontSize: SKETCH_FONT.md }}
        >
          Rotate 180°
        </ListItemText>
      </MenuItem>

      <MenuItem
        onClick={() => {
          onRotate90CW?.();
          onClose();
        }}
        sx={menuItemSx}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <RotateRightIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText
          primaryTypographyProps={{ fontSize: SKETCH_FONT.md }}
        >
          Rotate 90° CW
        </ListItemText>
      </MenuItem>

      <MenuItem
        onClick={() => {
          onRotate90CCW?.();
          onClose();
        }}
        sx={menuItemSx}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <RotateLeftIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText
          primaryTypographyProps={{ fontSize: SKETCH_FONT.md }}
        >
          Rotate 90° CCW
        </ListItemText>
      </MenuItem>

      <Divider sx={{ mx: 1, my: 0.5, borderColor: theme.vars.palette.grey[800] }} />

      {/* Flip options */}
      <MenuItem
        onClick={() => {
          onFlipHorizontal?.();
          onClose();
        }}
        sx={menuItemSx}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <FlipIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText
          primaryTypographyProps={{ fontSize: SKETCH_FONT.md }}
        >
          Flip Horizontal
        </ListItemText>
      </MenuItem>

      <MenuItem
        onClick={() => {
          onFlipVertical?.();
          onClose();
        }}
        sx={menuItemSx}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <FlipIcon sx={{ fontSize: 16, transform: "rotate(90deg)" }} />
        </ListItemIcon>
        <ListItemText
          primaryTypographyProps={{ fontSize: SKETCH_FONT.md }}
        >
          Flip Vertical
        </ListItemText>
      </MenuItem>
    </Popover>
  );
};

export default memo(TransformContextMenu);
