/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
  IconButton
} from "@mui/material";
import React from "react";
import CloseIcon from "@mui/icons-material/Close";
import CollectionList from "./CollectionList";

const styles = (theme: Theme) =>
  css({
    ".collections-manager": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden"
    },
    ".collections-content": {
      flex: 1,
      overflow: "auto",
      padding: "0 1em"
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
      "&:hover": {
        color: theme.vars.palette.text.primary
      }
    }
  });

interface CollectionsManagerProps {
  open: boolean;
  onClose: () => void;
}

const CollectionsManager: React.FC<CollectionsManagerProps> = ({
  open,
  onClose
}) => {
  const theme = useTheme();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      sx={{
        "& .MuiDialog-paper": {
          width: "70vw",
          minWidth: "600px",
          maxWidth: "900px",
          height: "80vh",
          margin: "auto",
          borderRadius: theme.vars.rounded.dialog,
          border: `1px solid ${theme.vars.palette.grey[700]}`,
          backgroundColor: theme.vars.palette.glass.backgroundDialogContent
        }
      }}
      slotProps={{
        backdrop: {
          style: {
            backdropFilter: theme.vars.palette.glass.blur,
            backgroundColor: theme.vars.palette.glass.backgroundDialog
          }
        },
        paper: {
          style: {
            borderRadius: theme.vars.rounded.dialog,
            background: theme.vars.palette.glass.backgroundDialogContent
          }
        }
      }}
    >
      <DialogTitle className="dialog-title" css={styles(theme)}>
        <Typography variant="h5" component="div">
          Collections
        </Typography>
        <IconButton
          className="close-button"
          onClick={onClose}
          size="small"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, overflow: "hidden" }}>
        <div css={styles(theme)}>
          <div className="collections-manager">
            <div className="collections-content">
              <CollectionList />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CollectionsManager;
