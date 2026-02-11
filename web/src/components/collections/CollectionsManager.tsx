/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  DialogContent,
  DialogTitle,
  IconButton
} from "@mui/material";
import React, { memo } from "react";
import CloseIcon from "@mui/icons-material/Close";
import CollectionList from "./CollectionList";
import PanelHeadline from "../ui/PanelHeadline";
import { Dialog } from "../ui_primitives";

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

const styles = (_theme: Theme) =>
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
      maxWidth="lg"
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
