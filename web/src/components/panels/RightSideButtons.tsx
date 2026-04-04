/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback } from "react";
import { useCombo } from "../../stores/KeyPressedStore";
import { Box } from "@mui/material";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import Help from "../content/Help/Help";
import SettingsMenu from "../menus/SettingsMenu";
import SystemStatsDisplay from "./SystemStats";
import OverallDownloadProgress from "../hugging_face/OverallDownloadProgress";
import NotificationButton from "./NotificationButton";
import { isProduction } from "../../stores/ApiClient";
import { ThemeToggleButton } from "../ui_primitives/ThemeToggleButton";
import { HelpButton } from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    ".command-icon": {
      color: theme.vars.palette.text.primary,
      padding: "0 4px",
      minWidth: "32px",
      height: "32px",
      borderRadius: "6px",
      transition: "all 0.2s ease-out",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.05)"
      },
      "& svg, & .MuiSvgIcon-root": {
        display: "block",
        width: "18px",
        height: "18px",
        fontSize: "18px"
      }
    }
  });

const RightSideButtons: React.FC = () => {
  const theme = useTheme();
  const helpOpen = useAppHeaderStore((state) => state.helpOpen);
  const handleCloseHelp = useAppHeaderStore((state) => state.handleCloseHelp);
  const handleOpenHelp = useAppHeaderStore((state) => state.handleOpenHelp);

  const setHelpIndex = useAppHeaderStore((state) => state.setHelpIndex);

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
      {!isProduction && (
        <>
          <SystemStatsDisplay />
          <OverallDownloadProgress />
        </>
      )}
      <ThemeToggleButton />
      <NotificationButton />
      <Help open={helpOpen} handleClose={handleCloseHelp} />
      <HelpButton
        onClick={handleHelpClick}
        iconVariant="question"
        tooltip="Help"
        className="command-icon"
      />
      <SettingsMenu />
    </Box>
  );
};

RightSideButtons.displayName = "RightSideButtons";

export default memo(RightSideButtons);
