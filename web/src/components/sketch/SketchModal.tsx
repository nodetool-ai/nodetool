/**
 * SketchModal
 *
 * Fullscreen modal wrapper for the SketchEditor.
 * Rendered as a portal for proper z-index stacking.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback } from "react";
import ReactDOM from "react-dom";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, IconButton, Typography, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SaveIcon from "@mui/icons-material/Save";
import SketchEditor from "./SketchEditor";
import { SketchDocument } from "./types";

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.vars.palette.grey[900],
    "& .sketch-modal-header": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "4px 12px",
      backgroundColor: theme.vars.palette.grey[800],
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      minHeight: "36px"
    },
    "& .sketch-modal-body": {
      flex: 1,
      overflow: "hidden"
    }
  });

export interface SketchModalProps {
  open: boolean;
  title?: string;
  initialDocument?: SketchDocument;
  onClose: () => void;
  onSave?: (doc: SketchDocument) => void;
  onDocumentChange?: (doc: SketchDocument) => void;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
}

const SketchModal: React.FC<SketchModalProps> = ({
  open,
  title = "Sketch Editor",
  initialDocument,
  onClose,
  onSave,
  onDocumentChange,
  onExportImage,
  onExportMask
}) => {
  const theme = useTheme();

  const handleSave = useCallback(() => {
    if (onSave) {
      // The latest document state is managed by the store;
      // the parent should have it via onDocumentChange
      onSave(initialDocument!);
    }
    onClose();
  }, [onSave, onClose, initialDocument]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  if (!open) {
    return null;
  }

  return ReactDOM.createPortal(
    <Box css={styles(theme)} onKeyDown={handleKeyDown} tabIndex={-1}>
      <Box className="sketch-modal-header">
        <Typography
          variant="body2"
          sx={{ flex: 1, fontWeight: 500 }}
        >
          {title}
        </Typography>
        {onSave && (
          <Tooltip title="Save & Close">
            <IconButton size="small" onClick={handleSave}>
              <SaveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Close (Esc)">
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box className="sketch-modal-body">
        <SketchEditor
          initialDocument={initialDocument}
          onDocumentChange={onDocumentChange}
          onExportImage={onExportImage}
          onExportMask={onExportMask}
        />
      </Box>
    </Box>,
    window.document.body
  );
};

export default memo(SketchModal);
