/**
 * SketchModal
 *
 * Fullscreen modal wrapper for the SketchEditor.
 * Rendered as a portal for proper z-index stacking.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, IconButton, Typography, Tooltip, Divider } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import TrashIconSvg from "../../icons/trash.svg?react";
const TrashIcon = TrashIconSvg as React.FC<React.SVGProps<SVGSVGElement>>;
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import FlipIcon from "@mui/icons-material/Flip";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import MergeIcon from "@mui/icons-material/CallMerge";
import FlipCameraAndroidIcon from "@mui/icons-material/FlipCameraAndroid";
import SketchEditor, { SketchEditorHandle } from "./SketchEditor";
import { useSketchStore } from "./state";
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
      minHeight: "36px",
      "& .MuiIconButton-root": {
        padding: "3px"
      }
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
  onDocumentChange?: (doc: SketchDocument) => void;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
}

const SketchModal: React.FC<SketchModalProps> = ({
  open,
  title = "Sketch Editor",
  initialDocument,
  onClose,
  onDocumentChange,
  onExportImage,
  onExportMask
}) => {
  const theme = useTheme();
  const editorRef = useRef<SketchEditorHandle>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const mirrorX = useSketchStore((s) => s.mirrorX);
  const mirrorY = useSketchStore((s) => s.mirrorY);
  const setMirrorX = useSketchStore((s) => s.setMirrorX);
  const setMirrorY = useSketchStore((s) => s.setMirrorY);
  const canUndo = useSketchStore((s) => s.canUndo);
  const canRedo = useSketchStore((s) => s.canRedo);

  useEffect(() => {
    if (!open) { setConfirmDiscard(false); }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDiscard) { setConfirmDiscard(false); }
        else { onClose(); }
      }
    },
    [onClose, confirmDiscard]
  );

  if (!open) {
    return null;
  }

  return ReactDOM.createPortal(
    <Box
      className="sketch-modal"
      css={styles(theme)}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <Box className="sketch-modal-header">
        <Typography variant="body2" sx={{ fontWeight: 500, mr: "auto" }}>
          {title}
        </Typography>

        {/* ── Actions (right-aligned) ── */}
        <Box sx={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <Tooltip title="Undo (Ctrl+Z)">
            <span>
              <IconButton size="small" onClick={() => editorRef.current?.undo()} disabled={!canUndo()}>
                <UndoIcon sx={{ fontSize: "18px" }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Y)">
            <span>
              <IconButton size="small" onClick={() => editorRef.current?.redo()} disabled={!canRedo()}>
                <RedoIcon sx={{ fontSize: "18px" }} />
              </IconButton>
            </span>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: "4px" }} />

          <Tooltip title="Mirror Horizontal (M)">
            <IconButton size="small" onClick={() => setMirrorX(!mirrorX)} color={mirrorX ? "primary" : "default"}>
              <FlipIcon sx={{ fontSize: "18px" }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Mirror Vertical">
            <IconButton size="small" onClick={() => setMirrorY(!mirrorY)} color={mirrorY ? "primary" : "default"}>
              <FlipIcon sx={{ fontSize: "18px", transform: "rotate(90deg)" }} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: "4px" }} />

          <Tooltip title="Clear Layer (Delete)">
            <IconButton size="small" onClick={() => editorRef.current?.clearLayer()}>
              <DeleteOutlineIcon sx={{ fontSize: "18px" }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Export PNG (Ctrl+S)">
            <IconButton size="small" onClick={() => editorRef.current?.exportPng()}>
              <SaveAltIcon sx={{ fontSize: "18px" }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Flip Layer Horizontal">
            <IconButton size="small" onClick={() => editorRef.current?.flipHorizontal()}>
              <FlipCameraAndroidIcon sx={{ fontSize: "18px" }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Flip Layer Vertical">
            <IconButton size="small" onClick={() => editorRef.current?.flipVertical()}>
              <FlipCameraAndroidIcon sx={{ fontSize: "18px", transform: "rotate(90deg)" }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Merge Down">
            <IconButton size="small" onClick={() => editorRef.current?.mergeDown()}>
              <MergeIcon sx={{ fontSize: "18px" }} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: "4px" }} />

          {confirmDiscard ? (
            <>
              <Typography variant="caption" sx={{ color: "warning.main", whiteSpace: "nowrap" }}>
                Discard changes?
              </Typography>
              <IconButton size="small" color="error" onClick={() => { editorRef.current?.discardToInitial(); onClose(); }}>
                <TrashIcon width={16} height={16} />
              </IconButton>
              <IconButton size="small" onClick={() => setConfirmDiscard(false)}>
                <CloseIcon sx={{ fontSize: "16px" }} />
              </IconButton>
            </>
          ) : (
            <>
              <Tooltip title="Discard all changes and close">
                <IconButton size="small" onClick={() => setConfirmDiscard(true)} sx={{ color: "grey.500" }}>
                  <TrashIcon width={16} height={16} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close (Esc)">
                <IconButton size="small" onClick={onClose}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </Box>
      <Box className="sketch-modal-body">
        <SketchEditor
          ref={editorRef}
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
