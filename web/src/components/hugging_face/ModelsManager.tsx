/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Dialog, DialogContent, DialogTitle, Typography, Tooltip } from "@mui/material";
import React from "react";
import ModelListIndex from "./model_list/ModelListIndex";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";

const styles = (theme: Theme) =>
  css({
    margin: "2em 0 0",
    "&.models-manager": {
      display: "flex",
      gap: "1em",
      padding: "1em"
    },
    ".download-models-section": {
      display: "flex",
      width: "50%",
      flexDirection: "column",
      gap: "1em",
      padding: "1em"
    },
    ".existing-models-section": {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      padding: "0.5em 0 0 0"
    },
    ".models-search": {
      maxWidth: "600px",
      overflow: "hidden",
      backgroundColor: "transparent",
      padding: theme.spacing(2)
    },
    ".modal-content": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "80%",
      maxWidth: "1200px",
      backgroundColor: theme.vars.palette.background.paper,
      boxShadow: theme.shadows[24],
      borderRadius: theme.shape.borderRadius,
      outline: "none"
    },
    ".models-list-container": {
      position: "relative",
      height: "80vh",
      width: "100%"
    },
    ".dialog-title": {
      position: "sticky",
      top: 0,
      zIndex: 2,
      background:
        `linear-gradient(180deg, ${theme.vars.palette.background.paper} 70%, transparent)`,
      margin:0,
      padding: theme.spacing(4, 4),
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".close-button": {
      position: "absolute",
      right: theme.spacing(1),
      top: theme.spacing(2),
      color: theme.vars.palette.grey[500]
    }
  });

interface ModelsManagerProps {
  open: boolean;
  onClose: () => void;
}

const ModelsManager: React.FC<ModelsManagerProps> = ({ open, onClose }) => {
  const { isDialogOpen, closeDialog, downloads, cancelDownload } =
    useModelDownloadStore();
  const theme = useTheme();
  return (
    <Dialog
      css={styles(theme)}
      className="models-manager-dialog"
      open={open}
      onClose={onClose}
      slotProps={{
        backdrop: {
          style: { backgroundColor: "rgba(10,12,14,0.6)", backdropFilter: "blur(4px)" }
        }
      }}
      sx={{
        "& .MuiDialog-paper": {
          width: "92%",
          maxWidth: "1200px",
          margin: "auto",
          borderRadius: 1.5,
          border: `1px solid ${theme.vars.palette.grey[700]}`,
          backgroundImage: "none"
        }
      }}
    >
      <DialogTitle className="dialog-title">
        <Typography>Model Manager</Typography>
        <Tooltip title="Close">
          <IconButton aria-label="close" onClick={onClose} className="close-button">
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent sx={{ backgroundColor: "var(--palette-background-paper)", pt: 2 }}>
        <div className="models-manager">
          <div className="existing-models-section">
            <div className="models-list-container">
              <ModelListIndex />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModelsManager;
