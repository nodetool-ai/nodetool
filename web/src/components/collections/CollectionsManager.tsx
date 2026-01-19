/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton
} from "@mui/material";
import React, { memo } from "react";
import CloseIcon from "@mui/icons-material/Close";
import CollectionList from "./CollectionList";
import PanelHeadline from "../ui/PanelHeadline";

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const styles = (theme: Theme) =>
  css({
    ".collections-manager": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
      animation: `${fadeIn} 0.3s ease-out`
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
      backdropFilter: "blur(20px) saturate(180%)"
    },
    ".close-button": {
      position: "absolute",
      right: theme.spacing(2),
      top: theme.spacing(2),
      color: theme.vars.palette.text.secondary,
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover,
        transform: "rotate(90deg)"
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
          width: "80vw",
          minWidth: "600px",
          maxWidth: "900px",
          height: "85vh",
          margin: "auto",
          borderRadius: theme.vars.rounded.dialog,
          border: `1px solid ${theme.vars.palette.grey[700]}`,
          backgroundColor: theme.vars.palette.glass.backgroundDialogContent,
          backdropFilter: "blur(40px) saturate(180%)"
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
        <PanelHeadline
          title="Collections"
          actions={
            <IconButton
              className="close-button"
              onClick={onClose}
              size="small"
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
          }
        />
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

export default memo(CollectionsManager);
