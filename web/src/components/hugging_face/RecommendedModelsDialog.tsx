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
      background: "transparent",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      boxShadow: theme.shadows[24]
    },
    ".MuiDialogContent-root": {
      height: "calc(100% - 64px)",
      display: "flex",
      flexDirection: "column"
    },
    ".recommended-models-grid": {
      flex: 1,
      overflow: "auto",
      paddingRight: "1em",
      "&::-webkit-scrollbar": { width: 8 },
      "&::-webkit-scrollbar-track": {
        background: theme.vars.palette.background.paper
      },
      "&::-webkit-scrollbar-thumb": {
        background: theme.vars.palette.grey[600],
        borderRadius: 4
      },
      "&::-webkit-scrollbar-thumb:hover": {
        background: theme.vars.palette.grey[500]
      }
    },
    ".model-download-button": {
      color: "var(--palette-primary-main)"
    }
  });

interface RecommendedModelsDialogProps {
  open: boolean;
  onClose: () => void;
  recommendedModels: UnifiedModel[];
  startDownload: (model: UnifiedModel) => void;
}

const RecommendedModelsDialog: React.FC<RecommendedModelsDialogProps> = ({
  open,
  onClose,
  recommendedModels,
  startDownload
}) => {
  const theme = useTheme();
  return (
    <Dialog
      css={styles(theme)}
      className="recommended-models-dialog"
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.6)`,
            backdropFilter: "blur(20px)"
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
              color: (theme) => theme.vars.palette.grey[500]
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
