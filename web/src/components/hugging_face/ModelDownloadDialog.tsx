/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Tooltip,
  IconButton,
  Grid,
  Box,
  Typography
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import ModelCard from "./ModelCard";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "./DownloadProgress";

const styles = (theme: any) =>
  css({
    ".models-grid": {
      maxHeight: "1000px",
      overflow: "auto",
      paddingRight: "1em"
    },
    ".model-container": {
      display: "flex",
      flexDirection: "column",
      gap: "1rem"
    }
  });

interface RepoPath {
  repo_id: string;
  path: string;
}

interface ModelDownloadDialogProps {
  open: boolean;
  onClose: () => void;
  repoPaths: RepoPath[];
}

const ModelDownloadDialog: React.FC<ModelDownloadDialogProps> = ({
  open,
  onClose,
  repoPaths
}) => {
  const { startDownload, openDialog, downloads } = useModelDownloadStore(
    (state) => ({
      startDownload: state.startDownload,
      openDialog: state.openDialog,
      downloads: state.downloads
    })
  );

  return (
    <Dialog
      css={styles}
      className="model-download-dialog"
      open={open}
      onClose={onClose}
      maxWidth="lg"
      slotProps={{
        backdrop: {
          style: {
            backgroundColor: "rgba(0, 0, 0, 0.8)"
          }
        }
      }}
      fullWidth
    >
      <DialogTitle style={{ marginBottom: 2 }}>
        Required Models Download
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Close | ESC">
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500]
            }}
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent sx={{ paddingBottom: "3em" }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1" sx={{ mb: 1 }}>
            To run this workflow, the following AI models need to be downloaded
            to your local machine:
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • Models will be stored locally in the Hugging Face cache
            <br />
            • Download times may vary based on model size and internet speed
            <br />• You can close this dialog and return later - downloads will
            continue in the background
          </Typography>
        </Box>

        <Grid container spacing={2} className="models-grid">
          {repoPaths.map((repoPath, index) => {
            const modelId = `${repoPath.repo_id}/${repoPath.path}`;
            return (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Box className="model-container">
                  {!downloads[modelId] && (
                    <ModelCard
                      model={{
                        id: modelId,
                        name: repoPath.path,
                        repo_id: repoPath.repo_id,
                        path: repoPath.path,
                        type: "hf."
                      }}
                      onDownload={() => {
                        startDownload(
                          repoPath.repo_id,
                          "hf.model",
                          repoPath.path
                        );
                      }}
                    />
                  )}
                  {downloads[modelId] && <DownloadProgress name={modelId} />}
                </Box>
              </Grid>
            );
          })}
        </Grid>
      </DialogContent>
    </Dialog>
  );
};

export default ModelDownloadDialog;
