/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
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
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import ModelCard from "./model_card/ModelCard";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "./DownloadProgress";

const styles = (theme: Theme) =>
  css({
    ".model-content": {
      display: "flex",
      flexDirection: "column"
    },
    ".models-grid": {
      maxHeight: "1000px",
      overflowY: "auto",
      overflowX: "hidden",
      paddingRight: "1em",
      flexGrow: 1,
      minHeight: 0
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

interface RequiredModelsDialogProps {
  open: boolean;
  onClose: () => void;
  repoPaths: RepoPath[];
  repos: string[];
}

const RequiredModelsDialog: React.FC<RequiredModelsDialogProps> = ({
  open,
  onClose,
  repoPaths,
  repos
}) => {
  const theme = useTheme();
  const { startDownload, downloads } = useModelDownloadStore((state) => ({
    startDownload: state.startDownload,
    openDialog: state.openDialog,
    downloads: state.downloads
  }));

  return (
    <Dialog
      css={styles(theme)}
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
      <DialogTitle className="model-title" style={{ marginBottom: 2 }}>
        Required Models Download
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Close | ESC">
          <IconButton
            className="model-close"
            aria-label="close"
            onClick={onClose}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              ml: 4,
              color: (theme) => theme.vars.palette.grey[500]
            }}
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent className="model-content" sx={{ paddingBottom: "3em" }}>
        <Box className="model-desc" sx={{ mb: 3 }}>
          <Typography
            className="model-desc-title"
            variant="body1"
            sx={{ mb: 1 }}
          >
            To run this workflow, the following AI models need to be downloaded
            to your local machine:
          </Typography>
          <Typography
            className="model-desc-details"
            variant="body2"
            color="text.secondary"
          >
            • Models will be stored locally in the Hugging Face cache
            <br />
            • Download times may vary based on model size and internet speed
            <br />• You can close this dialog and return later - downloads will
            continue in the background
          </Typography>
        </Box>

        <Grid container spacing={2} className="model-grid models-grid">
          {repos.map((repo, index) => {
            return (
              <Grid
                sx={{
                  gridColumn: { xs: "span 12", sm: "span 6", md: "span 4" }
                }}
                key={index}
                className="model-item"
              >
                <Box className="model-container">
                  {!downloads[repo] && (
                    <ModelCard
                      model={{
                        id: repo,
                        name: repo,
                        repo_id: repo,
                        type: "hf."
                      }}
                      onDownload={() => {
                        startDownload(repo, "hf.model");
                      }}
                    />
                  )}
                  {downloads[repo] && <DownloadProgress name={repo} />}
                </Box>
              </Grid>
            );
          })}
          {repoPaths.map((repoPath, index) => {
            const modelId = `${repoPath.repo_id}/${repoPath.path}`;
            return (
              <Grid
                sx={{
                  gridColumn: { xs: "span 12", sm: "span 6", md: "span 4" }
                }}
                key={index}
                className="model-item"
              >
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

export default RequiredModelsDialog;
