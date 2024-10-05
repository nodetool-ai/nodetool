/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Tooltip,
  IconButton
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { UnifiedModel } from "../../stores/ApiTypes";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import RecommendedModels from "./RecommendedModels";

const styles = (theme: any) =>
  css({
    ".recommended-models-grid": {
      maxHeight: "650px",
      overflow: "auto",
      paddingRight: "1em"
    },
    ".model-download-button": {
      color: theme.palette.c_hl1
    }
  });

interface RecommendedModelsDialogProps {
  open: boolean;
  onClose: () => void;
  recommendedModels: UnifiedModel[];
  startDownload: (
    repoId: string,
    modelType: string,
    path: string | null,
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
        <RecommendedModels
          recommendedModels={recommendedModels}
          initialViewMode="grid"
          startDownload={startDownload}
          onModelSelect={() => {
            openDialog();
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export default RecommendedModelsDialog;
