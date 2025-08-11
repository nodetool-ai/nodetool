/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import AssetGrid from "./AssetGrid";
import { Box, Tooltip, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useAssets from "../../serverState/useAssets";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import BackToEditorButton from "../panels/BackToEditorButton";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      display: "flex",
      width: "100%",
      height: "100%",
      top: "0",
      left: "0",
      padding: "0"
    },
    ".asset-explorer": {
      width: "100%"
    },
    ".asset-menu": {
      marginLeft: "1em",
      marginBottom: "1em"
    },
    "& .dv-split-view-container .dv-view-container .dv-view": {
      padding: "0.5em 1em !important"
    },
    ".audio-controls-container": {
      padding: "2em"
    },
    ".current-folder": {
      position: "absolute",
      top: "3.5em",
      right: "2em",
      textAlign: "right",
      margin: "0",
      padding: "0"
    },
    ".selected-asset-info": {
      position: "absolute",
      top: "5em",
      right: "2em",
      maxWidth: "500px",
      textAlign: "right"
    },
    ".asset-size-slider": {
      width: "200px",
      maxWidth: "200px",
      paddingLeft: ".5em"
    },
    ".dropzone": {
      outline: "none",
      maxHeight: "calc(-100px + 100vh) !important"
    },
    ".infinite-scroll-component": {
      border: 0
    },
    ".asset-explorer .file-upload-button": {
      position: "absolute",
      top: "-40px",
      right: "1em",
      marginRight: "auto",
      height: "fit-content ",
      width: "fit-content"
    },
    ".asset-actions": {
      marginTop: ".2em",
      marginLeft: "1em"
    },
    ".back-to-editor": {
      top: "0.5em",
      left: "1em !important"
    },
    ".close-button": {
      position: "absolute",
      top: ".75em",
      right: "0.5em",
      zIndex: 20
    }
  });

const AssetExplorer: React.FC = () => {
  const theme = useTheme();
  const { folderFiles } = useAssets();
  const navigate = useNavigate();
  const { currentWorkflowId } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId
  }));
  return (
    <Box css={styles(theme)}>
      <Box className="asset-explorer">
        <Tooltip title="Close" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton
            className="close-button"
            size="small"
            aria-label="Close"
            onClick={() => navigate(`/editor/${currentWorkflowId || ""}`)}
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
        <ContextMenuProvider>
          {currentWorkflowId && <BackToEditorButton />}
          <AssetGrid
            maxItemSize={10}
            itemSpacing={2}
            isHorizontal={true}
            isFullscreenAssets={true}
            initialFoldersPanelWidth={200}
            sortedAssets={folderFiles}
          />
        </ContextMenuProvider>
      </Box>
    </Box>
  );
};

export default AssetExplorer;
