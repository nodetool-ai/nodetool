/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
  Tooltip,
  useMediaQuery
} from "@mui/material";
import React from "react";
import ModelListIndex from "./model_list/ModelListIndex";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

const styles = (theme: Theme, isMobile: boolean) =>
  css({
    margin: isMobile ? "0" : "2em 0 0",
    "&.models-manager": {
      display: "flex",
      gap: isMobile ? "0.5em" : "1em",
      padding: isMobile ? "0.5em" : "1em"
    },
    ".download-models-section": {
      display: "flex",
      width: isMobile ? "100%" : "50%",
      flexDirection: "column",
      gap: "1em",
      padding: isMobile ? "0.5em" : "1em"
    },
    ".existing-models-section": {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: isMobile ? "0.5em" : "1em",
      padding: isMobile ? "0.25em 0 0 0" : "0.5em 0 0 0"
    },
    ".models-search": {
      maxWidth: isMobile ? "100%" : "600px",
      overflow: "hidden",
      backgroundColor: "transparent",
      padding: isMobile ? theme.spacing(1) : theme.spacing(2)
    },
    ".modal-content": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: isMobile ? "95%" : "80%",
      maxWidth: isMobile ? "100%" : "1200px",
      background: "transparent",
      boxShadow: theme.shadows[24],
      borderRadius: theme.shape.borderRadius,
      outline: "none"
    },
    ".models-list-container": {
      position: "relative",
      height: isMobile ? "70vh" : "80vh",
      width: "100%"
    },
    ".dialog-title": {
      position: "sticky",
      top: 0,
      zIndex: 2,
      background: "transparent",
      margin: 0,
      padding: isMobile ? theme.spacing(2, 2) : theme.spacing(4, 4),
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".close-button": {
      position: "absolute",
      right: isMobile ? theme.spacing(0.5) : theme.spacing(1),
      top: isMobile ? theme.spacing(1) : theme.spacing(2),
      color: theme.vars.palette.grey[500],
      minWidth: isMobile ? "44px" : "auto",
      minHeight: isMobile ? "44px" : "auto"
    }
  });

interface ModelsManagerProps {
  open: boolean;
  onClose: () => void;
}

const ModelsManager: React.FC<ModelsManagerProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Dialog
      css={styles(theme, isMobile)}
      className="models-manager-dialog"
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      slotProps={{
        backdrop: {
          style: {
            backdropFilter: theme.vars.palette.glass.blur,
            backgroundColor: theme.vars.palette.glass.backgroundDialog
          }
        },
        paper: {
          style: {
            borderRadius: isMobile ? 0 : theme.vars.rounded.dialog,
            background: theme.vars.palette.glass.backgroundDialogContent
          }
        }
      }}
      sx={{
        "& .MuiDialog-paper": {
          width: isMobile ? "100%" : "92%",
          maxWidth: isMobile ? "none" : "1200px",
          height: isMobile ? "100%" : "auto",
          margin: isMobile ? 0 : "auto",
          borderRadius: isMobile ? 0 : (theme as any)?.rounded?.dialog ?? 6,
          border: isMobile ? "none" : `1px solid ${theme.vars.palette.grey[700]}`
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
          pt: 2
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
