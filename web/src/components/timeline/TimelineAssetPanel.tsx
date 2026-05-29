/** @jsxImportSource @emotion/react */
/**
 * TimelineAssetPanel
 *
 * Side panel that hosts the AssetGrid inside the timeline editor so users can
 * drag images, video, audio, or overlay assets onto track lanes. Wraps the grid
 * in `ContextMenuProvider` + `ContextMenus` so right-click menus on assets
 * continue to work, matching the setup used by `PanelLeft`.
 *
 * Toggleable: when collapsed via `TimelineUIStore.toggleAssetPanel`, the
 * editor swaps in `TimelineAssetPanelRail` — a 28px-wide vertical strip with
 * an expand chevron — so the panel is always re-openable without a menu trip.
 */

import React, { memo, useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";

import AssetGrid from "../assets/AssetGrid";
import ContextMenus from "../context_menus/ContextMenus";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { FlexColumn } from "../ui_primitives/FlexColumn";
import { Text } from "../ui_primitives/Text";
import { Tooltip } from "../ui_primitives/Tooltip";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";

const ASSET_PANEL_RAIL_WIDTH_PX = 28;

const panelStyles = (theme: Theme) =>
  css({
    height: "100%",
    width: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.paper,
    borderRight: `1px solid ${theme.vars.palette.divider}`
  });

const headerStyles = (theme: Theme) =>
  css({
    height: 32,
    flexShrink: 0,
    padding: "0 6px 0 12px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderBottom: `1px solid ${theme.vars.palette.divider}`
  });

const headerLabelStyles = css({
  flex: "1 1 auto",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 8
});

const iconButtonStyles = (theme: Theme) =>
  css({
    width: 24,
    height: 22,
    background: "transparent",
    border: "1px solid transparent",
    padding: 0,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: theme.vars.palette.text.secondary,
    borderRadius: 5,
    transition: "background-color 120ms, color 120ms, border-color 120ms",
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.divider
    },
    "&:focus-visible": {
      outline: "none",
      borderColor: theme.vars.palette.primary.main
    },
    "& svg": {
      fontSize: 16
    }
  });

const railStyles = (theme: Theme) =>
  css({
    width: ASSET_PANEL_RAIL_WIDTH_PX,
    height: "100%",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: 6,
    gap: 6,
    backgroundColor: theme.vars.palette.background.paper,
    borderRight: `1px solid ${theme.vars.palette.divider}`
  });

const gridContainerStyles = css({
  flex: "1 1 auto",
  minHeight: 0,
  overflow: "hidden",
  position: "relative"
});

export const TimelineAssetPanel: React.FC = memo(() => {
  const theme = useTheme();
  const toggleAssetPanel = useTimelineUIStore((s) => s.toggleAssetPanel);

  const handleCollapse = useCallback(() => {
    toggleAssetPanel();
  }, [toggleAssetPanel]);

  return (
    <FlexColumn css={panelStyles(theme)}>
      <div css={headerStyles(theme)}>
        <div css={headerLabelStyles}>
          <FolderOutlinedIcon
            sx={{ fontSize: 14, color: "text.secondary" }}
            aria-hidden
          />
          <Text size="small" weight={600}>
            Assets
          </Text>
        </div>
        <Tooltip title="Collapse asset panel">
          <button
            type="button"
            css={iconButtonStyles(theme)}
            onClick={handleCollapse}
            aria-label="Collapse asset panel"
          >
            <ChevronLeftIcon />
          </button>
        </Tooltip>
      </div>
      <div css={gridContainerStyles}>
        <ContextMenuProvider>
          <ContextMenus />
          <AssetGrid maxItemSize={5} />
        </ContextMenuProvider>
      </div>
    </FlexColumn>
  );
});

TimelineAssetPanel.displayName = "TimelineAssetPanel";

export const TimelineAssetPanelRail: React.FC = memo(() => {
  const theme = useTheme();
  const toggleAssetPanel = useTimelineUIStore((s) => s.toggleAssetPanel);

  return (
    <div css={railStyles(theme)} data-testid="asset-panel-rail">
      <Tooltip title="Show asset panel" placement="right">
        <button
          type="button"
          css={iconButtonStyles(theme)}
          onClick={toggleAssetPanel}
          aria-label="Show asset panel"
        >
          <ChevronRightIcon />
        </button>
      </Tooltip>
      <Tooltip title="Show asset panel" placement="right">
        <button
          type="button"
          css={iconButtonStyles(theme)}
          onClick={toggleAssetPanel}
          aria-label="Show assets"
        >
          <FolderOutlinedIcon />
        </button>
      </Tooltip>
    </div>
  );
});

TimelineAssetPanelRail.displayName = "TimelineAssetPanelRail";

export default TimelineAssetPanel;
