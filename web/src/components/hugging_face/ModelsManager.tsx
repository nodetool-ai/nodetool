/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Tooltip
} from "@mui/material";
import React from "react";
import ModelListIndex from "./model_list/ModelListIndex";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import PanelHeadline from "../ui/PanelHeadline";
import { Dialog } from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    margin: "2em 0 4em 0",
    "& .dialog-content": {
      display: "flex",
      flexDirection: "column",
      padding: 0,
      overflow: "hidden"
    },
    ".models-manager": {
      display: "flex",
      flexDirection: "row",
      flexGrow: 1,
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
      maxWidth="lg"
      fullWidth
      onClose={onClose}
      title={
        <PanelHeadline
          title="Model Manager"
          actions={
            <Tooltip title="Close">
              <IconButton
                aria-label="close"
                onClick={onClose}
                className="close-button"
              >
                <CloseIcon />
              </IconButton>
            </Tooltip>
          }
        />
      }
    >
      <Box className="models-manager" sx={{ height: "80vh", minHeight: "600px" }}>
        <div className="existing-models-section">
          <div className="models-list-container">
            <ModelListIndex />
          </div>
        </div>
      </Box>
    </Dialog>
  );
};

export default ModelsManager;
