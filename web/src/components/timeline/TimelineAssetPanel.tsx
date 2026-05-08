/** @jsxImportSource @emotion/react */
/**
 * TimelineAssetPanel
 *
 * Side panel that hosts the AssetGrid inside the timeline editor so users can
 * drag images, video, audio, or overlay assets onto track lanes. Wraps the grid
 * in `ContextMenuProvider` + `ContextMenus` so right-click menus on assets
 * continue to work, matching the setup used by `PanelLeft`.
 */

import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import AssetGrid from "../assets/AssetGrid";
import ContextMenus from "../context_menus/ContextMenus";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { FlexColumn, Text } from "../ui_primitives";

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
    padding: `0 ${theme.spacing(1)}`,
    display: "flex",
    alignItems: "center",
    borderBottom: `1px solid ${theme.vars.palette.divider}`
  });

const gridContainerStyles = css({
  flex: "1 1 auto",
  minHeight: 0,
  overflow: "hidden",
  position: "relative"
});

export const TimelineAssetPanel: React.FC = memo(() => {
  const theme = useTheme();

  return (
    <FlexColumn css={panelStyles(theme)}>
      <div css={headerStyles(theme)}>
        <Text size="small" weight={600}>
          Assets
        </Text>
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

export default TimelineAssetPanel;
