/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Dialog, DialogContent } from "@mui/material";
import React from "react";
import ModelListIndex from "./model_list/ModelListIndex";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import DownloadManagerDialog from "./DownloadManagerDialog";
import { Box } from "@mui/material";

const styles = (theme: any) =>
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
      padding: "1em"
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
      backgroundColor: theme.palette.background.paper,
      boxShadow: theme.shadows[24],
      borderRadius: theme.shape.borderRadius,
      outline: "none"
    },
    ".models-list-container": {
      position: "relative",
      height: "80vh",
      width: "100%"
    },
    ".close-button": {
      position: "absolute",
      right: theme.spacing(1),
      top: theme.spacing(1),
      color: theme.palette.grey[500]
    }
  });

interface ModelsManagerProps {
  open: boolean;
  onClose: () => void;
}

const ModelsManager: React.FC<ModelsManagerProps> = ({ open, onClose }) => {
  const { isDialogOpen, closeDialog, downloads, cancelDownload } =
    useModelDownloadStore();
  return (
    <Dialog
      css={styles}
      className="models-manager-dialog"
      open={open}
      onClose={onClose}
      slotProps={{
        backdrop: {
          style: { backgroundColor: "#11111122" }
        }
      }}
      sx={{
        "& .MuiDialog-paper": {
          width: "90%",
          maxWidth: "90vw",
          margin: "auto"
        }
      }}
    >
      <DialogContent
        sx={{
          backgroundColor: "var(--palette-grey-800)"
        }}
      >
        <IconButton
          aria-label="close"
          onClick={onClose}
          className="close-button"
        >
          <CloseIcon />
        </IconButton>
        <div className="models-manager">
          {/* <div className="download-models-section">
            <div className="models-search">
              <HuggingFaceModelSearch />
            </div>
            <div className="models-download-dialog">
              <DownloadManagerDialog />
            </div>
          </div> */}
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
