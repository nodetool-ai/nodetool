/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  IconButton,
  Tooltip,
  Slider,
  Typography
} from "@mui/material";

// Icons
import PanToolIcon from "@mui/icons-material/PanTool";
import CropIcon from "@mui/icons-material/Crop";
import BrushIcon from "@mui/icons-material/Brush";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import Rotate90DegreesCwIcon from "@mui/icons-material/Rotate90DegreesCw";
import Rotate90DegreesCcwIcon from "@mui/icons-material/Rotate90DegreesCcw";
import FlipIcon from "@mui/icons-material/Flip";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";

import type {
  EditTool,
  EditAction,
  BrushSettings,
  AdjustmentSettings
} from "./types";

const styles = (theme: Theme) =>
  css({
    ".toolbar": {
      display: "flex",
      flexDirection: "column",
      width: "280px",
      minWidth: "280px",
      backgroundColor: theme.vars.palette.grey[900],
      borderRight: `1px solid ${theme.vars.palette.grey[800]}`,
      height: "100%",
      overflow: "auto"
    },
    ".toolbar-section": {
      padding: "12px",
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`
    },
    ".toolbar-section:last-child": {
      borderBottom: "none"
    },
    ".section-title": {
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      color: theme.vars.palette.grey[500],
      marginBottom: "8px",
      letterSpacing: "0.5px"
    },
    ".tools-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "4px"
    },
    ".tool-button": {
      aspectRatio: "1",
      borderRadius: "8px",
      backgroundColor: "transparent",
      border: `1px solid transparent`,
      color: theme.vars.palette.grey[400],
      transition: "all 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      },
      "&.active": {
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.contrastText,
        border: `1px solid ${theme.vars.palette.primary.light}`
      }
    },
    ".action-button": {
      borderRadius: "8px",
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
      transition: "all 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      },
      "&:disabled": {
        color: theme.vars.palette.grey[700]
      }
    },
    ".actions-row": {
      display: "flex",
      gap: "4px",
      flexWrap: "wrap"
    },
    ".slider-container": {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      marginBottom: "12px"
    },
    ".slider-label": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: "12px",
      color: theme.vars.palette.grey[400]
    },
    ".slider-value": {
      fontSize: "11px",
      color: theme.vars.palette.grey[500],
      fontFamily: "monospace"
    },
    ".color-picker-row": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "8px"
    },
    ".color-preview": {
      width: "32px",
      height: "32px",
      borderRadius: "6px",
      border: `2px solid ${theme.vars.palette.grey[700]}`,
      cursor: "pointer",
      transition: "border-color 0.15s ease",
      "&:hover": {
        borderColor: theme.vars.palette.grey[500]
      }
    },
    ".color-input": {
      flex: 1,
      backgroundColor: theme.vars.palette.grey[800],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: "6px",
      padding: "6px 10px",
      color: theme.vars.palette.text.primary,
      fontSize: "12px",
      fontFamily: "monospace",
      outline: "none",
      "&:focus": {
        borderColor: theme.vars.palette.primary.main
      }
    },
    ".zoom-controls": {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    ".zoom-value": {
      fontSize: "12px",
      color: theme.vars.palette.grey[400],
      minWidth: "45px",
      textAlign: "center",
      fontFamily: "monospace"
    },
    ".crop-actions": {
      display: "flex",
      gap: "8px",
      marginTop: "8px"
    },
    ".crop-action-button": {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "4px",
      padding: "8px",
      borderRadius: "6px",
      fontSize: "12px",
      fontWeight: 500,
      cursor: "pointer",
      transition: "all 0.15s ease"
    },
    ".crop-apply": {
      backgroundColor: theme.vars.palette.success.main,
      color: theme.vars.palette.success.contrastText,
      border: "none",
      "&:hover": {
        backgroundColor: theme.vars.palette.success.dark
      }
    },
    ".crop-cancel": {
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      }
    }
  });

interface ImageEditorToolbarProps {
  tool: EditTool;
  brushSettings: BrushSettings;
  adjustments: AdjustmentSettings;
  zoom: number;
  isCropping: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: EditTool) => void;
  onBrushSettingsChange: (settings: Partial<BrushSettings>) => void;
  onAdjustmentsChange: (adjustments: Partial<AdjustmentSettings>) => void;
  onAction: (action: EditAction) => void;
  onZoomChange: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

const ImageEditorToolbar: React.FC<ImageEditorToolbarProps> = ({
  tool,
  brushSettings,
  adjustments,
  zoom,
  isCropping,
  canUndo,
  canRedo,
  onToolChange,
  onBrushSettingsChange,
  onAdjustmentsChange,
  onAction,
  onZoomChange,
  onUndo,
  onRedo
}) => {
  const theme = useTheme();

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onBrushSettingsChange({ color: e.target.value });
    },
    [onBrushSettingsChange]
  );

  const handleToolSelect = useCallback(
    (newTool: EditTool) => () => {
      onToolChange(newTool);
    },
    [onToolChange]
  );

  const handleActionClick = useCallback(
    (action: EditAction) => () => {
      onAction(action);
    },
    [onAction]
  );

  const handleApplyCrop = useCallback(() => handleActionClick("apply-crop"), [handleActionClick]);
  const handleCancelCrop = useCallback(() => handleActionClick("cancel-crop"), [handleActionClick]);

  const handleRotateCCW = useCallback(() => handleActionClick("rotate-ccw"), [handleActionClick]);
  const handleRotateCW = useCallback(() => handleActionClick("rotate-cw"), [handleActionClick]);
  const handleFlipH = useCallback(() => handleActionClick("flip-h"), [handleActionClick]);
  const handleFlipV = useCallback(() => handleActionClick("flip-v"), [handleActionClick]);
  const handleReset = useCallback(() => handleActionClick("reset"), [handleActionClick]);

  const handleZoomOut = useCallback(() => {
    onZoomChange(Math.max(0.1, zoom - 0.1));
  }, [onZoomChange, zoom]);

  const handleZoomIn = useCallback(() => {
    onZoomChange(Math.min(5, zoom + 0.1));
  }, [onZoomChange, zoom]);

  const handleZoomReset = useCallback(() => {
    onZoomChange(1);
  }, [onZoomChange]);

  const handleToolClick = useCallback(
    (newTool: EditTool) => {
      handleToolSelect(newTool);
    },
    [handleToolSelect]
  );

  return (
    <div css={styles(theme)}>
      <div className="toolbar">
        {/* Tools Section */}
        <div className="toolbar-section">
          <Typography className="section-title">Tools</Typography>
          <div className="tools-grid">
            <Tooltip title="Select / Pan" placement="top">
              <IconButton
                className={`tool-button ${tool === "select" ? "active" : ""}`}
                onClick={() => handleToolClick("select")}
                size="small"
              >
                <PanToolIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Crop" placement="top">
              <IconButton
                className={`tool-button ${tool === "crop" ? "active" : ""}`}
                onClick={() => handleToolClick("crop")}
                size="small"
              >
                <CropIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Draw / Paint" placement="top">
              <IconButton
                className={`tool-button ${tool === "draw" ? "active" : ""}`}
                onClick={() => handleToolClick("draw")}
                size="small"
              >
                <BrushIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Erase" placement="top">
              <IconButton
                className={`tool-button ${tool === "erase" ? "active" : ""}`}
                onClick={() => handleToolClick("erase")}
                size="small"
              >
                <AutoFixHighIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        </div>

        {/* Crop Actions (shown when crop tool is active) */}
        {isCropping && (
          <div className="toolbar-section">
            <Typography className="section-title">Crop Selection</Typography>
            <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: "block" }}>
              Drag on the image to select crop area
            </Typography>
            <div className="crop-actions">
              <button
                className="crop-action-button crop-apply"
                onClick={handleApplyCrop}
              >
                <CheckIcon fontSize="small" /> Apply
              </button>
              <button
                className="crop-action-button crop-cancel"
                onClick={handleCancelCrop}
              >
                <CloseIcon fontSize="small" /> Cancel
              </button>
            </div>
          </div>
        )}

        {/* Brush Settings (shown when draw/erase tool is active) */}
        {(tool === "draw" || tool === "erase") && (
          <div className="toolbar-section">
            <Typography className="section-title">Brush Settings</Typography>

            <div className="color-picker-row">
              <input
                type="color"
                value={brushSettings.color}
                onChange={handleColorChange}
                className="color-preview"
                style={{ backgroundColor: brushSettings.color }}
              />
              <input
                type="text"
                value={brushSettings.color}
                onChange={handleColorChange}
                className="color-input"
                maxLength={7}
              />
            </div>

            <div className="slider-container">
              <div className="slider-label">
                <span>Size</span>
                <span className="slider-value">{brushSettings.size}px</span>
              </div>
              <Slider
                value={brushSettings.size}
                onChange={(_, value) =>
                  onBrushSettingsChange({ size: value as number })
                }
                min={1}
                max={100}
                size="small"
              />
            </div>

            <div className="slider-container">
              <div className="slider-label">
                <span>Opacity</span>
                <span className="slider-value">
                  {Math.round(brushSettings.opacity * 100)}%
                </span>
              </div>
              <Slider
                value={brushSettings.opacity}
                onChange={(_, value) =>
                  onBrushSettingsChange({ opacity: value as number })
                }
                min={0}
                max={1}
                step={0.01}
                size="small"
              />
            </div>
          </div>
        )}

        {/* Transform Actions */}
        <div className="toolbar-section">
          <Typography className="section-title">Transform</Typography>
          <div className="actions-row">
            <Tooltip title="Rotate 90° CCW">
              <IconButton
                className="action-button"
                onClick={handleRotateCCW}
                size="small"
              >
                <Rotate90DegreesCcwIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Rotate 90° CW">
              <IconButton
                className="action-button"
                onClick={handleRotateCW}
                size="small"
              >
                <Rotate90DegreesCwIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Flip Horizontal">
              <IconButton
                className="action-button"
                onClick={handleFlipH}
                size="small"
              >
                <FlipIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Flip Vertical">
              <IconButton
                className="action-button"
                onClick={handleFlipV}
                size="small"
              >
                <FlipIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        </div>

        {/* Adjustments */}
        <div className="toolbar-section">
          <Typography className="section-title">Adjustments</Typography>

          <div className="slider-container">
            <div className="slider-label">
              <span>Brightness</span>
              <span className="slider-value">{adjustments.brightness}</span>
            </div>
            <Slider
              value={adjustments.brightness}
              onChange={(_, value) =>
                onAdjustmentsChange({ brightness: value as number })
              }
              min={-100}
              max={100}
              size="small"
            />
          </div>

          <div className="slider-container">
            <div className="slider-label">
              <span>Contrast</span>
              <span className="slider-value">{adjustments.contrast}</span>
            </div>
            <Slider
              value={adjustments.contrast}
              onChange={(_, value) =>
                onAdjustmentsChange({ contrast: value as number })
              }
              min={-100}
              max={100}
              size="small"
            />
          </div>

          <div className="slider-container">
            <div className="slider-label">
              <span>Saturation</span>
              <span className="slider-value">{adjustments.saturation}</span>
            </div>
            <Slider
              value={adjustments.saturation}
              onChange={(_, value) =>
                onAdjustmentsChange({ saturation: value as number })
              }
              min={-100}
              max={100}
              size="small"
            />
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="toolbar-section">
          <Typography className="section-title">View</Typography>
          <div className="zoom-controls">
            <IconButton
              className="action-button"
              onClick={handleZoomOut}
              size="small"
            >
              <ZoomOutIcon fontSize="small" />
            </IconButton>
            <span className="zoom-value">{Math.round(zoom * 100)}%</span>
            <IconButton
              className="action-button"
              onClick={handleZoomIn}
              size="small"
            >
              <ZoomInIcon fontSize="small" />
            </IconButton>
            <Tooltip title="Reset Zoom">
              <IconButton
                className="action-button"
                onClick={handleZoomReset}
                size="small"
              >
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        </div>

        {/* History */}
        <div className="toolbar-section">
          <Typography className="section-title">History</Typography>
          <div className="actions-row">
            <Tooltip title="Undo (Ctrl+Z)">
              <span>
                <IconButton
                  className="action-button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  size="small"
                >
                  <UndoIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Redo (Ctrl+Y)">
              <span>
                <IconButton
                  className="action-button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  size="small"
                >
                  <RedoIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Reset to Original">
              <IconButton
                className="action-button"
                onClick={handleReset}
                size="small"
              >
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(ImageEditorToolbar);
