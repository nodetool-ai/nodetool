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
import {
  Box,
  IconButton,
  Typography,
  Tooltip,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Slider
} from "@mui/material";
import DrawOutlinedIcon from "@mui/icons-material/DrawOutlined";
import CloseIcon from "@mui/icons-material/Close";
import TrashIconSvg from "../../icons/trash.svg?react";
const TrashIcon = TrashIconSvg as React.FC<React.SVGProps<SVGSVGElement>>;
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import FlipIcon from "@mui/icons-material/Flip";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import CheckIcon from "@mui/icons-material/Check";
import SketchEditor, { SketchEditorHandle } from "./SketchEditor";
import { PenPressureSettingsPanel } from "./ToolSettingsPanels";
import { useSketchStore } from "./state";
import {
  SketchDocument,
  SymmetryMode,
  SYMMETRY_MIN_RAYS,
  SYMMETRY_MAX_RAYS,
  DEFAULT_PEN_PRESSURE
} from "./types";
import type { SketchTool } from "./types";

function isPressureSketchTool(tool: SketchTool): boolean {
  return tool === "brush" || tool === "pencil" || tool === "eraser";
}

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
      flexWrap: "wrap",
      rowGap: "6px",
      columnGap: "8px",
      padding: "4px 12px",
      backgroundColor: theme.vars.palette.grey[800],
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      minHeight: "36px",
      "& .MuiIconButton-root": {
        padding: "3px"
      },
      "& .sketch-modal-pen-inline": {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "8px",
        flexShrink: 0,
        "& .setting-row": {
          display: "flex",
          alignItems: "center",
          gap: "4px",
          "& .MuiSlider-root": {
            width: "80px",
            minWidth: "60px"
          },
          "& .setting-label": {
            fontSize: "0.65rem",
            whiteSpace: "nowrap",
            color: theme.vars.palette.grey[300]
          },
          "& .setting-value": {
            fontSize: "0.65rem",
            minWidth: "24px",
            textAlign: "right",
            color: theme.vars.palette.grey[200]
          }
        },
        "& .MuiToggleButtonGroup-root": {
          "& .MuiToggleButton-root": {
            padding: "2px 6px",
            fontSize: "0.6rem"
          }
        }
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
  title = "Image Editor",
  initialDocument,
  onClose,
  onDocumentChange,
  onExportImage,
  onExportMask
}) => {
  const theme = useTheme();
  const editorRef = useRef<SketchEditorHandle>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [symmetryAnchorEl, setSymmetryAnchorEl] = useState<HTMLElement | null>(null);

  const symmetryMode = useSketchStore((s) => s.symmetryMode);
  const symmetryRays = useSketchStore((s) => s.symmetryRays);
  const setSymmetryMode = useSketchStore((s) => s.setSymmetryMode);
  const setSymmetryRays = useSketchStore((s) => s.setSymmetryRays);
  const canUndo = useSketchStore((s) => s.canUndo);
  const canRedo = useSketchStore((s) => s.canRedo);
  const activeTool = useSketchStore((s) => s.activeTool);
  const penPressure = useSketchStore((s) => ({
    ...DEFAULT_PEN_PRESSURE,
    ...s.document.toolSettings?.penPressure
  }));
  const setPenPressure = useSketchStore((s) => s.setPenPressure);
  const headerPenPressureOn = penPressure.pressureSensitivity !== false;

  // Derive label from mode
  const symmetryLabels: Record<SymmetryMode, string> = {
    off: "Off",
    horizontal: "Horizontal (M)",
    vertical: "Vertical (⇧M)",
    dual: "Dual Axis",
    radial: `Radial (${symmetryRays})`,
    mandala: `Mandala (${symmetryRays})`
  };
  const symmetryLabel = symmetryLabels[symmetryMode] || "Off";
  const symmetryActive = symmetryMode !== "off";

  useEffect(() => {
    if (!open) {
      setConfirmDiscard(false);
    }
  }, [open]);

  const handleRequestClose = useCallback(() => {
    editorRef.current?.flushPendingChanges();
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDiscard) { setConfirmDiscard(false); }
        else { handleRequestClose(); }
      }
    },
    [handleRequestClose, confirmDiscard]
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

        {isPressureSketchTool(activeTool) ? (
          <Box
            className="sketch-modal-pen-inline"
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 0.75,
              rowGap: "4px"
            }}
          >
            <Tooltip
              title={
                headerPenPressureOn
                  ? "Turn off pen pressure"
                  : "Turn on pen pressure"
              }
            >
              <IconButton
                size="small"
                onClick={() =>
                  setPenPressure({ pressureSensitivity: !headerPenPressureOn })
                }
                color={headerPenPressureOn ? "primary" : "default"}
                aria-label="Toggle pen pressure"
                aria-expanded={headerPenPressureOn}
                aria-controls="sketch-modal-pen-pressure-panel"
                sx={{
                  color: headerPenPressureOn ? undefined : "grey.300",
                  flexShrink: 0
                }}
              >
                <DrawOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            {headerPenPressureOn ? (
              <Box
                id="sketch-modal-pen-pressure-panel"
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
                  columnGap: 10,
                  rowGap: 4,
                  py: 0.25,
                  pl: 0.75,
                  ml: 0.25,
                  borderLeft: `1px solid ${theme.vars.palette.grey[700]}`,
                  minWidth: 0
                }}
              >
                <PenPressureSettingsPanel
                  settings={penPressure}
                  onChange={setPenPressure}
                  omitSensitivitySwitch
                  inlineRow
                />
              </Box>
            ) : null}
          </Box>
        ) : null}

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

          <Tooltip title={`Symmetry: ${symmetryLabel}`}>
            <IconButton
              size="small"
              onClick={(e) => setSymmetryAnchorEl(e.currentTarget)}
              color={symmetryActive ? "primary" : "default"}
            >
              <FlipIcon sx={{ fontSize: "18px" }} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={symmetryAnchorEl}
            open={Boolean(symmetryAnchorEl)}
            onClose={() => setSymmetryAnchorEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            slotProps={{ paper: { sx: { minWidth: 180 } } }}
          >
            {(["off", "horizontal", "vertical", "dual", "radial", "mandala"] as SymmetryMode[]).map((mode) => (
              <MenuItem
                key={mode}
                onClick={() => { setSymmetryMode(mode); if (mode !== "radial" && mode !== "mandala") { setSymmetryAnchorEl(null); } }}
                selected={symmetryMode === mode}
              >
                {symmetryMode === mode && <ListItemIcon><CheckIcon fontSize="small" /></ListItemIcon>}
                <ListItemText inset={symmetryMode !== mode}>{symmetryLabels[mode]}</ListItemText>
              </MenuItem>
            ))}
            {(symmetryMode === "radial" || symmetryMode === "mandala") && (
              <Box sx={{ px: 2, py: 1, minWidth: 160 }}>
                <Typography variant="caption" sx={{ color: "grey.500" }}>
                  Rays: {symmetryRays}
                </Typography>
                <Slider
                  value={symmetryRays}
                  min={SYMMETRY_MIN_RAYS}
                  max={SYMMETRY_MAX_RAYS}
                  step={1}
                  marks
                  size="small"
                  onChange={(_, v) => setSymmetryRays(v as number)}
                  sx={{ mt: 0.5 }}
                />
              </Box>
            )}
          </Menu>

          <Tooltip title="Export PNG (Ctrl+S)">
            <IconButton size="small" onClick={() => editorRef.current?.exportPng()}>
              <SaveAltIcon sx={{ fontSize: "18px" }} />
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
                <IconButton size="small" onClick={handleRequestClose}>
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
