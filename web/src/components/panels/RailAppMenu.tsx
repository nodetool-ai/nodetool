/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useCombo } from "../../stores/KeyPressedStore";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import { openSettingsTab } from "../workspace/openPageTab";
import Help from "../content/Help/Help";
import Logo from "../Logo";
import { useAppMenuActions } from "./useAppMenuActions";
import {
  Popover,
  MenuItemPrimitive,
  Tooltip,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";

const logoButtonStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "44px",
    height: "36px",
    margin: `0 auto`,
    padding: 0,
    border: "none",
    borderRadius: BORDER_RADIUS.lg,
    background: "transparent",
    cursor: "pointer",
    opacity: 0.9,
    transition: `background-color ${MOTION.fast}, opacity ${MOTION.fast}`,
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      opacity: 1
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: "-2px"
    }
  });

const menuStyles = () =>
  css({
    minWidth: "208px",
    padding: `${getSpacingPx(SPACING.xs)} 0`
  });

interface RailAppMenuProps {
  /**
   * Called after an item opens something (a page tab, Help, Downloads). The
   * mobile panel sheet uses it to dismiss itself so the destination isn't
   * hidden behind it.
   */
  onAction?: () => void;
}

/**
 * The app menu docked at the top of the workspace rail. The logo opens a menu
 * carrying the global actions that used to live in the old header's right cluster:
 * Settings, Help, and Downloads (with live progress when active).
 *
 * Desktop only — on mobile the same destinations are the More section of the
 * browse sheet (AppPagesList), so the top row carries one menu, not two.
 */
const RailAppMenu: React.FC<RailAppMenuProps> = ({ onAction }) => {
  const theme = useTheme();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const { helpOpen, handleCloseHelp, handleOpenHelp, setHelpIndex } =
    useAppHeaderStore(
      useShallow((state) => ({
        helpOpen: state.helpOpen,
        handleCloseHelp: state.handleCloseHelp,
        handleOpenHelp: state.handleOpenHelp,
        setHelpIndex: state.setHelpIndex
      }))
    );

  const handleShowKeyboardShortcuts = useCallback(() => {
    setHelpIndex(1);
    handleOpenHelp();
  }, [setHelpIndex, handleOpenHelp]);

  // Cmd+/ (Mac) or Ctrl+/ (Win/Linux) opens Help at Keyboard Shortcuts tab
  useCombo(["Meta", "/"], handleShowKeyboardShortcuts);
  useCombo(["Control", "/"], handleShowKeyboardShortcuts);

  // Cmd+, (Mac) or Ctrl+, (Win/Linux) opens Settings as a workspace tab. The
  // rail is mounted for every surface, so the shortcut works on any tab — not
  // only while the node editor has focus.
  const handleOpenSettingsShortcut = useCallback(() => {
    openSettingsTab();
  }, []);
  useCombo(["Meta", ","], handleOpenSettingsShortcut);
  useCombo(["Control", ","], handleOpenSettingsShortcut);

  const close = useCallback(() => setOpen(false), []);
  // Closing after an item was picked, as opposed to dismissing the popover.
  const finish = useCallback(() => {
    setOpen(false);
    onAction?.();
  }, [onAction]);

  const actions = useAppMenuActions(finish);

  return (
    <>
      <Tooltip title="Menu" placement="right-start">
        <button
          ref={anchorRef}
          type="button"
          css={logoButtonStyles(theme)}
          className="rail-app-logo"
          aria-label="Open app menu"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Logo
            small
            width="22px"
            height="22px"
            fontSize="1em"
            borderRadius={BORDER_RADIUS.sm}
          />
        </button>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={close}
        placement="bottom-left"
      >
        <div css={menuStyles()} role="menu">
          {actions.map((action) => (
            <MenuItemPrimitive
              key={action.key}
              label={action.label}
              icon={action.icon}
              onClick={action.onClick}
              secondary={action.secondary}
              dividerAfter={action.dividerAfter}
            />
          ))}
        </div>
      </Popover>

      <Help open={helpOpen} handleClose={handleCloseHelp} />
    </>
  );
};

RailAppMenu.displayName = "RailAppMenu";

export default RailAppMenu;
