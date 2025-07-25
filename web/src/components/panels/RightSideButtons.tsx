/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import React, { memo, useState } from "react";
import { Box, Button, Popover, Tooltip, Typography } from "@mui/material";
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
      color: theme.vars.palette.action.active,
      padding: "0 .5em"
    }
  });

const RightSideButtons: React.FC = () => {
  const { helpOpen, handleCloseHelp, handleOpenHelp } = useAppHeaderStore();

  const [modelsOpen, setModelsOpen] = useState(false);

  return (
    <Box className="buttons-right" css={styles}>
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
                  width: "24px"
                }}
              />
            </Button>
          </Tooltip>
        </>
      )}
      <NotificationButton />
      <Popover
        open={helpOpen}
        onClose={handleCloseHelp}
        anchorReference="none"
        style={{
          position: "fixed",
          width: "100%",
          height: "100%",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)"
        }}
      >
        <Help handleClose={handleCloseHelp} />
      </Popover>
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
