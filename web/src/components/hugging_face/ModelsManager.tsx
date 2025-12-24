/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
  Tooltip
} from "@mui/material";
import React from "react";
import ModelListIndex from "./model_list/ModelListIndex";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

const styles = (theme: Theme) =>
  css({
    margin: "2em 0 4em 0",
    ".models-manager": {
      display: "flex",
      height: "100%",
      overflow: "hidden"
    },
    ".download-models-section": {
      display: "flex",
      width: "50%",
      flexDirection: "column",
      gap: "1em",
      overflow: "auto"
    },
    ".existing-models-section": {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      padding: "0.5em 0 0 0",
      height: "100%",
      overflow: "hidden"
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
      background: "transparent",
      boxShadow: theme.shadows[24],
      borderRadius: theme.shape.borderRadius,
      outline: "none"
    },
    ".models-list-container": {
      position: "relative",
      height: "100%",
      width: "100%",
      flex: 1,
      overflowY: "visible"
    },
    ".dialog-title": {
      position: "sticky",
      top: 0,
      zIndex: 2,
      background: "transparent",
      margin: 0,
      padding: theme.spacing(3, 4),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backdropFilter: "blur(10px)"
    },
    ".close-button": {
      position: "absolute",
      right: theme.spacing(2),
      top: theme.spacing(2),
      color: theme.vars.palette.text.secondary,
      transition: "color 0.2s",
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover
      }
    }
  });

interface ModelsManagerProps {
  open: boolean;
  onClose: () => void;
}

const ModelsManager: React.FC<ModelsManagerProps> = ({ open, onClose }) => {
  const theme = useTheme();

  return (
    <Dialog
      css={styles(theme)}
      className="models-manager-dialog"
      open={open}
      onClose={onClose}
      slotProps={{
        backdrop: {
          style: {
            backdropFilter: theme.vars.palette.glass.blur,
            backgroundColor: theme.vars.palette.glass.backgroundDialog
          }
        },
        paper: {
          style: {
            borderRadius: "16px",
            background: theme.vars.palette.background.paper,
            backdropFilter: `${theme.vars.palette.glass.blur} saturate(180%)`,
            border: `1px solid ${theme.vars.palette.divider}`
          }
        }
      }}
      sx={{
        "& .MuiDialog-paper": {
          width: "92%",
          maxWidth: "1200px",
          height: "90vh",
          maxHeight: "90vh",
          margin: "auto",
          borderRadius: (theme as any)?.rounded?.dialog ?? "16px",
          border: `1px solid ${theme.vars.palette.divider}`,
          background: "transparent", // Let the slotProps handle the background
          boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)"
        }
      }}
    >
      <DialogTitle className="dialog-title">
        <Typography>Model Manager</Typography>
        <Tooltip title="Close">
          <IconButton
            aria-label="close"
            onClick={onClose}
            className="close-button"
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent
        sx={{
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: "0"
        }}
      >
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
