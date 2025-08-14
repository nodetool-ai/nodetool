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
  Typography
} from "@mui/material";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "./DownloadProgress";
import { useTheme } from "@mui/material/styles";
import { type Theme } from "@mui/material/styles";

import { isEqual } from "lodash";
import { useModelBasePaths } from "../../hooks/useModelBasePaths";
import { FolderOutlined } from "@mui/icons-material";
import { openInExplorer } from "../../utils/fileExplorer";

const styles = (theme: Theme) =>
  css({
    ".MuiDialog-paper": {
      width: "92%",
      maxWidth: "900px",
      margin: "auto",
      borderRadius: 6,
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      background: "transparent",
      color: theme.vars.palette.text.primary
    },
    ".MuiDialogTitle-root": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeBig,
      fontWeight: 400
    },
    ".download-actions": {
      padding: "8px 24px 16px",
      justifyContent: "space-between",
      alignItems: "flex-end",
      color: "inherit"
    }
  });

const DownloadManagerDialog: React.FC = () => {
  const { isDialogOpen, closeDialog, downloads } = useModelDownloadStore();
  const { huggingfaceBasePath, ollamaBasePath } = useModelBasePaths();

  const hasActiveDownloads = Object.keys(downloads).length > 0;

  const theme = useTheme();

  const infoMessage = hasActiveDownloads ? (
    "You can close this dialog and return later - downloads will continue in the background. Access downloads anytime via the Download icon in the toolbar."
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
            backdropFilter:
              (theme as any)?.palette?.glass?.blur ?? "blur(20px)",
            backgroundColor:
              (theme as any)?.palette?.glass?.backgroundDialog ?? undefined
          }
        }
      }}
    >
      <DialogTitle sx={{ color: "inherit" }}>
        {hasActiveDownloads ? "Download Progress" : "Model Downloads"}
      </DialogTitle>
      <DialogContent
        sx={{
          backgroundColor:
            (theme as any)?.palette?.glass?.backgroundDialogContent ?? undefined
        }}
      >
        <Box mt={2}>
          {Object.keys(downloads).length > 0 ? (
            Object.keys(downloads).map((name) => (
              <DownloadProgress key={name} name={name} />
            ))
          ) : (
            <Typography
              variant="body1"
              sx={{ textAlign: "center", padding: "2em 0" }}
            >
              No active downloads
            </Typography>
          )}
        </Box>
        <Box mt={2} sx={{ display: "flex", gap: 2 }}>
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
