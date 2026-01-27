/**
 * LayoutCanvasEditor - Main canvas editor component
 * Visual layout editor for composing designs with text, images, and shapes
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  memo,
  useState
} from "react";
import { Box, Paper } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Stage, Layer, Rect, Line } from "react-konva";
import Konva from "konva";
import {
  LayoutCanvasData,
  ElementType,
  TextProps,
  ImageProps,
  RectProps,
  GroupProps,
  SnapGuide
} from "./types";
import { useLayoutCanvasStore } from "./LayoutCanvasStore";
import CanvasElement from "./CanvasElement";
import CanvasToolbar from "./CanvasToolbar";
import LayerPanel from "./LayerPanel";
import ElementProperties from "./ElementProperties";
import { readSketchFile, downloadSketchFile, convertFromSketch, convertToSketch } from "./sketch";

interface LayoutCanvasEditorProps {
  value: LayoutCanvasData;
  onChange: (data: LayoutCanvasData) => void;
  width?: number;
  height?: number;
  /** Enable Sketch file import/export */
  enableSketchSupport?: boolean;
}

// Snap guides component - shows alignment lines during drag
const SnapGuidesLayer: React.FC<{
  guides: SnapGuide[];
}> = memo(({ guides }) => {
  if (guides.length === 0) {
    return null;
  }

  return (
    <>
      {guides.map((guide, index) => (
        <Line
          key={`guide-${index}`}
          points={
            guide.type === "vertical"
              ? [guide.position, guide.start, guide.position, guide.end]
              : [guide.start, guide.position, guide.end, guide.position]
          }
          stroke="#ff00ff"
          strokeWidth={1}
          dash={[4, 4]}
        />
      ))}
    </>
  );
});
SnapGuidesLayer.displayName = "SnapGuidesLayer";

// Grid lines component
const GridLines: React.FC<{
  width: number;
  height: number;
  gridSize: number;
  enabled: boolean;
}> = memo(({ width, height, gridSize, enabled }) => {
  const theme = useTheme();

  if (!enabled) {
    return null;
  }

  const lines: React.ReactNode[] = [];
  const strokeColor = theme.palette.mode === "dark" ? "#333" : "#e0e0e0";

  // Vertical lines
  for (let x = 0; x <= width; x += gridSize) {
    lines.push(
      <Line
        key={`v-${x}`}
        points={[x, 0, x, height]}
        stroke={strokeColor}
        strokeWidth={x % (gridSize * 5) === 0 ? 0.5 : 0.25}
      />
    );
  }

  // Horizontal lines
  for (let y = 0; y <= height; y += gridSize) {
    lines.push(
      <Line
        key={`h-${y}`}
        points={[0, y, width, y]}
        stroke={strokeColor}
        strokeWidth={y % (gridSize * 5) === 0 ? 0.5 : 0.25}
      />
    );
  }

  return <>{lines}</>;
});
GridLines.displayName = "GridLines";

const LayoutCanvasEditor: React.FC<LayoutCanvasEditorProps> = ({
  value,
  onChange,
  width = 800,
  height = 600,
  enableSketchSupport = true
}) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [zoom, setZoom] = useState(1);
  const [stageSize, setStageSize] = useState({ width: width, height: height });

  // Use the layout canvas store
  const {
    canvasData,
    selectedIds,
    gridSettings,
    clipboard,
    historyIndex,
    history,
    setCanvasData,
    addElement,
    updateElement,
    deleteElements,
    setSelection,
    addToSelection,
    clearSelection,
    selectAll,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    reorderElements,
    toggleVisibility,
    toggleLock,
    alignLeft,
    alignCenter,
    alignRight,
    alignTop,
    alignMiddle,
    alignBottom,
    addExposedInput,
    removeExposedInput,
    setGridSettings,
    snapToGrid,
    copyToClipboard,
    pasteFromClipboard,
    undo,
    redo,
    findElement,
    snapGuides,
    // snapEnabled is available for future feature toggles
    snapEnabled: _snapEnabled,
    calculateSnapGuides,
    setSnapGuides,
    clearSnapGuides,
    distributeHorizontally,
    distributeVertically,
    tidyElements
  } = useLayoutCanvasStore();

  // Initialize store with value
  useEffect(() => {
    if (value) {
      setCanvasData(value);
    }
  }, [value, setCanvasData]);

  // Sync store changes back to onChange
  useEffect(() => {
    const unsubscribe = useLayoutCanvasStore.subscribe((state) => {
      if (state.canvasData !== value) {
        onChange(state.canvasData);
      }
    });
    return () => unsubscribe();
  }, [onChange, value]);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const { width: containerWidth, height: containerHeight } = entries[0].contentRect;
      setStageSize({
        width: containerWidth,
        height: containerHeight
      });
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Handle element selection
  const handleSelect = useCallback(
    (id: string, event: Konva.KonvaEventObject<MouseEvent>) => {
      const isShiftKey = event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey;
      if (isShiftKey) {
        addToSelection(id);
      } else {
        setSelection([id]);
      }
    },
    [addToSelection, setSelection]
  );

  // Handle stage click (deselect)
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Only deselect if clicking on empty area
      if (e.target === e.target.getStage()) {
        clearSelection();
      }
    },
    [clearSelection]
  );

  // Handle element transform end
  const handleTransformEnd = useCallback(
    (
      id: string,
      attrs: { x: number; y: number; width: number; height: number; rotation: number }
    ) => {
      clearSnapGuides();
      updateElement(id, attrs);
    },
    [updateElement, clearSnapGuides]
  );

  // Handle element drag move - for smart snap guides
  const handleDragMove = useCallback(
    (id: string, x: number, y: number, width: number, height: number) => {
      const result = calculateSnapGuides(id, x, y, width, height);
      setSnapGuides(result.guides);
      return { x: result.x, y: result.y };
    },
    [calculateSnapGuides, setSnapGuides]
  );

  // Handle element drag end
  const handleDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      clearSnapGuides();
      updateElement(id, { x, y });
    },
    [updateElement, clearSnapGuides]
  );

  // Handle layer selection from panel
  const handleLayerSelect = useCallback(
    (id: string, addToSelection: boolean) => {
      if (addToSelection) {
        useLayoutCanvasStore.getState().addToSelection(id);
      } else {
        setSelection([id]);
      }
    },
    [setSelection]
  );

  // Handle adding elements
  const handleAddElement = useCallback(
    (type: ElementType) => {
      // Add element at center of visible canvas
      const centerX = (stageSize.width / 2 - 50) / zoom;
      const centerY = (stageSize.height / 2 - 50) / zoom;
      const newElement = addElement(type, centerX, centerY);
      setSelection([newElement.id]);
    },
    [addElement, setSelection, stageSize, zoom]
  );

  // Handle updating element properties
  const handleUpdateProperties = useCallback(
    (id: string, properties: Partial<TextProps | ImageProps | RectProps | GroupProps>) => {
      const element = findElement(id);
      if (element) {
        updateElement(id, {
          properties: { ...element.properties, ...properties }
        });
      }
    },
    [findElement, updateElement]
  );

  // Keyboard shortcuts - only handle when canvas area is focused
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ignore if typing in input - must check before stopping propagation
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Stop propagation to prevent node menu and other editor shortcuts
      e.stopPropagation();

      const isCtrl = e.ctrlKey || e.metaKey;

      // Prevent space key from triggering node menu
      if (e.key === " " || e.key === "Space") {
        e.preventDefault();
        return;
      }

      // Delete/Backspace - delete selected elements
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          deleteElements(selectedIds);
        }
      }

      // Ctrl+A - select all
      if (isCtrl && e.key === "a") {
        e.preventDefault();
        selectAll();
      }

      // Ctrl+C - copy
      if (isCtrl && e.key === "c") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          copyToClipboard(selectedIds);
        }
      }

      // Ctrl+V - paste
      if (isCtrl && e.key === "v") {
        e.preventDefault();
        pasteFromClipboard();
      }

      // Ctrl+Z - undo
      if (isCtrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Ctrl+Shift+Z or Ctrl+Y - redo
      if ((isCtrl && e.shiftKey && e.key === "z") || (isCtrl && e.key === "y")) {
        e.preventDefault();
        redo();
      }

      // Escape - clear selection
      if (e.key === "Escape") {
        clearSelection();
      }

      // Arrow keys for nudging selected elements
      if (selectedIds.length > 0) {
        const nudgeAmount = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        
        if (e.key === "ArrowLeft") {
          dx = -nudgeAmount;
        } else if (e.key === "ArrowRight") {
          dx = nudgeAmount;
        } else if (e.key === "ArrowUp") {
          dy = -nudgeAmount;
        } else if (e.key === "ArrowDown") {
          dy = nudgeAmount;
        }

        if (dx !== 0 || dy !== 0) {
          e.preventDefault();
          selectedIds.forEach((id) => {
            const element = findElement(id);
            if (element && !element.locked) {
              updateElement(id, { x: element.x + dx, y: element.y + dy });
            }
          });
        }
      }
    },
    [
      selectedIds,
      deleteElements,
      selectAll,
      copyToClipboard,
      pasteFromClipboard,
      undo,
      redo,
      clearSelection,
      findElement,
      updateElement
    ]
  );

  // Mouse wheel zoom handler - requires Ctrl/Cmd modifier
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // Only zoom when Ctrl/Cmd is pressed, allow normal scroll otherwise
      if (!(e.ctrlKey || e.metaKey)) {
        return;
      }

      // Prevent default browser zoom
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY;
      const zoomFactor = delta > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.min(Math.max(z * zoomFactor, 0.1), 4));
    },
    []
  );

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z * 1.25, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z / 1.25, 0.1));
  }, []);

  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    const containerWidth = containerRef.current.clientWidth - 400; // Account for panels
    const containerHeight = containerRef.current.clientHeight - 100; // Account for toolbar
    const scaleX = containerWidth / canvasData.width;
    const scaleY = containerHeight / canvasData.height;
    setZoom(Math.min(scaleX, scaleY, 1));
  }, [canvasData.width, canvasData.height]);

  // Toggle grid
  const handleToggleGrid = useCallback(() => {
    setGridSettings({ enabled: !gridSettings.enabled });
  }, [gridSettings.enabled, setGridSettings]);

  // Export canvas as PNG using Konva's native toDataURL
  const handleExport = useCallback(() => {
    if (!stageRef.current) {
      return;
    }

    // Temporarily hide grid for export
    const wasGridEnabled = gridSettings.enabled;
    if (wasGridEnabled) {
      setGridSettings({ enabled: false });
    }

    // Wait for render to complete, then export
    requestAnimationFrame(() => {
      if (!stageRef.current) {
        return;
      }
      
      const uri = stageRef.current.toDataURL({
        pixelRatio: 2, // Higher resolution for better quality
        mimeType: "image/png"
      });

      // Create download link
      const link = document.createElement("a");
      link.download = "canvas-export.png";
      link.href = uri;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Restore grid if it was enabled
      if (wasGridEnabled) {
        setGridSettings({ enabled: true });
      }
    });
  }, [gridSettings.enabled, setGridSettings]);

  // Import Sketch file
  const handleImportSketch = useCallback(
    async (file: File) => {
      // Validate file type (defense in depth - input already filters)
      if (!file.name.toLowerCase().endsWith(".sketch")) {
        console.error("Invalid file type: expected .sketch file");
        // Note: In a production app, you'd show a toast notification here
        return;
      }

      // Limit file size to 100MB
      const MAX_FILE_SIZE = 100 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        console.error("File too large: maximum size is 100MB");
        return;
      }

      try {
        const result = await readSketchFile(file);
        if (!result.success || !result.contents) {
          console.error("Failed to import Sketch file:", result.error);
          // Note: In a production app, you'd show a toast notification here
          return;
        }

        // Convert the first page to our format
        const page = result.contents.pages[0];
        if (page) {
          const canvasDataImported = convertFromSketch(page);
          setCanvasData(canvasDataImported);
        }
      } catch (error) {
        console.error("Error importing Sketch file:", error);
        // Note: In a production app, you'd show a toast notification here
      }
    },
    [setCanvasData]
  );

  // Export as Sketch file
  const handleExportSketch = useCallback(async () => {
    try {
      const page = convertToSketch(canvasData, "Page 1");
      await downloadSketchFile([page], "design.sketch", new Map(), {
        includePreview: true
      });
    } catch (error) {
      console.error("Error exporting Sketch file:", error);
      // Note: In a production app, you'd show a toast notification here
    }
  }, [canvasData]);

  // Get currently selected element for properties panel
  const selectedElement =
    selectedIds.length === 1 ? findElement(selectedIds[0]) : null;

  // Sort elements by zIndex for rendering
  const sortedElements = [...canvasData.elements].sort(
    (a, b) => a.zIndex - b.zIndex
  );

  return (
    <Box
      ref={containerRef}
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: theme.vars.palette.background.default,
        overflow: "hidden"
      }}
    >
      {/* Toolbar */}
      <CanvasToolbar
        selectedCount={selectedIds.length}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        clipboardCount={clipboard.length}
        gridSettings={gridSettings}
        zoom={zoom}
        onAddElement={handleAddElement}
        onUndo={undo}
        onRedo={redo}
        onCopy={() => copyToClipboard(selectedIds)}
        onPaste={() => pasteFromClipboard()}
        onDelete={() => deleteElements(selectedIds)}
        onBringToFront={() => bringToFront(selectedIds)}
        onSendToBack={() => sendToBack(selectedIds)}
        onBringForward={() => bringForward(selectedIds)}
        onSendBackward={() => sendBackward(selectedIds)}
        onAlignLeft={(toCanvas) => alignLeft(selectedIds, toCanvas)}
        onAlignCenter={(toCanvas) => alignCenter(selectedIds, toCanvas)}
        onAlignRight={(toCanvas) => alignRight(selectedIds, toCanvas)}
        onAlignTop={(toCanvas) => alignTop(selectedIds, toCanvas)}
        onAlignMiddle={(toCanvas) => alignMiddle(selectedIds, toCanvas)}
        onAlignBottom={(toCanvas) => alignBottom(selectedIds, toCanvas)}
        onDistributeHorizontally={() => distributeHorizontally(selectedIds)}
        onDistributeVertically={() => distributeVertically(selectedIds)}
        onTidy={() => tidyElements(selectedIds)}
        onToggleGrid={handleToggleGrid}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToScreen={handleFitToScreen}
        onExport={handleExport}
        onImportSketch={enableSketchSupport ? handleImportSketch : undefined}
        onExportSketch={enableSketchSupport ? handleExportSketch : undefined}
      />

      {/* Main content area */}
      <Box
        sx={{
          display: "flex",
          flexGrow: 1,
          overflow: "hidden"
        }}
      >
        {/* Layer panel */}
        <Box
          sx={{
            width: 200,
            flexShrink: 0,
            borderRight: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <LayerPanel
            elements={canvasData.elements}
            selectedIds={selectedIds}
            onSelect={handleLayerSelect}
            onToggleVisibility={toggleVisibility}
            onToggleLock={toggleLock}
            onReorder={reorderElements}
          />
        </Box>

        {/* Canvas area - focusable for keyboard events */}
        <Box
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onWheel={handleWheel}
          sx={{
            flexGrow: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor:
              theme.palette.mode === "dark" ? "#1a1a1a" : "#f5f5f5",
            overflow: "auto",
            p: 2,
            outline: "none",
            "&:focus": {
              outline: `2px solid ${theme.palette.primary.main}`,
              outlineOffset: "-2px"
            }
          }}
        >
          <Paper
            elevation={3}
            sx={{
              overflow: "hidden",
              transform: `scale(${zoom})`,
              transformOrigin: "center center"
            }}
          >
            <Stage
              ref={stageRef}
              width={canvasData.width}
              height={canvasData.height}
              onClick={handleStageClick}
              onTap={handleStageClick}
            >
              {/* Background layer */}
              <Layer>
                <Rect
                  x={0}
                  y={0}
                  width={canvasData.width}
                  height={canvasData.height}
                  fill={canvasData.backgroundColor}
                />
                <GridLines
                  width={canvasData.width}
                  height={canvasData.height}
                  gridSize={gridSettings.size}
                  enabled={gridSettings.enabled}
                />
              </Layer>

              {/* Elements layer */}
              <Layer>
                {sortedElements.map((element) => (
                  <CanvasElement
                    key={element.id}
                    element={element}
                    isSelected={selectedIds.includes(element.id)}
                    onSelect={handleSelect}
                    onTransformEnd={handleTransformEnd}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    snapToGrid={snapToGrid}
                  />
                ))}
              </Layer>

              {/* Snap guides layer */}
              <Layer>
                <SnapGuidesLayer guides={snapGuides} />
              </Layer>
            </Stage>
          </Paper>
        </Box>

        {/* Properties panel */}
        <Box
          sx={{
            width: 250,
            flexShrink: 0
          }}
        >
          <ElementProperties
            element={selectedElement || null}
            exposedInputs={canvasData.exposedInputs}
            onUpdateElement={updateElement}
            onUpdateProperties={handleUpdateProperties}
            onAddExposedInput={addExposedInput}
            onRemoveExposedInput={removeExposedInput}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default memo(LayoutCanvasEditor);
