/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Grid,
  DialogContentText,
  Tooltip,
  IconButton,
  Typography
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { HuggingFaceModel } from "../../stores/ApiTypes";
import ThemeNodetool from "../themes/ThemeNodetool";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import ModelCard from "./ModelCard";

const styles = css({
  ".recommended-models-grid": {
    maxHeight: "650px",
    overflow: "auto",
    paddingRight: "1em"
  }
});

interface RecommendedModelsDialogProps {
  open: boolean;
  onClose: () => void;
  recommendedModels: HuggingFaceModel[];
  startDownload: (
    repoId: string,
    allowPatterns: string[] | null,
    ignorePatterns: string[] | null
  ) => void;
  openDialog: () => void;
}

const RecommendedModelsDialog: React.FC<RecommendedModelsDialogProps> = ({
  open,
  onClose,
  recommendedModels,
  startDownload,
  openDialog
}) => {
  return (
    <Dialog
      css={styles}
      className="recommended-models-dialog"
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle style={{ marginBottom: 2 }}>
        Recommended Models
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
        <>
          <Grid container spacing={3} className="recommended-models-grid">
            {recommendedModels.map((model) => (
              <Grid item xs={12} sm={6} md={4} key={model.repo_id}>
                {model.repo_id && (
                  <ModelCard
                    repoId={model.repo_id}
                    onDownload={() => {
                      startDownload(
                        model.repo_id || "",
                        model.allow_patterns ?? null,
                        model.ignore_patterns ?? null
                      );
                      openDialog();
                      onClose();
                    }}
                  />
                )}
              </Grid>
            ))}
          </Grid>
          <Typography variant="body1" sx={{ marginTop: "1em" }}>
            Models will be downloaded to your local HuggingFace .cache folder.
          </Typography>
        </>
      </DialogContent>
    </Dialog>
  );
};

export default RecommendedModelsDialog;
