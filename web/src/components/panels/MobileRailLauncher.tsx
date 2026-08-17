/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback } from "react";
import MenuIcon from "@mui/icons-material/Menu";

import { usePanelStore } from "../../stores/PanelStore";
import {
  ToolbarIconButton,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import RailAppMenu from "./RailAppMenu";

const styles = (theme: Theme) =>
  css({
    WebkitAppRegion: "no-drag",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    gap: getSpacingPx(SPACING.micro),
    padding: `0 ${getSpacingPx(SPACING.xs)}`,
    borderRight: `1px solid ${theme.vars.palette.divider}`,

    "& .rail-app-logo": {
      width: "40px",
      height: "40px",
      margin: 0,
      opacity: 1
    },
    "& .panel-left-mobile-launcher": {
      width: "40px",
      height: "40px",
      padding: 0,
      borderRadius: BORDER_RADIUS.lg,
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&.active": {
        backgroundColor: theme.vars.palette.action.selected,
        color: theme.vars.palette.text.primary
      },
      "& svg": {
        fontSize: "var(--fontSizeBig)"
      }
    }
  });

interface MobileRailLauncherProps {
  /** Renders the logo/app menu alongside the panel toggle. */
  showAppMenu?: boolean;
}

/**
 * The app menu (logo) and left-panel toggle as the leading cell of the mobile
 * top row. On desktop these live in the vertical rail, which mobile doesn't
 * render — the top row carries them instead so they share the app chrome rather
 * than floating over the content.
 */
const MobileRailLauncher: React.FC<MobileRailLauncherProps> = ({
  showAppMenu = false
}) => {
  const theme = useTheme();
  const isVisible = usePanelStore((state) => state.panel.isVisible);
  const setVisibility = usePanelStore((state) => state.setVisibility);

  const close = useCallback(() => setVisibility(false), [setVisibility]);
  const toggle = useCallback(
    () => setVisibility(!isVisible),
    [setVisibility, isVisible]
  );

  return (
    <div css={styles(theme)} className="mobile-rail-launcher">
      {showAppMenu && <RailAppMenu onAction={close} />}
      <ToolbarIconButton
        className={`panel-left-mobile-launcher ${isVisible ? "active" : ""}`}
        onClick={toggle}
        ariaLabel={isVisible ? "Close panel" : "Open left panel"}
        aria-expanded={isVisible}
        tabIndex={-1}
        icon={<MenuIcon />}
      />
    </div>
  );
};

MobileRailLauncher.displayName = "MobileRailLauncher";

export default MobileRailLauncher;
