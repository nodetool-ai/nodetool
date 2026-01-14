/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useState, useCallback } from "react";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import Help from "../content/Help/Help";
import SettingsMenu from "../menus/SettingsMenu";
import SystemStatsDisplay from "./SystemStats";
import OverallDownloadProgress from "../hugging_face/OverallDownloadProgress";
import NotificationButton from "./NotificationButton";
import KeyboardShortcutsDialog from "../dialogs/KeyboardShortcutsDialog";
import { isProduction } from "../../stores/ApiClient";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

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
  const { helpOpen, handleCloseHelp, handleOpenHelp } = useAppHeaderStore();
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  const handleOpenShortcutsDialog = useCallback(() => {
    setShortcutsDialogOpen(true);
  }, []);

  const handleCloseShortcutsDialog = useCallback(() => {
    setShortcutsDialogOpen(false);
  }, []);

  return (
    <Box className="buttons-right" css={styles(theme)}>
      {!isProduction && (
        <>
          <SystemStatsDisplay />
          <OverallDownloadProgress />
        </>
      )}
      <NotificationButton />
      <KeyboardShortcutsDialog
        open={shortcutsDialogOpen}
        onClose={handleCloseShortcutsDialog}
      />
      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title={
          <div style={{ textAlign: "center" }}>
            <Typography variant="inherit">Keyboard Shortcuts</Typography>
          </div>
        }
      >
        <Button
          className="command-icon"
          onClick={(e) => {
            e.preventDefault();
            handleOpenShortcutsDialog();
          }}
          tabIndex={-1}
          aria-label="Keyboard Shortcuts"
        >
          <KeyboardIcon />
        </Button>
      </Tooltip>
      <Help open={helpOpen} handleClose={handleCloseHelp} />
      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title={
          <div style={{ textAlign: "center" }}>
            <Typography variant="inherit">Help</Typography>
          </div>
        }
      >
        <Button
          className="command-icon"
          onClick={(e) => {
            e.preventDefault();
            handleOpenHelp();
          }}
          tabIndex={-1}
        >
          <QuestionMarkIcon />
        </Button>
      </Tooltip>
      <SettingsMenu />
    </Box>
  );
};

export default memo(RightSideButtons);
