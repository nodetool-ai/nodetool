/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
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
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import RecommendedModels from "./RecommendedModels";

const styles = (theme: Theme) =>
  css({
    ".MuiDialog-paper": {
      height: "calc(100% - 200px)",
      backgroundColor: theme.palette.Paper.overlay,
      backgroundImage: "none"
    },
    ".MuiDialogContent-root": {
      height: "calc(100% - 64px)",
      display: "flex",
      flexDirection: "column"
    },
    ".recommended-models-grid": {
      flex: 1,
      overflow: "auto",
      paddingRight: "1em"
    },
    ".model-download-button": {
      color: "var(--palette-primary-main)"
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
}

const RecommendedModelsDialog: React.FC<RecommendedModelsDialogProps> = ({
  open,
  onClose,
  recommendedModels,
  startDownload
}) => {
  return (
    <Dialog
      css={styles}
      className="recommended-models-dialog"
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      slotProps={{
        backdrop: {
          style: {
            backgroundColor: "rgba(15, 9, 9, 0.8)"
          }
        }
      }}
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
          startDownload={startDownload}
        />
      </DialogContent>
    </Dialog>
  );
};

export default RecommendedModelsDialog;
