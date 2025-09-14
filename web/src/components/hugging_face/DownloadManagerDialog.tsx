/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import {
  Dialog,
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
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "./DownloadProgress";
import { useTheme } from "@mui/material/styles";
import { type Theme } from "@mui/material/styles";

import { isEqual } from "lodash";
import { useModelBasePaths } from "../../hooks/useModelBasePaths";
import { FolderOutlined } from "@mui/icons-material";
import CloseIcon from "@mui/icons-material/Close";
import DownloadingIcon from "@mui/icons-material/Downloading";
import { openInExplorer } from "../../utils/fileExplorer";

const styles = (theme: Theme) =>
  css({
    ".MuiDialog-paper": {
      width: "92%",
      maxWidth: "920px",
      margin: "auto",
      borderRadius: (theme as any)?.rounded?.dialog ?? 6,
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      color: theme.vars.palette.text.primary,
      boxShadow: theme.shadows[8]
    },
    ".MuiDialogTitle-root": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeBig,
      fontWeight: 400,
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      paddingRight: theme.spacing(7)
    },
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
  const { isDialogOpen, closeDialog, downloads } = useModelDownloadStore();
  const { huggingfaceBasePath, ollamaBasePath } = useModelBasePaths();

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
      slotProps={{
        backdrop: {
          style: {
            backdropFilter: theme.vars.palette.glass.blur,
            backgroundColor: theme.vars.palette.glass.backgroundDialog
          }
        },
        paper: {
          style: {
            borderRadius: theme.vars.rounded.dialog,
            background: theme.vars.palette.glass.backgroundDialogContent
          }
        }
      }}
    >
      <DialogTitle sx={{ color: "inherit", position: "relative" }}>
        <DownloadingIcon sx={{ color: theme.vars.palette.primary.main }} />
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
        <Divider sx={{ my: 2 }} />
        <Box className="folders-row">
          <Button
            variant="outlined"
            startIcon={<FolderOutlined />}
            onClick={() =>
              huggingfaceBasePath && openInExplorer(huggingfaceBasePath)
            }
            disabled={!huggingfaceBasePath}
          >
            Open HuggingFace folder
          </Button>
          <Button
            variant="outlined"
            startIcon={<FolderOutlined />}
            onClick={() => ollamaBasePath && openInExplorer(ollamaBasePath)}
            disabled={!ollamaBasePath}
          >
            Open Ollama folder
          </Button>
        </Box>
      </DialogContent>
      <DialogActions className="download-actions">
        <Typography
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
