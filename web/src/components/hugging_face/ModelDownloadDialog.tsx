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
  Box
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
      fullWidth
    >
      <DialogTitle style={{ marginBottom: 2 }}>
        You&apos;re missing some models
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
