import React, { useCallback, useRef, useState } from "react";
import {
  Box,
  Popover,
  Tooltip,
  IconButton,
  Typography,
  Grid
} from "@mui/material";
import { Palette } from "@mui/icons-material";
import { NODE_COLORS, NodeColorValue } from "../../config/nodeColors";

interface NodeColorPickerProps {
  currentColor: string | undefined;
  onColorChange: (color: NodeColorValue) => void;
  disabled?: boolean;
}

export const NodeColorPicker: React.FC<NodeColorPickerProps> = ({
  currentColor,
  onColorChange,
  disabled = false
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleOpen = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleColorSelect = useCallback(
    (color: NodeColorValue) => {
      onColorChange(color);
      handleClose();
    },
    [onColorChange, handleClose]
  );

  const isOpen = Boolean(anchorEl);

  return (
    <>
      <Tooltip title="Change node color" arrow>
        <IconButton
          ref={buttonRef}
          onClick={handleOpen}
          disabled={disabled}
          size="small"
          sx={{
            width: 24,
            height: 24,
            p: 0,
            "&:disabled": {
              opacity: 0.5
            }
          }}
          aria-label="Change node color"
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          <Box
            sx={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              bgcolor: currentColor || "transparent",
              border: currentColor ? "2px solid" : "2px dashed",
              borderColor: currentColor ? "transparent" : "action.active",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              transition: "all 0.2s ease-in-out"
            }}
          >
            {!currentColor && (
              <Palette sx={{ fontSize: 12, color: "action.active" }} />
            )}
          </Box>
        </IconButton>
      </Tooltip>

      <Popover
        open={isOpen}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        PaperProps={{
          sx: {
            p: 1.5,
            bgcolor: "background.paper",
            minWidth: 280
          }
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Node Color
        </Typography>

        <Grid container spacing={1}>
          {NODE_COLORS.map((colorOption) => {
            const isSelected = currentColor === colorOption.value;
            return (
              <Grid size={{ xs: 4 }} key={colorOption.value}>
                <Tooltip title={colorOption.description} arrow>
                  <Box
                    onClick={() => handleColorSelect(colorOption.value)}
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      cursor: "pointer",
                      p: 0.5,
                      borderRadius: 1,
                      bgcolor: isSelected ? "action.selected" : "transparent",
                      "&:hover": {
                        bgcolor: "action.hover"
                      },
                      transition: "all 0.15s ease-in-out"
                    }}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleColorSelect(colorOption.value);
                      }
                    }}
                  >
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        bgcolor: colorOption.value || "transparent",
                        border: colorOption.value
                          ? "2px solid"
                          : "2px dashed",
                        borderColor: colorOption.value
                          ? "transparent"
                          : "action.active",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        mb: 0.5,
                        boxShadow: isSelected
                          ? `0 0 0 2px ${colorOption.value || "#6B7280"}`
                          : "none",
                        transform: isSelected ? "scale(1.1)" : "scale(1)",
                        transition: "all 0.15s ease-in-out"
                      }}
                    >
                      {!colorOption.value && (
                        <Palette
                          sx={{
                            fontSize: 12,
                            color: "action.active"
                          }}
                        />
                      )}
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "0.65rem",
                        textAlign: "center",
                        lineHeight: 1.2,
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {colorOption.label}
                    </Typography>
                  </Box>
                </Tooltip>
              </Grid>
            );
          })}
        </Grid>

        <Typography
          variant="caption"
          sx={{
            mt: 1,
            display: "block",
            color: "text.secondary",
            textAlign: "center",
            fontStyle: "italic"
          }}
        >
          Colors help organize and identify nodes visually
        </Typography>
      </Popover>
    </>
  );
};

export default NodeColorPicker;
