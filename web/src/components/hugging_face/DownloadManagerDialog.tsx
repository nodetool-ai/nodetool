/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import {
  Box,
  DialogTitle,
  DialogContent,
  DialogActions
} from "@mui/material";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import { Dialog, CloseButton, Text, FlexColumn, Divider, EditorButton } from "../ui_primitives";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "./DownloadProgress";
import { useTheme } from "@mui/material/styles";
import { type Theme } from "@mui/material/styles";

import isEqual from "fast-deep-equal";
import { FolderOutlined } from "@mui/icons-material";
import DownloadingIcon from "@mui/icons-material/Downloading";
import {
  isFileExplorerAvailable,
  openHuggingfacePath,
  openOllamaPath
} from "../../utils/fileExplorer";
import { isLocalhost, isProduction } from "../../stores/ApiClient";
import { isElectron } from "../../utils/browser";

const styles = (theme: Theme) =>
  css({
    ".download-actions": {
      padding: "8px 24px 16px",
      justifyContent: "space-between",
      alignItems: "center",
      color: "inherit",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`
    },
    ".title-close": {
      position: "absolute",
      right: theme.spacing(1),
      top: theme.spacing(1)
    },
    ".downloads-list": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2)
    },
    ".folders-row": {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(1.5)
    }
  });

const DownloadManagerDialog: React.FC = () => {
  const isDialogOpen = useModelDownloadStore((state) => state.isDialogOpen);
  const closeDialog = useModelDownloadStore((state) => state.closeDialog);
  const downloads = useModelDownloadStore((state) => state.downloads);

  // Memoize download names to avoid recomputing Object.keys on every render
  const downloadNames = useMemo(() => Object.keys(downloads), [downloads]);
  const hasActiveDownloads = downloadNames.length > 0;

  const theme = useTheme();

  const infoMessage = hasActiveDownloads ? (
    "Downloads continue in the background. Access them anytime from the toolbar download icon."
  ) : (
    <FlexColumn gap={1}>
      <span>
        Download models using the <strong>Recommended Models</strong> button
        inside nodes.
      </span>
      <span>
        The <strong>Model Manager</strong> in the top right panel shows all
        available models.
      </span>
    </FlexColumn>
  );

  return (
    <Dialog
      css={styles(theme)}
      className="download-dialog"
      open={isDialogOpen}
      onClose={closeDialog}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle sx={{ color: "inherit", position: "relative" }}>
        {hasActiveDownloads ? "Download Progress" : "Model Downloads"}
        <CloseButton
          onClick={closeDialog}
          className="title-close"
          nodrag={false}
        />
      </DialogTitle>
      <DialogContent className="download-dialog-content">
        <Box mt={1} className="downloads-list">
          {hasActiveDownloads ? (
            downloadNames.map((name) => (
              <DownloadProgress key={name} name={name} />
            ))
          ) : (
            <FlexColumn
              gap={1.5}
              align="center"
              sx={{
                padding: "2.5em 0"
              }}
            >
              <DownloadingIcon sx={{ opacity: 0.8 }} />
              <Text size="normal" weight={600}>No active downloads</Text>
              <Text
                size="small"
                sx={{ opacity: 0.8, textAlign: "center" }}
              >
                Start a model download from the Recommended Models dialog or
                Model Manager.
              </Text>
            </FlexColumn>
          )}
        </Box>
        {isLocalhost &&
          isFileExplorerAvailable() &&
          !isProduction &&
          isElectron && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box className="folders-row">
                <EditorButton
                  variant="outlined"
                  startIcon={<FolderOutlined />}
                  onClick={openHuggingfacePath}
                >
                  Open HuggingFace folder
                </EditorButton>
                <EditorButton
                  variant="outlined"
                  startIcon={<FolderOutlined />}
                  onClick={openOllamaPath}
                >
                  Open Ollama folder
                </EditorButton>
              </Box>
            </>
          )}
      </DialogContent>
      <DialogActions className="download-actions">
        <Text
          component="div"
          sx={{
            padding: "0 1.5em .5em 1em",
            fontWeight: "200",
            color: "inherit",
            display: "flex",
            alignItems: "center",
            gap: "0.5em"
          }}
        >
          <AnnouncementIcon
            fontSize="small"
            sx={{ color: theme.vars.palette.warning.main }}
          />
          {infoMessage}
        </Text>
        <EditorButton onClick={closeDialog} variant="contained">
          Close
        </EditorButton>
      </DialogActions>
    </Dialog>
  );
};

export default memo(DownloadManagerDialog, isEqual);
