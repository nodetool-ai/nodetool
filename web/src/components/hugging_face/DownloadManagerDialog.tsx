/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import {
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Divider
} from "@mui/material";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import { Dialog } from "../ui_primitives";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "./DownloadProgress";
import { useTheme } from "@mui/material/styles";
import { type Theme } from "@mui/material/styles";

import isEqual from "lodash/isEqual";
import { FolderOutlined } from "@mui/icons-material";
import CloseIcon from "@mui/icons-material/Close";
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

  const hasActiveDownloads = Object.keys(downloads).length > 0;

  const theme = useTheme();

  const infoMessage = hasActiveDownloads ? (
    "Downloads continue in the background. Access them anytime from the toolbar download icon."
  ) : (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span>
        Download models using the <strong>Recommended Models</strong> button
        inside nodes.
      </span>
      <span>
        The <strong>Model Manager</strong> in the top right panel shows all
        available models.
      </span>
    </Box>
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
        <Tooltip title="Close">
          <IconButton
            size="small"
            onClick={closeDialog}
            className="title-close"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent className="download-dialog-content">
        <Box mt={1} className="downloads-list">
          {Object.keys(downloads).length > 0 ? (
            Object.keys(downloads).map((name) => (
              <DownloadProgress key={name} name={name} />
            ))
          ) : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1.5,
                padding: "2.5em 0"
              }}
            >
              <DownloadingIcon sx={{ opacity: 0.8 }} />
              <Typography variant="h6">No active downloads</Typography>
              <Typography
                variant="body2"
                sx={{ opacity: 0.8, textAlign: "center" }}
              >
                Start a model download from the Recommended Models dialog or
                Model Manager.
              </Typography>
            </Box>
          )}
        </Box>
        {isLocalhost &&
          isFileExplorerAvailable() &&
          !isProduction &&
          isElectron && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box className="folders-row">
                <Button
                  variant="outlined"
                  startIcon={<FolderOutlined />}
                  onClick={openHuggingfacePath}
                >
                  Open HuggingFace folder
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<FolderOutlined />}
                  onClick={openOllamaPath}
                >
                  Open Ollama folder
                </Button>
              </Box>
            </>
          )}
      </DialogContent>
      <DialogActions className="download-actions">
        <Typography
          component="div"
          variant="body1"
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
        </Typography>
        <Button onClick={closeDialog} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default memo(DownloadManagerDialog, isEqual);
