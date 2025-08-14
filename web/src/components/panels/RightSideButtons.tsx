/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useState } from "react";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import Help from "../content/Help/Help";
import SettingsMenu from "../menus/SettingsMenu";
import SystemStatsDisplay from "./SystemStats";
import OverallDownloadProgress from "../hugging_face/OverallDownloadProgress";
import NotificationButton from "./NotificationButton";
import { isProduction } from "../../stores/ApiClient";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { IconForType } from "../../config/data_types";
import ModelsManager from "../hugging_face/ModelsManager";

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

  const [modelsOpen, setModelsOpen] = useState(false);

  return (
    <Box className="buttons-right" css={styles(theme)}>
      {!isProduction && (
        <>
          <ModelsManager
            open={modelsOpen}
            onClose={() => setModelsOpen(false)}
          />
          <SystemStatsDisplay />
          <OverallDownloadProgress />
          <Tooltip title="Model Manager" enterDelay={TOOLTIP_ENTER_DELAY}>
            <Button
              className="command-icon"
              onClick={() => setModelsOpen(true)}
              tabIndex={-1}
            >
              <IconForType
                iconName="model"
                showTooltip={false}
                bgStyle={{
                  backgroundColor: "transparent",
                  width: "18px",
                  height: "18px"
                }}
              />
            </Button>
          </Tooltip>
        </>
      )}
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
