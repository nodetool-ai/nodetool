/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo } from "react";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import Help from "../content/Help/Help";
import SettingsMenu from "../menus/SettingsMenu";
import SystemStatsDisplay from "./SystemStats";
import OverallDownloadProgress from "../hugging_face/OverallDownloadProgress";
import NotificationButton from "./NotificationButton";
import BookmarkButton from "./BookmarkButton";
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

  return (
    <Box className="buttons-right" css={styles(theme)}>
      {!isProduction && (
        <>
          <SystemStatsDisplay />
          <OverallDownloadProgress />
        </>
      )}
      <BookmarkButton />
      <NotificationButton />
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
