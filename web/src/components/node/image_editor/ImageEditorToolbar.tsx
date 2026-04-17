/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Slider,
  Checkbox,
  FormControlLabel
} from "@mui/material";
import { Text, Caption, ToolbarIconButton } from "../../ui_primitives";

// Icons
import PanToolIcon from "@mui/icons-material/PanTool";
import CropIcon from "@mui/icons-material/Crop";
import BrushIcon from "@mui/icons-material/Brush";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import FormatColorFillIcon from "@mui/icons-material/FormatColorFill";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import RectangleOutlinedIcon from "@mui/icons-material/RectangleOutlined";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import RemoveIcon from "@mui/icons-material/Remove";
import ArrowRightAltIcon from "@mui/icons-material/ArrowRightAlt";
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
  AdjustmentSettings,
  ShapeSettings,
  TextSettings
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
      borderRadius: "var(--rounded-lg)",
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
      borderRadius: "var(--rounded-lg)",
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
      borderRadius: "var(--rounded-md)",
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
      borderRadius: "var(--rounded-md)",
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
      borderRadius: "var(--rounded-md)",
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
  shapeSettings: ShapeSettings;
  textSettings: TextSettings;
  adjustments: AdjustmentSettings;
  zoom: number;
  isCropping: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: EditTool) => void;
  onBrushSettingsChange: (settings: Partial<BrushSettings>) => void;
  onShapeSettingsChange: (settings: Partial<ShapeSettings>) => void;
  onTextSettingsChange: (settings: Partial<TextSettings>) => void;
  onAdjustmentsChange: (adjustments: Partial<AdjustmentSettings>) => void;
  onAction: (action: EditAction) => void;
  onZoomChange: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

const ImageEditorToolbar: React.FC<ImageEditorToolbarProps> = ({
  tool,
  brushSettings,
  shapeSettings,
  textSettings,
  adjustments,
  zoom,
  isCropping,
  canUndo,
  canRedo,
  onToolChange,
  onBrushSettingsChange,
  onShapeSettingsChange,
  onTextSettingsChange,
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

  const handleApplyCrop = useCallback(() => handleActionClick("apply-crop")(), [handleActionClick]);
  const handleCancelCrop = useCallback(() => handleActionClick("cancel-crop")(), [handleActionClick]);

  const handleRotateCCW = useCallback(() => handleActionClick("rotate-ccw")(), [handleActionClick]);
  const handleRotateCW = useCallback(() => handleActionClick("rotate-cw")(), [handleActionClick]);
  const handleFlipH = useCallback(() => handleActionClick("flip-h")(), [handleActionClick]);
  const handleFlipV = useCallback(() => handleActionClick("flip-v")(), [handleActionClick]);
  const handleReset = useCallback(() => handleActionClick("reset")(), [handleActionClick]);

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
      handleToolSelect(newTool)();
    },
    [handleToolSelect]
  );

  const handleSelectTool = useCallback(
    (tool: EditTool) => () => {
      handleToolClick(tool);
    },
    [handleToolClick]
  );

  return (
    <div css={styles(theme)}>
      <div className="toolbar">
        {/* Tools Section */}
        <div className="toolbar-section">
          <Text className="section-title">Tools</Text>
          <div className="tools-grid">
            <ToolbarIconButton
              icon={<PanToolIcon fontSize="small" />}
              tooltip="Select / Pan (V)"
              tooltipPlacement="top"
              className="tool-button"
              active={tool === "select"}
              onClick={handleSelectTool("select")}
              ariaLabel="Select or Pan tool"
            />
            <ToolbarIconButton
              icon={<CropIcon fontSize="small" />}
              tooltip="Crop (C)"
              tooltipPlacement="top"
              className="tool-button"
              active={tool === "crop"}
              onClick={handleSelectTool("crop")}
              ariaLabel="Crop tool"
            />
            <ToolbarIconButton
              icon={<BrushIcon fontSize="small" />}
              tooltip="Draw / Paint (B)"
              tooltipPlacement="top"
              className="tool-button"
              active={tool === "draw"}
              onClick={handleSelectTool("draw")}
              ariaLabel="Draw or Paint tool"
            />
            <ToolbarIconButton
              icon={<AutoFixHighIcon fontSize="small" />}
              tooltip="Erase (E)"
              tooltipPlacement="top"
              className="tool-button"
              active={tool === "erase"}
              onClick={handleSelectTool("erase")}
              ariaLabel="Erase tool"
            />
            <ToolbarIconButton
              icon={<FormatColorFillIcon fontSize="small" />}
              tooltip="Fill (G)"
              tooltipPlacement="top"
              className="tool-button"
              active={tool === "fill"}
              onClick={handleSelectTool("fill")}
              ariaLabel="Fill tool"
            />
            <ToolbarIconButton
              icon={<TextFieldsIcon fontSize="small" />}
              tooltip="Text (T)"
              tooltipPlacement="top"
              className="tool-button"
              active={tool === "text"}
              onClick={handleSelectTool("text")}
              ariaLabel="Text tool"
            />
            <ToolbarIconButton
              icon={<RectangleOutlinedIcon fontSize="small" />}
              tooltip="Rectangle (R)"
              tooltipPlacement="top"
              className="tool-button"
              active={tool === "rectangle"}
              onClick={handleSelectTool("rectangle")}
              ariaLabel="Rectangle tool"
            />
            <ToolbarIconButton
              icon={<CircleOutlinedIcon fontSize="small" />}
              tooltip="Ellipse (O)"
              tooltipPlacement="top"
              className="tool-button"
              active={tool === "ellipse"}
              onClick={handleSelectTool("ellipse")}
              ariaLabel="Ellipse tool"
            />
            <ToolbarIconButton
              icon={<RemoveIcon fontSize="small" />}
              tooltip="Line (L)"
              tooltipPlacement="top"
              className="tool-button"
              active={tool === "line"}
              onClick={handleSelectTool("line")}
              ariaLabel="Line tool"
            />
            <ToolbarIconButton
              icon={<ArrowRightAltIcon fontSize="small" />}
              tooltip="Arrow (A)"
              tooltipPlacement="top"
              className="tool-button"
              active={tool === "arrow"}
              onClick={handleSelectTool("arrow")}
              ariaLabel="Arrow tool"
            />
          </div>
        </div>

        {/* Crop Actions (shown when crop tool is active) */}
        {isCropping && (
          <div className="toolbar-section">
            <Text className="section-title">Crop Selection</Text>
            <Caption sx={{ mb: 1, display: "block" }}>
              Drag on the image to select crop area
            </Caption>
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
            <Text className="section-title">Brush Settings</Text>

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

        {/* Fill Settings (shown when fill tool is active) */}
        {tool === "fill" && (
          <div className="toolbar-section">
            <Text className="section-title">Fill Settings</Text>
            <div className="color-picker-row">
              <input
                type="color"
                value={shapeSettings.fillColor}
                onChange={(e) => onShapeSettingsChange({ fillColor: e.target.value })}
                className="color-preview"
                style={{ backgroundColor: shapeSettings.fillColor }}
              />
              <input
                type="text"
                value={shapeSettings.fillColor}
                onChange={(e) => onShapeSettingsChange({ fillColor: e.target.value })}
                className="color-input"
                maxLength={7}
              />
            </div>
          </div>
        )}

        {/* Shape Settings (shown when shape tools are active) */}
        {(tool === "rectangle" || tool === "ellipse" || tool === "line" || tool === "arrow") && (
          <div className="toolbar-section">
            <Text className="section-title">Shape Settings</Text>

            <div className="color-picker-row">
              <input
                type="color"
                value={shapeSettings.strokeColor}
                onChange={(e) => onShapeSettingsChange({ strokeColor: e.target.value })}
                className="color-preview"
                style={{ backgroundColor: shapeSettings.strokeColor }}
              />
              <input
                type="text"
                value={shapeSettings.strokeColor}
                onChange={(e) => onShapeSettingsChange({ strokeColor: e.target.value })}
                className="color-input"
                maxLength={7}
              />
            </div>

            <div className="slider-container">
              <div className="slider-label">
                <span>Stroke Width</span>
                <span className="slider-value">{shapeSettings.strokeWidth}px</span>
              </div>
              <Slider
                value={shapeSettings.strokeWidth}
                onChange={(_, value) =>
                  onShapeSettingsChange({ strokeWidth: value as number })
                }
                min={1}
                max={20}
                size="small"
              />
            </div>

            {(tool === "rectangle" || tool === "ellipse") && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={shapeSettings.filled}
                    onChange={(e) => onShapeSettingsChange({ filled: e.target.checked })}
                    size="small"
                    sx={{ color: "grey.400" }}
                  />
                }
                label="Filled"
                sx={{
                  color: "grey.400",
                  "& .MuiTypography-root": { fontSize: "12px" }
                }}
              />
            )}

            {shapeSettings.filled && (tool === "rectangle" || tool === "ellipse") && (
              <div className="color-picker-row" style={{ marginTop: "8px" }}>
                <Caption sx={{ color: "grey.500", mr: 1, minWidth: "50px" }}>
                  Fill
                </Caption>
                <input
                  type="color"
                  value={shapeSettings.fillColor}
                  onChange={(e) => onShapeSettingsChange({ fillColor: e.target.value })}
                  className="color-preview"
                  style={{ backgroundColor: shapeSettings.fillColor, width: "24px", height: "24px" }}
                />
              </div>
            )}
          </div>
        )}

        {/* Text Settings (shown when text tool is active) */}
        {tool === "text" && (
          <div className="toolbar-section">
            <Text className="section-title">Text Settings</Text>

            <div className="color-picker-row">
              <input
                type="color"
                value={textSettings.color}
                onChange={(e) => onTextSettingsChange({ color: e.target.value })}
                className="color-preview"
                style={{ backgroundColor: textSettings.color }}
              />
              <input
                type="text"
                value={textSettings.color}
                onChange={(e) => onTextSettingsChange({ color: e.target.value })}
                className="color-input"
                maxLength={7}
              />
            </div>

            <div className="slider-container">
              <div className="slider-label">
                <span>Font Size</span>
                <span className="slider-value">{textSettings.fontSize}px</span>
              </div>
              <Slider
                value={textSettings.fontSize}
                onChange={(_, value) =>
                  onTextSettingsChange({ fontSize: value as number })
                }
                min={8}
                max={128}
                size="small"
              />
            </div>

            <FormControlLabel
              control={
                <Checkbox
                  checked={textSettings.bold}
                  onChange={(e) => onTextSettingsChange({ bold: e.target.checked })}
                  size="small"
                  sx={{ color: "grey.400" }}
                />
              }
              label="Bold"
              sx={{
                color: "grey.400",
                "& .MuiTypography-root": { fontSize: "12px" }
              }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={textSettings.italic}
                  onChange={(e) => onTextSettingsChange({ italic: e.target.checked })}
                  size="small"
                  sx={{ color: "grey.400" }}
                />
              }
              label="Italic"
              sx={{
                color: "grey.400",
                "& .MuiTypography-root": { fontSize: "12px" }
              }}
            />
          </div>
        )}

        {/* Transform Actions */}
        <div className="toolbar-section">
          <Text className="section-title">Transform</Text>
          <div className="actions-row">
            <ToolbarIconButton
              icon={<Rotate90DegreesCcwIcon fontSize="small" />}
              tooltip="Rotate 90° CCW"
              className="action-button"
              onClick={handleRotateCCW}
              ariaLabel="Rotate 90 degrees counter-clockwise"
            />
            <ToolbarIconButton
              icon={<Rotate90DegreesCwIcon fontSize="small" />}
              tooltip="Rotate 90° CW"
              className="action-button"
              onClick={handleRotateCW}
              ariaLabel="Rotate 90 degrees clockwise"
            />
            <ToolbarIconButton
              icon={<FlipIcon fontSize="small" />}
              tooltip="Flip Horizontal"
              className="action-button"
              onClick={handleFlipH}
              ariaLabel="Flip image horizontally"
            />
            <ToolbarIconButton
              icon={<FlipIcon fontSize="small" />}
              tooltip="Flip Vertical"
              className="action-button"
              onClick={handleFlipV}
              ariaLabel="Flip image vertically"
            />
          </div>
        </div>

        {/* Adjustments */}
        <div className="toolbar-section">
          <Text className="section-title">Adjustments</Text>

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
          <Text className="section-title">View</Text>
          <div className="zoom-controls">
            <ToolbarIconButton
              icon={<ZoomOutIcon fontSize="small" />}
              tooltip="Zoom out"
              className="action-button"
              onClick={handleZoomOut}
              ariaLabel="Zoom out"
            />
            <span className="zoom-value">{Math.round(zoom * 100)}%</span>
            <ToolbarIconButton
              icon={<ZoomInIcon fontSize="small" />}
              tooltip="Zoom in"
              className="action-button"
              onClick={handleZoomIn}
              ariaLabel="Zoom in"
            />
            <ToolbarIconButton
              icon={<RestartAltIcon fontSize="small" />}
              tooltip="Reset Zoom"
              className="action-button"
              onClick={handleZoomReset}
              ariaLabel="Reset zoom to 100%"
            />
          </div>
        </div>

        {/* History */}
        <div className="toolbar-section">
          <Text className="section-title">History</Text>
          <div className="actions-row">
            <ToolbarIconButton
              icon={<UndoIcon fontSize="small" />}
              tooltip="Undo (Ctrl+Z)"
              className="action-button"
              onClick={onUndo}
              disabled={!canUndo}
              ariaLabel="Undo last action"
            />
            <ToolbarIconButton
              icon={<RedoIcon fontSize="small" />}
              tooltip="Redo (Ctrl+Y)"
              className="action-button"
              onClick={onRedo}
              disabled={!canRedo}
              ariaLabel="Redo last action"
            />
            <ToolbarIconButton
              icon={<RestartAltIcon fontSize="small" />}
              tooltip="Reset to Original"
              className="action-button"
              onClick={handleReset}
              ariaLabel="Reset image to original"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(ImageEditorToolbar);
