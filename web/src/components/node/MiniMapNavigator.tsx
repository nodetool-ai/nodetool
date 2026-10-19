/** @jsxImportSource @emotion/react */
import { memo, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  Caption,
  ContextMenu,
  EYEBROW,
  Text,
  ToolbarIconButton,
  FlexColumn,
  FlexRow,
  MenuItemPrimitive,
  Popover,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  Z_INDEX,
  ICON_SIZE
} from "../ui_primitives";
import PaletteIcon from "@mui/icons-material/Palette";
import LegendToggleIcon from "@mui/icons-material/LegendToggle";

const minimapStyle = {
  position: "absolute" as const,
  bottom: "70px",
  right: "20px",
  zIndex: Z_INDEX.dropdown
};

const MiniMapNavigator: React.FC = () => {
  const { t } = useTranslation();
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

  const nodeStrokeColor = useCallback(
    (node: Node) => {
      if (node.selected) {
        return theme.vars.palette.primary.main;
      }
      // Mid-tone stroke in dark mode, light stroke in light mode (the light
      // palette's grey scale is inverted, so 600 is the lighter shade there).
      return isDarkMode
        ? theme.vars.palette.grey[500]
        : theme.vars.palette.grey[600];
    },
    [theme.vars.palette.primary.main, theme.vars.palette.grey, isDarkMode]
  );

  const legendItems = useMemo(
    () => [
      {
        category: NodeTypeCategory.Input,
        label: t("i18n-next66.node.miniMapNavigator.inputNodes"),
        color: getNodeCategoryColor(NodeTypeCategory.Input, isDarkMode)
      },
      {
        category: NodeTypeCategory.Constant,
        label: t("i18n-next66.node.miniMapNavigator.constantNodes"),
        color: getNodeCategoryColor(NodeTypeCategory.Constant, isDarkMode)
      },
      {
        category: NodeTypeCategory.Processing,
        label: t("i18n-next66.node.miniMapNavigator.processingNodes"),
        color: getNodeCategoryColor(NodeTypeCategory.Processing, isDarkMode)
      },
      {
        category: NodeTypeCategory.Group,
        label: t("i18n-next66.node.miniMapNavigator.groupNodes"),
        color: getNodeCategoryColor(NodeTypeCategory.Group, isDarkMode)
      },
      {
        category: NodeTypeCategory.Comment,
        label: t("i18n-next66.node.miniMapNavigator.commentNodes"),
        color: getNodeCategoryColor(NodeTypeCategory.Comment, isDarkMode)
      },
      {
        category: NodeTypeCategory.Output,
        label: t("i18n-next66.node.miniMapNavigator.outputNodes"),
        color: getNodeCategoryColor(NodeTypeCategory.Output, isDarkMode)
      }
    ],
    [isDarkMode, t]
  );

  if (!visible) {
    return null;
  }

  return (
    <>
      <div className="minimap-navigator" css={minimapStyle}>
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
            nodeStrokeColor={nodeStrokeColor}
            nodeBorderRadius={8}
            zoomable
            pannable
            style={{
              backgroundColor: isDarkMode
                ? theme.vars.palette.grey[900]
                : theme.vars.palette.grey[100],
              border: `1px solid ${borderColor}`,
              borderRadius: BORDER_RADIUS.lg
            }}
          />

          <FlexRow
            gap={0.5}
            sx={{
              position: "absolute",
              top: "-28px",
              right: 0
            }}
          >
            {colorMode === "type" && showLegend && (
              <ToolbarIconButton
                title={t("i18n-next66.node.miniMapNavigator.nodeTypeLegend")}
                size="small"
                onClick={handleOpenLegend}
                sx={{
                  padding: getSpacingPx(SPACING.micro),
                  backgroundColor: theme.vars.palette.background.paper,
                  border: `1px solid ${borderColor}`,
                  borderRadius: BORDER_RADIUS.sm,
                  "&:hover": {
                    backgroundColor: theme.vars.palette.action.hover
                  }
                }}
              >
                <LegendToggleIcon sx={{ fontSize: ICON_SIZE.sm }} />
              </ToolbarIconButton>
            )}
            <ToolbarIconButton
              title={t("i18n-next66.node.miniMapNavigator.colorModeSettings")}
              size="small"
              onClick={handleOpenSettings}
              sx={{
                padding: getSpacingPx(SPACING.micro),
                backgroundColor: theme.vars.palette.background.paper,
                border: `1px solid ${borderColor}`,
                borderRadius: BORDER_RADIUS.sm,
                "&:hover": {
                  backgroundColor: theme.vars.palette.action.hover
                }
              }}
            >
              <PaletteIcon sx={{ fontSize: ICON_SIZE.sm }} />
            </ToolbarIconButton>
          </FlexRow>
        </div>
      </div>

      <ContextMenu
        open={Boolean(settingsAnchor)}
        anchorEl={settingsAnchor}
        onClose={handleCloseSettings}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItemPrimitive
          label={t("i18n-next66.node.miniMapNavigator.defaultColors")}
          selected={colorMode === "default"}
          onClick={handleSetDefaultMode}
        />
        <MenuItemPrimitive
          label={t("i18n-next66.node.miniMapNavigator.colorByType")}
          selected={colorMode === "type"}
          onClick={handleSetTypeMode}
        />
      </ContextMenu>

      <Popover
        open={Boolean(legendAnchor)}
        anchorEl={legendAnchor}
        onClose={handleCloseLegend}
        placement="bottom-right"
        paperSx={{ minWidth: 180 }}
      >
        <FlexColumn gap={SPACING.xs} sx={{ padding: getSpacingPx(SPACING.md) }}>
          <Caption component="div" color="secondary" sx={{ ...EYEBROW }}>
            {t("i18n-next66.node.miniMapNavigator.nodeTypes")}
          </Caption>
          {legendItems.map((item) => (
            <FlexRow key={item.category} align="center" gap={SPACING.md}>
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  backgroundColor: item.color,
                  borderRadius: BORDER_RADIUS.xs,
                  flexShrink: 0
                }}
              />
              <Text size="small">{item.label}</Text>
            </FlexRow>
          ))}
        </FlexColumn>
      </Popover>
    </>
  );
};

export default memo(MiniMapNavigator);
