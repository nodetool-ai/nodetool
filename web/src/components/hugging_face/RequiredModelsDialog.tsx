/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React from "react";
import {
  DialogTitle,
  DialogContent,
  Grid
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { Dialog, FlexColumn, Text, ToolbarIconButton } from "../ui_primitives";
import ModelCard from "./model_card/ModelCard";
import { useShallow } from "zustand/react/shallow";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "./DownloadProgress";

const styles = (_theme: Theme) =>
  css({
    ".models-grid": {
      maxHeight: "1000px",
      overflowY: "auto",
      overflowX: "hidden",
      paddingRight: "1em",
      flexGrow: 1,
      minHeight: 0
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
  const { startDownload, downloads } = useModelDownloadStore(
    useShallow((state) => ({
      startDownload: state.startDownload,
      openDialog: state.openDialog,
      downloads: state.downloads
    }))
  );

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
            backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.8)`
          }
        }
      }}
      fullWidth
    >
      <DialogTitle className="model-title" style={{ marginBottom: 2 }}>
        Required Models Download
        <ToolbarIconButton
          className="model-close"
          tooltip="Close | ESC"
          delay={TOOLTIP_ENTER_DELAY}
          onClick={onClose}
          icon={<CloseIcon />}
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
            ml: 4,
            color: (theme) => theme.vars.palette.grey[500]
          }}
          nodrag={false}
        />
      </DialogTitle>

      <DialogContent sx={{ paddingBottom: "3em" }}>
        <FlexColumn gap={3} className="model-content">
          <FlexColumn gap={1} className="model-desc">
            <Text>
              To run this workflow, the following AI models need to be downloaded
              to your local machine:
            </Text>
            <Text size="small" color="secondary">
              • Models will be stored locally in the Hugging Face cache
              <br />
              • Download times may vary based on model size and internet speed
              <br />• You can close this dialog and return later - downloads will
              continue in the background
            </Text>
          </FlexColumn>

          <Grid container spacing={2} className="model-grid models-grid">
            {repos.map((repo) => {
              return (
                <Grid
                  sx={{
                    gridColumn: { xs: "span 12", sm: "span 6", md: "span 4" }
                  }}
                  key={repo}
                  className="model-item"
                >
                  <FlexColumn gap={4} className="model-container">
                    {!downloads[repo] && (
                    <ModelCard
                        model={{
                          id: repo,
                          name: repo,
                          repo_id: repo,
                          type: "hf.",
                          downloaded: false
                        }}
                        onDownload={() => {
                          startDownload(repo, "hf.model");
                        }}
                      />
                    )}
                    {downloads[repo] && <DownloadProgress name={repo} />}
                  </FlexColumn>
                </Grid>
              );
            })}
            {repoPaths.map((repoPath) => {
              const modelId = `${repoPath.repo_id}/${repoPath.path}`;
              return (
                <Grid
                  sx={{
                    gridColumn: { xs: "span 12", sm: "span 6", md: "span 4" }
                  }}
                  key={modelId}
                  className="model-item"
                >
                  <FlexColumn gap={4} className="model-container">
                  {!downloads[modelId] && (
                  <ModelCard
                      model={{
                        id: modelId,
                        name: repoPath.path,
                        repo_id: repoPath.repo_id,
                        path: repoPath.path,
                        type: "hf.",
                        downloaded: false
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
                </FlexColumn>
              </Grid>
            );
          })}
        </Grid>
      </FlexColumn>
    </DialogContent>
    </Dialog>
  );
};

export default RequiredModelsDialog;
