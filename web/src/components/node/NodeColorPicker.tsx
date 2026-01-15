/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useState } from "react";
import { Popover, Box, Typography, Button, Divider, Tooltip } from "@mui/material";
import PaletteIcon from "@mui/icons-material/Palette";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const NODE_COLOR_PALETTE = [
  "#EF4444", // red
  "#F97316", // orange
  "#EAB308", // yellow
  "#22C55E", // green
  "#14B8A6", // teal
  "#06B6D4", // cyan
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#A855F7", // purple
  "#EC4899", // pink
  "#6B7280", // gray
  null // no color (default)
];

const styles = (theme: Theme) =>
  css({
    "& .color-picker-container": {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    "& .color-preview": {
      width: "20px",
      height: "20px",
      borderRadius: "4px",
      border: `1px solid ${theme.vars.palette.divider}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    "& .color-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "6px",
      padding: "8px"
    },
    "& .color-button": {
      width: "28px",
      height: "28px",
      borderRadius: "4px",
      border: `1px solid ${theme.vars.palette.divider}`,
      minWidth: "unset",
      minHeight: "unset",
      padding: 0,
      "&:hover": {
        transform: "scale(1.1)"
      }
    },
    "& .no-color-button": {
      backgroundColor: "transparent",
      border: "2px dashed #666",
      fontSize: "10px",
      color: "#888"
    },
    "& .color-label": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary
    }
  });

interface NodeColorPickerProps {
  currentColor: string | null | undefined;
  onColorChange: (color: string | null) => void;
  _nodeLabel?: string;
}

const NodeColorPicker: React.FC<NodeColorPickerProps> = ({
  currentColor,
  onColorChange,
  _nodeLabel
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleColorSelect = useCallback((color: string | null) => {
    onColorChange(color);
    handleClose();
  }, [onColorChange, handleClose]);

  const open = Boolean(anchorEl);
  const id = open ? "node-color-picker-popover" : undefined;

  return (
    <div className="color-picker-container" css={styles(theme)}>
      <Tooltip
        title={
          <span>
            <Typography component="span" sx={{ fontSize: "11px", fontWeight: 600 }}>
              Node Color
            </Typography>
            <Typography component="span" sx={{ display: "block", fontSize: "10px" }}>
              Set a custom color for this node
            </Typography>
          </span>
        }
        placement="right"
        arrow
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          className="color-button"
          onClick={handleClick}
          size="small"
          aria-label="Set node color"
          sx={{
            minWidth: "unset",
            minHeight: "unset",
            padding: "4px"
          }}
        >
          <Box
            className="color-preview"
            sx={{
              backgroundColor: currentColor || "transparent",
              width: "24px",
              height: "24px"
            }}
          >
            {!currentColor && (
              <PaletteIcon sx={{ fontSize: "14px", color: "text.secondary" }} />
            )}
          </Box>
        </Button>
      </Tooltip>

      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "center",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "center",
          horizontal: "left"
        }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: "8px",
              overflow: "hidden"
            }
          }
        }}
      >
        <Box sx={{ p: 1 }}>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              px: 1,
              py: 0.5,
              color: "text.secondary",
              fontSize: "11px"
            }}
          >
            Node Color
          </Typography>

          <Box className="color-grid">
            {NODE_COLOR_PALETTE.map((color, index) => (
              <Tooltip
                key={index}
                title={color ? color : "Default color"}
                placement="top"
                arrow
              >
                <Button
                  className={`color-button ${color === null ? "no-color-button" : ""}`}
                  onClick={() => handleColorSelect(color)}
                  sx={{
                    backgroundColor: color || "transparent",
                    color: color ? "white" : "inherit",
                    fontSize: color ? "0" : "10px"
                  }}
                >
                  {color === null && "✕"}
                </Button>
              </Tooltip>
            ))}
          </Box>

          <Divider sx={{ my: 1 }} />

          <Typography
            variant="caption"
            sx={{
              display: "block",
              px: 1,
              color: "text.disabled",
              fontSize: "10px"
            }}
          >
            Select a color to customize this node, or ✕ to use the default color
          </Typography>
        </Box>
      </Popover>
    </div>
  );
};

export default NodeColorPicker;
