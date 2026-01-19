/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  memo,
  useState,
  useCallback,
  useRef
} from "react";
import ReactDOM from "react-dom";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip, Typography, CircularProgress } from "@mui/material";

// Icons
import CloseIcon from "@mui/icons-material/Close";
import SaveIcon from "@mui/icons-material/Save";
import DownloadIcon from "@mui/icons-material/Download";

import { useCombo } from "../../../stores/KeyPressedStore";
import ImageEditorToolbar from "./ImageEditorToolbar";
import ImageEditorCanvas, { ImageEditorCanvasRef } from "./ImageEditorCanvas";
import {
  rotateImage,
  flipImage,
  cropCanvas,
  canvasToBlob,
  canvasToDataUrl,
  applyAdjustments,
  mergeCanvases
} from "./canvasUtils";
import type {
  EditTool,
  EditAction,
  BrushSettings,
  AdjustmentSettings,
  CropRegion,
  Point,
  HistoryEntry
} from "./types";
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_ADJUSTMENTS
} from "./types";

const styles = (theme: Theme) =>
  css({
    ".modal-overlay": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      backdropFilter: "blur(8px)",
      zIndex: 10000,
      display: "flex",
      flexDirection: "column",
      height: "100%",
      width: "100%"
    },
    ".modal-body": {
      display: "flex",
      flex: 1,
      overflow: "hidden"
    },
    ".editor-area": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    },
    ".modal-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      backgroundColor: theme.vars.palette.grey[900],
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`
    },
    ".modal-title": {
      display: "flex",
      alignItems: "center",
      gap: "12px"
    },
    ".title-text": {
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    ".title-badge": {
      fontSize: "11px",
      padding: "2px 8px",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText
    },
    ".header-actions": {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    ".header-button": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 12px",
      borderRadius: "6px",
      fontSize: "13px",
      fontWeight: 500,
      cursor: "pointer",
      transition: "all 0.15s ease"
    },
    ".button-secondary": {
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        borderColor: theme.vars.palette.grey[600],
        color: theme.vars.palette.text.primary
      }
    },
     ".button-primary": {
       backgroundColor: theme.vars.palette.primary.main,
       color: theme.vars.palette.primary.contrastText,
       border: "none",
       "&:hover": {
         backgroundColor: theme.vars.palette.primary.dark
       },
       "&:disabled": {
         backgroundColor: theme.vars.palette.grey[700],
         color: theme.vars.palette.grey[500],
         cursor: "not-allowed"
       }
     },
     ".loading-overlay": {
       position: "absolute",
       top: 0,
       left: 0,
       right: 0,
       bottom: 0,
       display: "flex",
       alignItems: "center",
       justifyContent: "center",
       backgroundColor: "rgba(0, 0, 0, 0.7)",
       zIndex: 100
     }
   });

interface ImageEditorModalProps {
  imageUrl: string;
  onSave: (editedImageUrl: string, blob: Blob) => void;
  onClose: () => void;
  title?: string;
}

const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  imageUrl,
  onSave,
  onClose,
  title = "Image Editor"
}) => {
  const theme = useTheme();
  const canvasRef = useRef<ImageEditorCanvasRef>(null);

  // Editor state
  const [tool, setTool] = useState<EditTool>("select");
  const [brushSettings, setBrushSettings] = useState<BrushSettings>(DEFAULT_BRUSH_SETTINGS);
  const [adjustments, setAdjustments] = useState<AdjustmentSettings>(DEFAULT_ADJUSTMENTS);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [cropRegion, setCropRegion] = useState<CropRegion | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // History for undo/redo
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Handle escape key
  useCombo(["escape"], onClose);

  // Handle undo
  useCombo(["ctrl", "z"], useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      // Apply history state
      const entry = history[historyIndex - 1];
      if (entry && canvasRef.current) {
        const imageCanvas = canvasRef.current.getImageCanvas();
        if (imageCanvas) {
          const ctx = imageCanvas.getContext("2d");
          if (ctx) {
            ctx.putImageData(entry.imageData, 0, 0);
          }
        }
      }
    }
  }, [history, historyIndex]));

  // Handle redo
  useCombo(["ctrl", "y"], useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      const entry = history[historyIndex + 1];
      if (entry && canvasRef.current) {
        const imageCanvas = canvasRef.current.getImageCanvas();
        if (imageCanvas) {
          const ctx = imageCanvas.getContext("2d");
          if (ctx) {
            ctx.putImageData(entry.imageData, 0, 0);
          }
        }
      }
    }
  }, [history, historyIndex]));

  // Save current state to history
  const saveToHistory = useCallback((action: string) => {
    if (!canvasRef.current) {return;}

    const imageCanvas = canvasRef.current.getImageCanvas();
    const drawingCanvas = canvasRef.current.getDrawingCanvas();

    if (!imageCanvas) {return;}

    // Merge canvases to get complete state
    let finalCanvas = imageCanvas;
    if (drawingCanvas) {
      finalCanvas = mergeCanvases(imageCanvas, drawingCanvas);
    }

    const ctx = finalCanvas.getContext("2d");
    if (!ctx) {return;}

    const imageData = ctx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);

    // Truncate future history if we're not at the end
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ imageData, action });

    // Limit history to 50 entries
    if (newHistory.length > 50) {
      newHistory.shift();
    }

    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Handle tool change
  const handleToolChange = useCallback((newTool: EditTool) => {
    if (newTool === "crop" && tool !== "crop") {
      setIsCropping(true);
      setCropRegion(null);
    } else if (newTool !== "crop" && tool === "crop") {
      setIsCropping(false);
      setCropRegion(null);
    }
    setTool(newTool);
  }, [tool]);

  // Handle brush settings change
  const handleBrushSettingsChange = useCallback(
    (settings: Partial<BrushSettings>) => {
      setBrushSettings((prev) => ({ ...prev, ...settings }));
    },
    []
  );

  // Handle adjustments change
  const handleAdjustmentsChange = useCallback(
    (newAdjustments: Partial<AdjustmentSettings>) => {
      setAdjustments((prev) => ({ ...prev, ...newAdjustments }));
    },
    []
  );

  // Handle editor actions
  const handleAction = useCallback(
    (action: EditAction) => {
      if (!canvasRef.current) {return;}

      const imageCanvas = canvasRef.current.getImageCanvas();
      if (!imageCanvas) {return;}

      switch (action) {
        case "rotate-cw": {
          const rotated = rotateImage(imageCanvas, 90);
          const ctx = imageCanvas.getContext("2d");
          if (ctx) {
            imageCanvas.width = rotated.width;
            imageCanvas.height = rotated.height;
            ctx.drawImage(rotated, 0, 0);
            saveToHistory("Rotate CW");
          }
          break;
        }

        case "rotate-ccw": {
          const rotated = rotateImage(imageCanvas, -90);
          const ctx = imageCanvas.getContext("2d");
          if (ctx) {
            imageCanvas.width = rotated.width;
            imageCanvas.height = rotated.height;
            ctx.drawImage(rotated, 0, 0);
            saveToHistory("Rotate CCW");
          }
          break;
        }

        case "flip-h": {
          const flipped = flipImage(imageCanvas, true);
          const ctx = imageCanvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
            ctx.drawImage(flipped, 0, 0);
            saveToHistory("Flip Horizontal");
          }
          break;
        }

        case "flip-v": {
          const flipped = flipImage(imageCanvas, false);
          const ctx = imageCanvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
            ctx.drawImage(flipped, 0, 0);
            saveToHistory("Flip Vertical");
          }
          break;
        }

        case "apply-crop": {
          if (cropRegion && cropRegion.width > 0 && cropRegion.height > 0) {
            const cropped = cropCanvas(imageCanvas, cropRegion);
            const ctx = imageCanvas.getContext("2d");
            if (ctx) {
              imageCanvas.width = cropped.width;
              imageCanvas.height = cropped.height;
              ctx.drawImage(cropped, 0, 0);
              saveToHistory("Crop");
            }
            setIsCropping(false);
            setCropRegion(null);
            setTool("select");
            canvasRef.current?.refresh();
          }
          break;
        }

        case "cancel-crop":
          setIsCropping(false);
          setCropRegion(null);
          setTool("select");
          break;

        case "reset":
          canvasRef.current.resetToOriginal();
          setAdjustments(DEFAULT_ADJUSTMENTS);
          setPan({ x: 0, y: 0 });
          setZoom(1);
          setHistory([]);
          setHistoryIndex(-1);
          break;
      }
    },
    [cropRegion, saveToHistory]
  );

  // Handle zoom change
  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  // Handle pan change
  const handlePanChange = useCallback((newPan: Point) => {
    setPan(newPan);
  }, []);

  // Handle image change (for history tracking)
  const handleImageChange = useCallback(() => {
    saveToHistory("Draw");
  }, [saveToHistory]);

  // Handle undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0 && canvasRef.current) {
      const entry = history[historyIndex - 1];
      const imageCanvas = canvasRef.current.getImageCanvas();
      if (entry && imageCanvas) {
        const ctx = imageCanvas.getContext("2d");
        if (ctx) {
          imageCanvas.width = entry.imageData.width;
          imageCanvas.height = entry.imageData.height;
          ctx.putImageData(entry.imageData, 0, 0);
          setHistoryIndex(historyIndex - 1);
        }
      }
    }
  }, [history, historyIndex]);

  // Handle redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1 && canvasRef.current) {
      const entry = history[historyIndex + 1];
      const imageCanvas = canvasRef.current.getImageCanvas();
      if (entry && imageCanvas) {
        const ctx = imageCanvas.getContext("2d");
        if (ctx) {
          imageCanvas.width = entry.imageData.width;
          imageCanvas.height = entry.imageData.height;
          ctx.putImageData(entry.imageData, 0, 0);
          setHistoryIndex(historyIndex + 1);
        }
      }
    }
  }, [history, historyIndex]);

  // Handle download
  const handleDownload = useCallback(async () => {
    if (!canvasRef.current) {return;}

    const imageCanvas = canvasRef.current.getImageCanvas();
    const drawingCanvas = canvasRef.current.getDrawingCanvas();

    if (!imageCanvas) {return;}

    // Create final canvas with adjustments applied
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = imageCanvas.width;
    finalCanvas.height = imageCanvas.height;
    const ctx = finalCanvas.getContext("2d");

    if (!ctx) {return;}

    // Draw image
    ctx.drawImage(imageCanvas, 0, 0);

    // Apply adjustments
    if (
      adjustments.brightness !== 0 ||
      adjustments.contrast !== 0 ||
      adjustments.saturation !== 0
    ) {
      const imageData = ctx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
      const adjusted = applyAdjustments(imageData, adjustments);
      ctx.putImageData(adjusted, 0, 0);
    }

    // Draw drawing layer
    if (drawingCanvas) {
      ctx.drawImage(drawingCanvas, 0, 0);
    }

    // Download
    const dataUrl = canvasToDataUrl(finalCanvas);
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `edited-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [adjustments]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!canvasRef.current) {return;}

    setIsSaving(true);

    try {
      const imageCanvas = canvasRef.current.getImageCanvas();
      const drawingCanvas = canvasRef.current.getDrawingCanvas();

      if (!imageCanvas) {
        throw new Error("No image canvas");
      }

      // Create final canvas with adjustments applied
      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = imageCanvas.width;
      finalCanvas.height = imageCanvas.height;
      const ctx = finalCanvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      // Draw image
      ctx.drawImage(imageCanvas, 0, 0);

      // Apply adjustments
      if (
        adjustments.brightness !== 0 ||
        adjustments.contrast !== 0 ||
        adjustments.saturation !== 0
      ) {
        const imageData = ctx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
        const adjusted = applyAdjustments(imageData, adjustments);
        ctx.putImageData(adjusted, 0, 0);
      }

      // Draw drawing layer
      if (drawingCanvas) {
        ctx.drawImage(drawingCanvas, 0, 0);
      }

      // Get blob and data URL
      const blob = await canvasToBlob(finalCanvas);
      const dataUrl = canvasToDataUrl(finalCanvas);

      onSave(dataUrl, blob);
    } catch (error) {
      console.error("Failed to save image:", error);
    } finally {
      setIsSaving(false);
    }
  }, [adjustments, onSave]);

  // Calculate if we can undo/redo
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const content = (
    <div css={styles(theme)}>
      <div className="modal-overlay">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <Typography className="title-text">{title}</Typography>
            <span className="title-badge">Beta</span>
          </div>
          <div className="header-actions">
            <Tooltip title="Download">
              <button
                className="header-button button-secondary"
                onClick={handleDownload}
              >
                <DownloadIcon fontSize="small" />
                Download
              </button>
            </Tooltip>
            <Tooltip title="Save and Apply">
              <button
                className="header-button button-primary"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <SaveIcon fontSize="small" />
                )}
                Save
              </button>
            </Tooltip>
            <Tooltip title="Close (Esc)">
              <IconButton size="small" onClick={onClose}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Toolbar */}
          <ImageEditorToolbar
            tool={tool}
            brushSettings={brushSettings}
            adjustments={adjustments}
            zoom={zoom}
            isCropping={isCropping}
            canUndo={canUndo}
            canRedo={canRedo}
            onToolChange={handleToolChange}
            onBrushSettingsChange={handleBrushSettingsChange}
            onAdjustmentsChange={handleAdjustmentsChange}
            onAction={handleAction}
            onZoomChange={handleZoomChange}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />

          {/* Canvas Area */}
          <div className="editor-area">
            <ImageEditorCanvas
              ref={canvasRef}
              imageUrl={imageUrl}
              tool={tool}
              brushSettings={brushSettings}
              adjustments={adjustments}
              zoom={zoom}
              pan={pan}
              cropRegion={cropRegion}
              isCropping={isCropping}
              onZoomChange={handleZoomChange}
              onPanChange={handlePanChange}
              onCropRegionChange={setCropRegion}
              onImageChange={handleImageChange}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};

export default memo(ImageEditorModal);
