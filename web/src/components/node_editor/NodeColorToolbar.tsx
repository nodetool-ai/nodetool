import React, { useCallback, useState } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  Popover,
  Typography,
  Grid
} from "@mui/material";
import { Palette } from "@mui/icons-material";
import { NODE_COLORS, NodeColorValue } from "../../config/nodeColors";
import { useNodeColorActions } from "../../hooks/useNodeColorActions";
import { useNodes } from "../../contexts/NodeContext";

export const NodeColorToolbar: React.FC = () => {
  const selectedNodes = useNodes((state) => state.getSelectedNodes());
  const { setSelectedNodesColor } = useNodeColorActions();
  const [colorMenuAnchor, setColorMenuAnchor] = useState<HTMLButtonElement | null>(null);

  const canChangeColor = selectedNodes.length > 0;

  const handleOpenColorMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setColorMenuAnchor(event.currentTarget);
    },
    []
  );

  const handleCloseColorMenu = useCallback(() => {
    setColorMenuAnchor(null);
  }, []);

  const handleColorSelect = useCallback(
    (color: NodeColorValue) => {
      setSelectedNodesColor(color);
      handleCloseColorMenu();
    },
    [setSelectedNodesColor, handleCloseColorMenu]
  );

  return (
    <>
      <Tooltip title="Change node color" arrow>
        <IconButton
          onClick={handleOpenColorMenu}
          disabled={!canChangeColor}
          size="small"
          sx={{
            width: 32,
            height: 32,
            "&:hover": {
              bgcolor: "action.hover"
            },
            "&.Mui-disabled": {
              opacity: 0.4
            }
          }}
          aria-label="Change node color"
          aria-expanded={Boolean(colorMenuAnchor)}
          aria-haspopup="true"
        >
          <Palette fontSize="small" />
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(colorMenuAnchor)}
        anchorEl={colorMenuAnchor}
        onClose={handleCloseColorMenu}
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
            minWidth: 240,
            maxWidth: 280
          }
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Color Selected Nodes
        </Typography>

        <Grid container spacing={1}>
          {NODE_COLORS.slice(0, 12).map((colorOption) => {
            const isSelected = false;
            return (
              <Grid size={{ xs: 4 }} key={colorOption.value}>
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
                      width: 20,
                      height: 20,
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
                      transition: "all 0.15s ease-in-out"
                    }}
                  >
                    {!colorOption.value && (
                      <Palette
                        sx={{
                          fontSize: 10,
                          color: "action.active"
                        }}
                      />
                    )}
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "0.6rem",
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
          {selectedNodes.length} node{selectedNodes.length !== 1 ? "s" : ""} selected
        </Typography>
      </Popover>
    </>
  );
};

export default NodeColorToolbar;
