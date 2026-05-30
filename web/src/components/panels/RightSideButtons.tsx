/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback } from "react";
import { useCombo } from "../../stores/KeyPressedStore";
import { useMediaQuery } from "@mui/material";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import { useShallow } from "zustand/react/shallow";
import Help from "../content/Help/Help";
import SettingsButton from "../menus/SettingsButton";
import OverallDownloadProgress from "../hugging_face/OverallDownloadProgress";
import NotificationButton from "./NotificationButton";
import { isProduction } from "../../lib/env";
import { ThemeToggleButton } from "../ui_primitives/ThemeToggleButton";
import { HelpButton, Box } from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      alignItems: "center",
      gap: "2px"
    },
    // Unified styling for every button inside the right cluster, regardless
    // of which primitive it comes from (EditorButton, IconButton, ToolbarIconButton).
    "& .MuiIconButton-root, & .MuiButtonBase-root": {
      minWidth: "28px",
      width: "28px",
      height: "28px",
      padding: 0,
      margin: 0,
      color: theme.vars.palette.text.secondary,
      backgroundColor: "transparent",
      border: "1px solid transparent",
      borderRadius: "var(--rounded-md)",
      transition:
        "color 150ms ease-out, background-color 150ms ease-out, transform 0ms",
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover,
        borderColor: "transparent",
        transform: "none"
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: "1px"
      }
    },
    // Override AppHeader's stray icon margin so icon-only buttons are
    // visually centered, not nudged left.
    "& svg, & .MuiSvgIcon-root": {
      width: "16px",
      height: "16px",
      fontSize: "16px",
      margin: 0
    }
  });

const RightSideButtons: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { helpOpen, handleCloseHelp, handleOpenHelp, setHelpIndex } =
    useAppHeaderStore(
      useShallow((state) => ({
        helpOpen: state.helpOpen,
        handleCloseHelp: state.handleCloseHelp,
        handleOpenHelp: state.handleOpenHelp,
        setHelpIndex: state.setHelpIndex
      }))
    );

  const handleHelpClick = useCallback(() => {
    handleOpenHelp();
  }, [handleOpenHelp]);

  const handleShowKeyboardShortcuts = useCallback(() => {
    setHelpIndex(1);
    handleOpenHelp();
  }, [setHelpIndex, handleOpenHelp]);

  // Cmd+/ (Mac) or Ctrl+/ (Win/Linux) opens Help at Keyboard Shortcuts tab
  useCombo(["Meta", "/"], handleShowKeyboardShortcuts);
  useCombo(["Control", "/"], handleShowKeyboardShortcuts);

  return (
    <Box className="buttons-right" css={styles(theme)}>
      {!isProduction && !isMobile && <OverallDownloadProgress />}
      <NotificationButton />
      <Help open={helpOpen} handleClose={handleCloseHelp} />
      <HelpButton
        onClick={handleHelpClick}
        iconVariant="question"
        tooltip="Help"
        className="command-icon"
      />
      <SettingsButton />
    </Box>
  );
};

RightSideButtons.displayName = "RightSideButtons";

export default memo(RightSideButtons);
