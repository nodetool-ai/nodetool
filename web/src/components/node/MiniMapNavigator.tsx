/** @jsxImportSource @emotion/react */
import { memo, useMemo, useState, useCallback } from "react";
import { MiniMap, Node } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";
import { useMiniMapStore } from "../../stores/MiniMapStore";
import {
  createMinimapNodeColorFn,
  NodeTypeCategory,
  getNodeCategoryColor
} from "../../utils/ColorUtils";
import {
  Popover,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon
} from "@mui/material";
import { Text, ToolbarIconButton, FlexRow } from "../ui_primitives";
import PaletteIcon from "@mui/icons-material/Palette";
import LegendToggleIcon from "@mui/icons-material/LegendToggle";
import CheckIcon from "@mui/icons-material/Check";

const minimapStyle = {
  position: "absolute" as const,
  bottom: "70px",
  right: "20px",
  zIndex: 10
};

const MiniMapNavigator: React.FC = () => {
  const theme = useTheme();
  const isDarkMode = useIsDarkMode();
  const visible = useMiniMapStore((state) => state.visible);
  const colorMode = useMiniMapStore((state) => state.colorMode);
  const showLegend = useMiniMapStore((state) => state.showLegend);
  const setColorMode = useMiniMapStore((state) => state.setColorMode);

  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const [legendAnchor, setLegendAnchor] = useState<HTMLElement | null>(null);

  const nodeColor = useMemo(() => {
    return createMinimapNodeColorFn(
      isDarkMode,
      colorMode === "type",
      theme.vars.palette.primary.main
    );
  }, [theme, isDarkMode, colorMode]);

  const maskColor = useMemo(() => {
    return isDarkMode
      ? "rgba(0, 0, 0, 0.6)"
      : "rgba(255, 255, 255, 0.6)";
  }, [isDarkMode]);

  const borderColor = useMemo(() => {
    return isDarkMode
      ? "rgba(255, 255, 255, 0.2)"
      : "rgba(0, 0, 0, 0.1)";
  }, [isDarkMode]);

  const handleOpenSettings = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setSettingsAnchor(event.currentTarget);
    },
    []
  );

  const handleCloseSettings = useCallback(() => {
    setSettingsAnchor(null);
  }, []);

  const handleOpenLegend = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setLegendAnchor(event.currentTarget);
    },
    []
  );

  const handleCloseLegend = useCallback(() => {
    setLegendAnchor(null);
  }, []);

  const handleSetDefaultMode = useCallback(() => {
    setColorMode("default");
    handleCloseSettings();
  }, [setColorMode, handleCloseSettings]);

  const handleSetTypeMode = useCallback(() => {
    setColorMode("type");
    handleCloseSettings();
  }, [setColorMode, handleCloseSettings]);

  if (!visible) {
    return null;
  }

  const legendItems: Array<{
    category: NodeTypeCategory;
    label: string;
    color: string;
  }> = [
    {
      category: NodeTypeCategory.Input,
      label: "Input Nodes",
      color: getNodeCategoryColor(NodeTypeCategory.Input, isDarkMode)
    },
    {
      category: NodeTypeCategory.Constant,
      label: "Constant Nodes",
      color: getNodeCategoryColor(NodeTypeCategory.Constant, isDarkMode)
    },
    {
      category: NodeTypeCategory.Processing,
      label: "Processing Nodes",
      color: getNodeCategoryColor(NodeTypeCategory.Processing, isDarkMode)
    },
    {
      category: NodeTypeCategory.Group,
      label: "Group Nodes",
      color: getNodeCategoryColor(NodeTypeCategory.Group, isDarkMode)
    },
    {
      category: NodeTypeCategory.Comment,
      label: "Comment Nodes",
      color: getNodeCategoryColor(NodeTypeCategory.Comment, isDarkMode)
    },
    {
      category: NodeTypeCategory.Output,
      label: "Output Nodes",
      color: getNodeCategoryColor(NodeTypeCategory.Output, isDarkMode)
    }
  ];

  return (
    <>
      <div className="minimap-navigator" css={{ minimapStyle }}>
        <div
          style={{
            position: "relative",
            display: "inline-block"
          }}
        >
          <MiniMap
            nodeColor={nodeColor}
            maskColor={maskColor}
            nodeStrokeWidth={2}
            nodeStrokeColor={(node: Node) => {
              if (node.selected) {
                return theme.vars.palette.primary.main;
              }
              return isDarkMode ? "#475569" : "#cbd5e1";
            }}
            nodeBorderRadius={8}
            zoomable
            pannable
            style={{
              backgroundColor: isDarkMode
                ? theme.vars.palette.grey[900]
                : theme.vars.palette.grey[100],
              border: `1px solid ${borderColor}`,
              borderRadius: "var(--rounded-lg)"
            }}
          />

          {/* Settings and Legend Buttons */}
          <FlexRow
            gap={0.25}
            sx={{
              position: "absolute",
              top: "-28px",
              right: 0
            }}
          >
            {colorMode === "type" && showLegend && (
              <ToolbarIconButton
                title="Node Type Legend"
                size="small"
                onClick={handleOpenLegend}
                sx={{
                  padding: "2px",
                  backgroundColor: theme.vars.palette.background.paper,
                  border: `1px solid ${borderColor}`,
                  borderRadius: "var(--rounded-sm)",
                  "&:hover": {
                    backgroundColor: theme.vars.palette.action.hover
                  }
                }}
              >
                <LegendToggleIcon sx={{ fontSize: "0.9rem" }} />
              </ToolbarIconButton>
            )}
            <ToolbarIconButton
              title="Color Mode Settings"
              size="small"
              onClick={handleOpenSettings}
              sx={{
                padding: "2px",
                backgroundColor: theme.vars.palette.background.paper,
                border: `1px solid ${borderColor}`,
                borderRadius: "var(--rounded-sm)",
                "&:hover": {
                  backgroundColor: theme.vars.palette.action.hover
                }
              }}
            >
              <PaletteIcon sx={{ fontSize: "0.9rem" }} />
            </ToolbarIconButton>
          </FlexRow>
        </div>
      </div>

      {/* Settings Popover */}
      <Popover
        open={Boolean(settingsAnchor)}
        anchorEl={settingsAnchor}
        onClose={handleCloseSettings}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 180,
              borderRadius: "var(--rounded-lg)"
            }
          }
        }}
      >
        <List dense disablePadding>
          <ListItem disablePadding>
            <ListItemButton
              onClick={handleSetDefaultMode}
              selected={colorMode === "default"}
              sx={{
                "&.Mui-selected": {
                  backgroundColor: theme.vars.palette.action.selected
                }
              }}
            >
              <ListItemIcon>
                {colorMode === "default" ? (
                  <CheckIcon sx={{ fontSize: "1rem" }} />
                ) : (
                  <span style={{ width: "1rem", display: "inline-block" }} />
                )}
              </ListItemIcon>
              <ListItemText
                primary="Default Colors"
                primaryTypographyProps={{
                  fontSize: "0.85rem"
                }}
              />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton
              onClick={handleSetTypeMode}
              selected={colorMode === "type"}
              sx={{
                "&.Mui-selected": {
                  backgroundColor: theme.vars.palette.action.selected
                }
              }}
            >
              <ListItemIcon>
                {colorMode === "type" ? (
                  <CheckIcon sx={{ fontSize: "1rem" }} />
                ) : (
                  <span style={{ width: "1rem", display: "inline-block" }} />
                )}
              </ListItemIcon>
              <ListItemText
                primary="Color by Type"
                primaryTypographyProps={{
                  fontSize: "0.85rem"
                }}
              />
            </ListItemButton>
          </ListItem>
        </List>
      </Popover>

      {/* Legend Popover */}
      <Popover
        open={Boolean(legendAnchor)}
        anchorEl={legendAnchor}
        onClose={handleCloseLegend}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 180,
              borderRadius: "var(--rounded-lg)"
            }
          }
        }}
      >
        <div style={{ padding: 8 }}>
          <Text
            size="small"
            weight={600}
            color="secondary"
            sx={{
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              mb: 0.5,
              px: 1
            }}
          >
            Node Types
          </Text>
          <List dense disablePadding>
            {legendItems.map((item) => (
              <ListItem
                key={item.category}
                disablePadding
                sx={{ py: 0.25, px: 0 }}
              >
                <FlexRow
                  align="center"
                  fullWidth
                  sx={{
                    px: 1,
                    py: 0.5,
                    borderRadius: "var(--rounded-sm)",
                    "&:hover": {
                      backgroundColor: theme.vars.palette.action.hover
                    }
                  }}
                >
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      backgroundColor: item.color,
                      borderRadius: "var(--rounded-xs)",
                      marginRight: 12,
                      flexShrink: 0
                    }}
                  />
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: "0.8rem",
                      color: theme.vars.palette.text.primary
                    }}
                  />
                </FlexRow>
              </ListItem>
            ))}
          </List>
        </div>
      </Popover>
    </>
  );
};

export default memo(MiniMapNavigator);
