/** @jsxImportSource @emotion/react */
/**
 * BottomStatusBar — Timeline Editor bottom status bar.
 *
 * Contains: local/cloud indicator, generating count, failed count, cost
 * estimate, and a zoom slider.
 */

import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import {
  FlexRow,
  Caption,
  ZoomControls,
  StatusIndicator
} from "../ui_primitives";
import type { StatusType } from "../ui_primitives";
import CloudIcon from "@mui/icons-material/Cloud";
import ComputerIcon from "@mui/icons-material/Computer";

const styles = (theme: Theme) =>
  css({
    height: 32,
    borderTop: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.paper,
    padding: `0 ${theme.spacing(1.5)}`,
    flexShrink: 0,
    ".count-badge": {
      display: "inline-flex",
      alignItems: "center",
      gap: theme.spacing(0.5)
    },
    ".dot": {
      width: 6,
      height: 6,
      borderRadius: "50%"
    },
    ".dot-generating": {
      backgroundColor: theme.vars.palette.primary.main
    },
    ".dot-failed": {
      backgroundColor: theme.vars.palette.error.main
    }
  });

export interface BottomStatusBarProps {
  /** Whether the session is local or cloud */
  mode?: "local" | "cloud";
  /** Number of clips currently generating */
  generatingCount?: number;
  /** Number of failed generations */
  failedCount?: number;
  /** Estimated cost in USD */
  costEstimate?: number;
  /** Current zoom level (1 = 100%) */
  zoom?: number;
  /** Callback when zoom changes */
  onZoomChange?: (zoom: number) => void;
}

const noop = () => {};

export const BottomStatusBar: React.FC<BottomStatusBarProps> = memo(
  ({
    mode = "local",
    generatingCount = 0,
    failedCount = 0,
    costEstimate,
    zoom = 1,
    onZoomChange
  }) => {
    const theme = useTheme();

    const modeStatus: StatusType = mode === "cloud" ? "success" : "info";
    const modeLabel = mode === "cloud" ? "Cloud" : "Local";
    const ModeIcon = mode === "cloud" ? CloudIcon : ComputerIcon;

    return (
      <FlexRow
        align="center"
        justify="space-between"
        fullWidth
        css={styles(theme)}
      >
        {/* Left: local/cloud + counts */}
        <FlexRow gap={2} align="center">
          <FlexRow gap={0.75} align="center">
            <ModeIcon
              sx={{ fontSize: 14, color: theme.vars.palette.text.secondary }}
              aria-hidden={true}
            />
            <StatusIndicator status={modeStatus} label={modeLabel} size="small" />
          </FlexRow>

          {generatingCount > 0 && (
            <FlexRow gap={0.5} align="center" className="count-badge">
              <span className="dot dot-generating" aria-hidden />
              <Caption>{generatingCount} generating</Caption>
            </FlexRow>
          )}

          {failedCount > 0 && (
            <FlexRow gap={0.5} align="center" className="count-badge">
              <span className="dot dot-failed" aria-hidden />
              <Caption color="error">{failedCount} failed</Caption>
            </FlexRow>
          )}
        </FlexRow>

        {/* Right: cost estimate + zoom */}
        <FlexRow gap={2} align="center">
          {costEstimate !== undefined && (
            <Caption color="secondary">
              ~${costEstimate.toFixed(4)}
            </Caption>
          )}

          <ZoomControls
            zoom={zoom}
            onZoomChange={onZoomChange ?? noop}
            minZoom={0.1}
            maxZoom={5}
            step={0.25}
            showReset
            tooltipPlacement="top"
          />
        </FlexRow>
      </FlexRow>
    );
  }
);

BottomStatusBar.displayName = "BottomStatusBar";

export default BottomStatusBar;
