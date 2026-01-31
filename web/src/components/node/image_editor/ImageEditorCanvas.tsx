/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
  memo
} from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import type {
  EditTool,
  Point,
  CropRegion,
  BrushSettings,
  AdjustmentSettings,
  ShapeSettings,
  TextSettings
} from "./types";
import {
  loadImage,
  canvasToImageCoords,
  drawCropOverlay,
  applyAdjustments,
  floodFill,
  drawShape,
  drawArrow
} from "./canvasUtils";

const styles = (theme: Theme) =>
  css({
    ".canvas-container": {
      flex: 1,
      position: "relative",
      overflow: "hidden",
      backgroundColor: "#1a1a1a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".main-canvas": {
      position: "absolute",
      cursor: "default",
      "&.tool-select": {
        cursor: "grab"
      },
      "&.tool-select.dragging": {
        cursor: "grabbing"
      },
      "&.tool-crop": {
        cursor: "crosshair"
      },
      "&.tool-draw, &.tool-erase": {
        cursor: "crosshair"
      },
      "&.tool-fill": {
        cursor: "crosshair"
      },
      "&.tool-text": {
        cursor: "text"
      },
      "&.tool-rectangle, &.tool-ellipse, &.tool-line, &.tool-arrow": {
        cursor: "crosshair"
      }
    },
    ".overlay-canvas": {
      position: "absolute",
      pointerEvents: "none"
    },
    ".image-info": {
      position: "absolute",
      bottom: "12px",
      left: "12px",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      padding: "6px 12px",
      borderRadius: "6px",
      fontSize: "11px",
      color: theme.vars.palette.grey[400],
      display: "flex",
      gap: "16px"
    },
    ".text-input": {
      position: "absolute",
      background: "transparent",
      border: "1px dashed rgba(255, 255, 255, 0.5)",
      outline: "none",
      color: "#ffffff",
      minWidth: "100px",
      padding: "4px",
      fontFamily: "inherit",
      resize: "none"
    }
  });

export interface ImageEditorCanvasRef {
  getImageCanvas: () => HTMLCanvasElement | null;
  getDrawingCanvas: () => HTMLCanvasElement | null;
  resetToOriginal: () => void;
  refresh: () => void;
}

interface ImageEditorCanvasProps {
  imageUrl: string;
  tool: EditTool;
  brushSettings: BrushSettings;
  shapeSettings: ShapeSettings;
  textSettings: TextSettings;
  adjustments: AdjustmentSettings;
  zoom: number;
  pan: Point;
  cropRegion: CropRegion | null;
  isCropping: boolean;
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: Point) => void;
  onCropRegionChange: (region: CropRegion | null) => void;
  onImageChange: () => void;
}

const ImageEditorCanvas = forwardRef<ImageEditorCanvasRef, ImageEditorCanvasProps>(
  (
    {
      imageUrl,
      tool,
      brushSettings,
      shapeSettings,
      textSettings,
      adjustments,
      zoom,
      pan,
      cropRegion,
      isCropping,
      onZoomChange,
      onPanChange,
      onCropRegionChange,
      onImageChange
    },
    ref
  ) => {
    const theme = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const mainCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const originalImageRef = useRef<HTMLImageElement | null>(null);

    const [isMouseDown, setIsMouseDown] = useState(false);
    const [lastPoint, setLastPoint] = useState<Point | null>(null);
    const [dragStart, setDragStart] = useState<Point | null>(null);
    const [cropStart, setCropStart] = useState<Point | null>(null);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    // Shape drawing state
    const [shapeStart, setShapeStart] = useState<Point | null>(null);
    const [shapeEnd, setShapeEnd] = useState<Point | null>(null);
    // Text input state
    const [textInputPos, setTextInputPos] = useState<Point | null>(null);
    const [textInputValue, setTextInputValue] = useState("");
    const textInputRef = useRef<HTMLTextAreaElement>(null);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
      getImageCanvas: () => imageCanvasRef.current,
      getDrawingCanvas: () => drawingCanvasRef.current,
      resetToOriginal: () => {
        if (originalImageRef.current && imageCanvasRef.current) {
          const ctx = imageCanvasRef.current.getContext("2d");
          if (ctx) {
            const img = originalImageRef.current;
            imageCanvasRef.current.width = img.width;
            imageCanvasRef.current.height = img.height;
            ctx.drawImage(img, 0, 0);
            setImageSize({ width: img.width, height: img.height });

            // Clear drawing canvas
            if (drawingCanvasRef.current) {
              const drawCtx = drawingCanvasRef.current.getContext("2d");
              if (drawCtx) {
                drawingCanvasRef.current.width = img.width;
                drawingCanvasRef.current.height = img.height;
                drawCtx.clearRect(0, 0, img.width, img.height);
              }
            }

            onImageChange();
          }
        }
      },
      refresh: () => {
        if (imageCanvasRef.current) {
          setImageSize({
            width: imageCanvasRef.current.width,
            height: imageCanvasRef.current.height
          });
        }
        render();
      }
    }));

    // Main render function
    const render = useCallback(() => {
      if (
        !mainCanvasRef.current ||
        !overlayCanvasRef.current ||
        !imageCanvasRef.current
      ) {
        return;
      }

      const mainCtx = mainCanvasRef.current.getContext("2d");
      const overlayCtx = overlayCanvasRef.current.getContext("2d");

      if (!mainCtx || !overlayCtx) {return;}

      const canvas = mainCanvasRef.current;
      const imgCanvas = imageCanvasRef.current;
      const drawCanvas = drawingCanvasRef.current;

      // Clear
      mainCtx.fillStyle = "#1a1a1a";
      mainCtx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply adjustments to a temp canvas for display
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = imgCanvas.width;
      tempCanvas.height = imgCanvas.height;
      const tempCtx = tempCanvas.getContext("2d");

      if (tempCtx) {
        tempCtx.drawImage(imgCanvas, 0, 0);

        // Apply adjustments if any
        if (
          adjustments.brightness !== 0 ||
          adjustments.contrast !== 0 ||
          adjustments.saturation !== 0
        ) {
          const imageData = tempCtx.getImageData(
            0,
            0,
            tempCanvas.width,
            tempCanvas.height
          );
          const adjustedData = applyAdjustments(imageData, adjustments);
          tempCtx.putImageData(adjustedData, 0, 0);
        }

        // Draw the drawing layer on top
        if (drawCanvas) {
          tempCtx.drawImage(drawCanvas, 0, 0);
        }
      }

      // Calculate centered position with zoom and pan
      const scaledWidth = imgCanvas.width * zoom;
      const scaledHeight = imgCanvas.height * zoom;
      const x = (canvas.width - scaledWidth) / 2 + pan.x;
      const y = (canvas.height - scaledHeight) / 2 + pan.y;

      // Draw temp canvas
      mainCtx.drawImage(tempCanvas, x, y, scaledWidth, scaledHeight);

      // Clear overlay
      overlayCtx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw crop overlay if cropping
      if (isCropping && cropRegion) {
        drawCropOverlay(
          overlayCtx,
          canvas,
          cropRegion,
          imgCanvas.width,
          imgCanvas.height,
          zoom,
          pan
        );
      }
    }, [zoom, pan, adjustments, isCropping, cropRegion]);

    // Update canvas size on resize
    const updateCanvasSize = useCallback(() => {
      if (!containerRef.current || !mainCanvasRef.current || !overlayCanvasRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      mainCanvasRef.current.width = rect.width;
      mainCanvasRef.current.height = rect.height;
      overlayCanvasRef.current.width = rect.width;
      overlayCanvasRef.current.height = rect.height;

      // Redraw
      render();
    }, [render]);

    // Initialize canvases and load image
    useEffect(() => {
      const initCanvas = async () => {
        if (!imageUrl) {
          return;
        }

        // Wait for container to be attached to DOM
        const waitForContainer = () => {
          return new Promise<HTMLDivElement>((resolve) => {
            let attempts = 0;
            const maxAttempts = 100;
            const check = () => {
              attempts++;
              const container = containerRef.current;
              if (container) {
                const rect = container.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  resolve(container);
                  return;
                }
              }
              if (attempts >= maxAttempts) {
                // Fallback: use a default size
                if (containerRef.current && mainCanvasRef.current && overlayCanvasRef.current) {
                  const container = containerRef.current;
                  container.style.width = "800px";
                  container.style.height = "600px";
                  mainCanvasRef.current.width = 800;
                  mainCanvasRef.current.height = 600;
                  overlayCanvasRef.current.width = 800;
                  overlayCanvasRef.current.height = 600;
                  resolve(container);
                }
                return;
              }
              requestAnimationFrame(check);
            };
            check();
          });
        };

        try {
          const container = await waitForContainer();
          const rect = container.getBoundingClientRect();

          // Set main canvas sizes first
          if (mainCanvasRef.current && overlayCanvasRef.current) {
            mainCanvasRef.current.width = rect.width;
            mainCanvasRef.current.height = rect.height;
            overlayCanvasRef.current.width = rect.width;
            overlayCanvasRef.current.height = rect.height;
          }

          // Now load the image
          const img = await loadImage(imageUrl);
          originalImageRef.current = img;

          // Create image canvas (working copy)
          const imageCanvas = document.createElement("canvas");
          imageCanvas.width = img.width;
          imageCanvas.height = img.height;
          const imgCtx = imageCanvas.getContext("2d");
          if (imgCtx) {
            imgCtx.drawImage(img, 0, 0);
          }
          imageCanvasRef.current = imageCanvas;

          // Create drawing canvas
          const drawingCanvas = document.createElement("canvas");
          drawingCanvas.width = img.width;
          drawingCanvas.height = img.height;
          drawingCanvasRef.current = drawingCanvas;

          setImageSize({ width: img.width, height: img.height });

          // Render the image
          render();
        } catch (error) {
          console.error("Failed to load image:", error);
        }
      };

      initCanvas();
    }, [imageUrl, render]);

    useEffect(() => {
      const handleResize = () => updateCanvasSize();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, [updateCanvasSize]);

    // Re-render when dependencies change
    useEffect(() => {
      render();
    }, [render]);

    // Get mouse position on canvas
    const getCanvasPoint = useCallback((e: React.MouseEvent): Point => {
      if (!mainCanvasRef.current) {return { x: 0, y: 0 };}
      const rect = mainCanvasRef.current.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }, []);

    // Get image coordinates from canvas point
    const getImagePoint = useCallback(
      (canvasPoint: Point): Point => {
        if (!mainCanvasRef.current || !imageCanvasRef.current) {
          return { x: 0, y: 0 };
        }
        return canvasToImageCoords(
          canvasPoint.x,
          canvasPoint.y,
          mainCanvasRef.current,
          imageCanvasRef.current.width,
          imageCanvasRef.current.height,
          zoom,
          pan
        );
      },
      [zoom, pan]
    );

    // Drawing functions
    const drawLine = useCallback(
      (from: Point, to: Point, erase: boolean = false) => {
        if (!drawingCanvasRef.current) {return;}
        const ctx = drawingCanvasRef.current.getContext("2d");
        if (!ctx) {return;}

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = brushSettings.size;

        if (erase) {
          ctx.globalCompositeOperation = "destination-out";
          ctx.globalAlpha = 1;
        } else {
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = brushSettings.opacity;
          ctx.strokeStyle = brushSettings.color;
        }

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();

        render();
      },
      [brushSettings, render]
    );

    // Mouse handlers
    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        setIsMouseDown(true);
        const canvasPoint = getCanvasPoint(e);
        const imagePoint = getImagePoint(canvasPoint);

        switch (tool) {
          case "select":
            setDragStart(canvasPoint);
            break;

          case "crop":
            setCropStart(imagePoint);
            onCropRegionChange({
              x: imagePoint.x,
              y: imagePoint.y,
              width: 0,
              height: 0
            });
            break;

          case "draw":
          case "erase":
            setLastPoint(imagePoint);
            // Draw a dot at the starting point
            drawLine(imagePoint, imagePoint, tool === "erase");
            break;

          case "fill":
            // Perform flood fill at the clicked point
            if (imageCanvasRef.current && drawingCanvasRef.current) {
              // Merge image and drawing canvas for fill operation
              const mergedCanvas = document.createElement("canvas");
              mergedCanvas.width = imageCanvasRef.current.width;
              mergedCanvas.height = imageCanvasRef.current.height;
              const mergedCtx = mergedCanvas.getContext("2d");
              if (mergedCtx) {
                mergedCtx.drawImage(imageCanvasRef.current, 0, 0);
                mergedCtx.drawImage(drawingCanvasRef.current, 0, 0);
                
                const x = Math.floor(imagePoint.x);
                const y = Math.floor(imagePoint.y);
                if (x >= 0 && x < mergedCanvas.width && y >= 0 && y < mergedCanvas.height) {
                  floodFill(mergedCtx, x, y, shapeSettings.fillColor);
                  // Copy result to drawing canvas
                  const drawCtx = drawingCanvasRef.current.getContext("2d");
                  if (drawCtx) {
                    drawCtx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
                    drawCtx.drawImage(mergedCanvas, 0, 0);
                    // Clear image canvas and redraw original
                    const imgCtx = imageCanvasRef.current.getContext("2d");
                    if (imgCtx && originalImageRef.current) {
                      imgCtx.drawImage(originalImageRef.current, 0, 0);
                    }
                  }
                  render();
                  onImageChange();
                }
              }
            }
            break;

          case "text":
            // Show text input at clicked position
            setTextInputPos(canvasPoint);
            setTextInputValue("");
            // Focus will be handled in useEffect
            break;

          case "rectangle":
          case "ellipse":
          case "line":
          case "arrow":
            setShapeStart(imagePoint);
            setShapeEnd(imagePoint);
            break;
        }
      },
      [tool, getCanvasPoint, getImagePoint, drawLine, onCropRegionChange, shapeSettings.fillColor, render, onImageChange]
    );

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (!isMouseDown) {return;}

        const canvasPoint = getCanvasPoint(e);
        const imagePoint = getImagePoint(canvasPoint);

        switch (tool) {
          case "select":
            if (dragStart) {
              onPanChange({
                x: pan.x + (canvasPoint.x - dragStart.x),
                y: pan.y + (canvasPoint.y - dragStart.y)
              });
              setDragStart(canvasPoint);
            }
            break;

          case "crop":
            if (cropStart && imageCanvasRef.current) {
              const imgWidth = imageCanvasRef.current.width;
              const imgHeight = imageCanvasRef.current.height;

              // Clamp to image bounds
              const clampedX = Math.max(0, Math.min(imgWidth, imagePoint.x));
              const clampedY = Math.max(0, Math.min(imgHeight, imagePoint.y));

              const x = Math.min(cropStart.x, clampedX);
              const y = Math.min(cropStart.y, clampedY);
              const width = Math.abs(clampedX - cropStart.x);
              const height = Math.abs(clampedY - cropStart.y);

              onCropRegionChange({ x, y, width, height });
            }
            break;

          case "draw":
          case "erase":
            if (lastPoint) {
              drawLine(lastPoint, imagePoint, tool === "erase");
              setLastPoint(imagePoint);
            }
            break;

          case "rectangle":
          case "ellipse":
          case "line":
          case "arrow":
            if (shapeStart) {
              setShapeEnd(imagePoint);
              // Draw preview on overlay canvas
              if (overlayCanvasRef.current && mainCanvasRef.current && imageCanvasRef.current) {
                const overlayCtx = overlayCanvasRef.current.getContext("2d");
                if (overlayCtx) {
                  // Clear overlay
                  overlayCtx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
                  // Draw preview shape
                  drawShape(
                    overlayCtx,
                    tool as "rectangle" | "ellipse" | "line" | "arrow",
                    shapeStart,
                    imagePoint,
                    shapeSettings,
                    zoom,
                    pan,
                    mainCanvasRef.current,
                    imageCanvasRef.current.width,
                    imageCanvasRef.current.height
                  );
                }
              }
            }
            break;
        }
      },
      [
        isMouseDown,
        tool,
        dragStart,
        cropStart,
        lastPoint,
        shapeStart,
        pan,
        zoom,
        shapeSettings,
        getCanvasPoint,
        getImagePoint,
        drawLine,
        onPanChange,
        onCropRegionChange
      ]
    );

    const handleMouseUp = useCallback(() => {
      // Finalize shapes
      if ((tool === "rectangle" || tool === "ellipse" || tool === "line" || tool === "arrow") && 
          shapeStart && shapeEnd && drawingCanvasRef.current) {
        const drawCtx = drawingCanvasRef.current.getContext("2d");
        if (drawCtx) {
          // Draw the final shape on the drawing canvas (in image coordinates)
          drawCtx.save();
          drawCtx.strokeStyle = shapeSettings.strokeColor;
          drawCtx.lineWidth = shapeSettings.strokeWidth;
          drawCtx.lineCap = "round";
          drawCtx.lineJoin = "round";

          if (tool === "rectangle") {
            const x = Math.min(shapeStart.x, shapeEnd.x);
            const y = Math.min(shapeStart.y, shapeEnd.y);
            const w = Math.abs(shapeEnd.x - shapeStart.x);
            const h = Math.abs(shapeEnd.y - shapeStart.y);
            if (shapeSettings.filled) {
              drawCtx.fillStyle = shapeSettings.fillColor;
              drawCtx.fillRect(x, y, w, h);
            }
            drawCtx.strokeRect(x, y, w, h);
          } else if (tool === "ellipse") {
            const cx = (shapeStart.x + shapeEnd.x) / 2;
            const cy = (shapeStart.y + shapeEnd.y) / 2;
            const rx = Math.abs(shapeEnd.x - shapeStart.x) / 2;
            const ry = Math.abs(shapeEnd.y - shapeStart.y) / 2;
            drawCtx.beginPath();
            drawCtx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
            if (shapeSettings.filled) {
              drawCtx.fillStyle = shapeSettings.fillColor;
              drawCtx.fill();
            }
            drawCtx.stroke();
          } else if (tool === "line") {
            drawCtx.beginPath();
            drawCtx.moveTo(shapeStart.x, shapeStart.y);
            drawCtx.lineTo(shapeEnd.x, shapeEnd.y);
            drawCtx.stroke();
          } else if (tool === "arrow") {
            drawArrow(drawCtx, shapeStart, shapeEnd, shapeSettings.strokeWidth);
          }

          drawCtx.restore();
          onImageChange();
        }

        // Clear overlay
        if (overlayCanvasRef.current) {
          const overlayCtx = overlayCanvasRef.current.getContext("2d");
          if (overlayCtx) {
            overlayCtx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
          }
        }
        render();
      }

      setIsMouseDown(false);
      setDragStart(null);
      setCropStart(null);
      setLastPoint(null);
      setShapeStart(null);
      setShapeEnd(null);

      // Notify image changed if drawing
      if (tool === "draw" || tool === "erase") {
        onImageChange();
      }
    }, [tool, shapeStart, shapeEnd, shapeSettings, onImageChange, render]);

    const handleMouseLeave = useCallback(() => {
      if (isMouseDown) {
        handleMouseUp();
      }
    }, [isMouseDown, handleMouseUp]);

    // Wheel zoom
    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.1, Math.min(5, zoom + delta));
        onZoomChange(newZoom);
      },
      [zoom, onZoomChange]
    );

    const cursorClass = `tool-${tool}${isMouseDown && tool === "select" ? " dragging" : ""}`;

    // Handle text input commit
    const commitText = useCallback(() => {
      if (textInputPos && textInputValue.trim() && drawingCanvasRef.current && imageCanvasRef.current && mainCanvasRef.current) {
        const drawCtx = drawingCanvasRef.current.getContext("2d");
        if (drawCtx) {
          // Convert canvas position to image coordinates
          const imagePoint = canvasToImageCoords(
            textInputPos.x,
            textInputPos.y,
            mainCanvasRef.current,
            imageCanvasRef.current.width,
            imageCanvasRef.current.height,
            zoom,
            pan
          );

          drawCtx.save();
          drawCtx.fillStyle = textSettings.color;
          const fontStyle = `${textSettings.italic ? "italic " : ""}${textSettings.bold ? "bold " : ""}`;
          drawCtx.font = `${fontStyle}${textSettings.fontSize}px ${textSettings.fontFamily}`;
          drawCtx.textBaseline = "top";
          
          // Handle multi-line text
          const lines = textInputValue.split("\n");
          lines.forEach((line, index) => {
            drawCtx.fillText(line, imagePoint.x, imagePoint.y + index * textSettings.fontSize * 1.2);
          });
          
          drawCtx.restore();
          render();
          onImageChange();
        }
      }
      setTextInputPos(null);
      setTextInputValue("");
    }, [textInputPos, textInputValue, textSettings, zoom, pan, render, onImageChange]);

    // Handle text input keydown
    const handleTextKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        setTextInputPos(null);
        setTextInputValue("");
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitText();
      }
    }, [commitText]);

    // Focus text input when it appears
    useEffect(() => {
      if (textInputPos && textInputRef.current) {
        textInputRef.current.focus();
      }
    }, [textInputPos]);

    return (
      <div css={styles(theme)}>
        <div ref={containerRef} className="canvas-container">
          <canvas
            ref={mainCanvasRef}
            className={`main-canvas ${cursorClass}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
          />
          <canvas ref={overlayCanvasRef} className="overlay-canvas" />
          {textInputPos && (
            <textarea
              ref={textInputRef}
              className="text-input"
              value={textInputValue}
              onChange={(e) => setTextInputValue(e.target.value)}
              onKeyDown={handleTextKeyDown}
              onBlur={commitText}
              style={{
                left: textInputPos.x,
                top: textInputPos.y,
                fontSize: `${textSettings.fontSize * zoom}px`,
                fontFamily: textSettings.fontFamily,
                fontWeight: textSettings.bold ? "bold" : "normal",
                fontStyle: textSettings.italic ? "italic" : "normal",
                color: textSettings.color
              }}
              placeholder="Type text..."
            />
          )}
          <div className="image-info">
            <span>{imageSize.width} × {imageSize.height}px</span>
            <span>{Math.round(zoom * 100)}%</span>
          </div>
        </div>
      </div>
    );
  }
);

ImageEditorCanvas.displayName = "ImageEditorCanvas";

export default memo(ImageEditorCanvas);
