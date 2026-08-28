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

const styles = (theme: Theme) =>
  css({
    WebkitAppRegion: "no-drag",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    gap: getSpacingPx(SPACING.micro),
    padding: `0 ${getSpacingPx(SPACING.xs)}`,
    borderRight: `1px solid ${theme.vars.palette.divider}`,

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

/**
 * The left-panel toggle as the leading cell of the mobile top row. On desktop
 * it lives in the vertical rail, which mobile doesn't render — the top row
 * carries it instead so it shares the app chrome rather than floating over the
 * content.
 *
 * The sheet it opens is mobile's single navigation surface: document
 * categories plus the app pages the desktop logo menu holds, so there is no
 * second menu button beside it.
 */
const MobileRailLauncher: React.FC = () => {
  const theme = useTheme();
  const isVisible = usePanelStore((state) => state.panel.isVisible);
  const setVisibility = usePanelStore((state) => state.setVisibility);

  const toggle = useCallback(
    () => setVisibility(!isVisible),
    [setVisibility, isVisible]
  );

  return (
    <div css={styles(theme)} className="mobile-rail-launcher">
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
