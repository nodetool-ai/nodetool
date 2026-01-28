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
import { Box } from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import Konva from "konva";
import {
  LayoutCanvasData,
  ElementType,
  TextProps,
  ImageProps,
  RectProps,
  GroupProps,
  SnapGuide,
  LayoutElement
} from "./types";
import { useLayoutCanvasStore } from "./LayoutCanvasStore";
import CanvasToolbar from "./CanvasToolbar";
import LayerPanel from "./LayerPanel";
import ElementProperties from "./ElementProperties";
import { readSketchFile, downloadSketchFile, convertFromSketch, convertToSketch } from "./sketch";
import CanvasScene from "./CanvasScene";

interface CanvasOverlaysProps {
  element: LayoutElement | null;
  exposedInputs: LayoutCanvasData["exposedInputs"];
  onUpdateElement: (id: string, updates: Partial<LayoutElement>) => void;
  onUpdateProperties: (id: string, properties: Partial<TextProps | ImageProps | RectProps | GroupProps>) => void;
  onAddExposedInput: (input: LayoutCanvasData["exposedInputs"][number]) => void;
  onRemoveExposedInput: (elementId: string, property: string) => void;
  onAlign: (type: "left" | "center" | "right" | "top" | "middle" | "bottom") => void;
}

const CanvasOverlays: React.FC<CanvasOverlaysProps> = memo(
  ({
    element,
    exposedInputs,
    onUpdateElement,
    onUpdateProperties,
    onAddExposedInput,
    onRemoveExposedInput,
    onAlign
  }) => {
    return (
      <Box
        className="layout-canvas-properties-container"
        sx={{
          width: 280,
          flexShrink: 0
        }}
      >
        <ElementProperties
          element={element}
          exposedInputs={exposedInputs}
          onUpdateElement={onUpdateElement}
          onUpdateProperties={onUpdateProperties}
          onAddExposedInput={onAddExposedInput}
          onRemoveExposedInput={onRemoveExposedInput}
          onAlign={onAlign}
        />
      </Box>
    );
  }
);
CanvasOverlays.displayName = "CanvasOverlays";

interface LayoutCanvasEditorProps {
  value: LayoutCanvasData;
  onChange: (data: LayoutCanvasData) => void;
  width?: number;
  height?: number;
  /** Enable Sketch file import/export */
  enableSketchSupport?: boolean;
  /** Enable perf harness dataset generation and overlay */
  perfMode?: boolean;
  perfDatasetSize?: 1000 | 5000 | 10000;
}

interface PerfMetricsSnapshot {
  average: number;
  p95: number;
  frameTime: number;
  elementCount: number;
  snapTime: number | null;
}

const PERFORMANCE_WINDOW = 120;

const createPerfDataset = (count: number, width: number, height: number): LayoutCanvasData => {
  const elements = Array.from({ length: count }, (_, index) => {
    const cols = Math.max(1, Math.round(Math.sqrt(count)));
    const size = 24;
    const gap = 8;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = (col * (size + gap)) % Math.max(width - size, size);
    const y = (row * (size + gap)) % Math.max(height - size, size);
    return {
      id: `perf-${index}`,
      type: "rectangle" as const,
      x,
      y,
      width: size,
      height: size,
      rotation: 0,
      zIndex: index,
      visible: true,
      locked: false,
      name: `Perf ${index + 1}`,
      properties: {
        fillColor: index % 2 === 0 ? "#4a90d9" : "#48bb78",
        borderColor: "#2c5282",
        borderWidth: 1,
        borderRadius: 2,
        opacity: 1
      }
    };
  });

  return {
    type: "layout_canvas",
    width,
    height,
    backgroundColor: "#ffffff",
    elements,
    exposedInputs: []
  };
};

const usePerfMetrics = (
  enabled: boolean,
  elementCount: number,
  snapTime: number | null
): PerfMetricsSnapshot => {
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<PerfMetricsSnapshot>({
    average: 0,
    p95: 0,
    frameTime: 0,
    elementCount: 0,
    snapTime: null
  });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const loop = (timestamp: number) => {
      if (lastFrameRef.current != null) {
        const delta = timestamp - lastFrameRef.current;
        frameTimesRef.current.push(delta);
        if (frameTimesRef.current.length > PERFORMANCE_WINDOW) {
          frameTimesRef.current.shift();
        }
        if (frameTimesRef.current.length > 0) {
          const sorted = [...frameTimesRef.current].sort((a, b) => a - b);
          const total = frameTimesRef.current.reduce((sum, value) => sum + value, 0);
          const average = total / frameTimesRef.current.length;
          const p95Index = Math.max(0, Math.floor(sorted.length * 0.95) - 1);
          const p95 = sorted[p95Index];
          setSnapshot((prev) => ({
            ...prev,
            average,
            p95,
            frameTime: delta
          }));
        }
      }
      lastFrameRef.current = timestamp;
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    setSnapshot((prev) => ({
      ...prev,
      elementCount,
      snapTime
    }));
  }, [elementCount, enabled, snapTime]);

  return snapshot;
};


const LayoutCanvasEditor: React.FC<LayoutCanvasEditorProps> = ({
  value,
  onChange,
  width = 800,
  height = 600,
  enableSketchSupport = true,
  perfMode = false,
  perfDatasetSize = 1000
}) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [zoom, setZoom] = useState(1);
  const [, setStageSize] = useState({ width: width, height: height });
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [snapTime, setSnapTime] = useState<number | null>(null);
  
  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const isSpacePressedRef = useRef(false);

  // Selection rect state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const didDragSelectRef = useRef(false);
  const selectionDragRef = useRef<{
    activeId: string;
    startPositions: Map<string, { x: number; y: number }>;
  } | null>(null);

  // Use the layout canvas store
  const canvasData = useLayoutCanvasStore((state) => state.canvasData);
  const selectedIds = useLayoutCanvasStore((state) => state.selectedIds);
  const gridSettings = useLayoutCanvasStore((state) => state.gridSettings);
  const clipboard = useLayoutCanvasStore((state) => state.clipboard);
  const historyIndex = useLayoutCanvasStore((state) => state.historyIndex);
  const history = useLayoutCanvasStore((state) => state.history);
  const setCanvasData = useLayoutCanvasStore((state) => state.setCanvasData);
  const setCanvasSize = useLayoutCanvasStore((state) => state.setCanvasSize);
  const addElement = useLayoutCanvasStore((state) => state.addElement);
  const updateElement = useLayoutCanvasStore((state) => state.updateElement);
  const updateElements = useLayoutCanvasStore((state) => state.updateElements);
  const deleteElements = useLayoutCanvasStore((state) => state.deleteElements);
  const setSelection = useLayoutCanvasStore((state) => state.setSelection);
  const addToSelection = useLayoutCanvasStore((state) => state.addToSelection);
  const clearSelection = useLayoutCanvasStore((state) => state.clearSelection);
  const selectAll = useLayoutCanvasStore((state) => state.selectAll);
  const bringToFront = useLayoutCanvasStore((state) => state.bringToFront);
  const sendToBack = useLayoutCanvasStore((state) => state.sendToBack);
  const bringForward = useLayoutCanvasStore((state) => state.bringForward);
  const sendBackward = useLayoutCanvasStore((state) => state.sendBackward);
  const toggleVisibility = useLayoutCanvasStore((state) => state.toggleVisibility);
  const toggleLock = useLayoutCanvasStore((state) => state.toggleLock);
  const setAllVisibility = useLayoutCanvasStore((state) => state.setAllVisibility);
  const setAllLock = useLayoutCanvasStore((state) => state.setAllLock);
  const moveElement = useLayoutCanvasStore((state) => state.moveElement);
  const groupElements = useLayoutCanvasStore((state) => state.groupElements);
  const ungroupElements = useLayoutCanvasStore((state) => state.ungroupElements);
  const flattenElements = useLayoutCanvasStore((state) => state.flattenElements);
  const alignLeft = useLayoutCanvasStore((state) => state.alignLeft);
  const alignCenter = useLayoutCanvasStore((state) => state.alignCenter);
  const alignRight = useLayoutCanvasStore((state) => state.alignRight);
  const alignTop = useLayoutCanvasStore((state) => state.alignTop);
  const alignMiddle = useLayoutCanvasStore((state) => state.alignMiddle);
  const alignBottom = useLayoutCanvasStore((state) => state.alignBottom);
  const addExposedInput = useLayoutCanvasStore((state) => state.addExposedInput);
  const removeExposedInput = useLayoutCanvasStore((state) => state.removeExposedInput);
  const setGridSettings = useLayoutCanvasStore((state) => state.setGridSettings);
  const snapToGrid = useLayoutCanvasStore((state) => state.snapToGrid);
  const copyToClipboard = useLayoutCanvasStore((state) => state.copyToClipboard);
  const pasteFromClipboard = useLayoutCanvasStore((state) => state.pasteFromClipboard);
  const undo = useLayoutCanvasStore((state) => state.undo);
  const redo = useLayoutCanvasStore((state) => state.redo);
  const findElement = useLayoutCanvasStore((state) => state.findElement);
  const calculateSnapGuides = useLayoutCanvasStore((state) => state.calculateSnapGuides);
  const distributeHorizontally = useLayoutCanvasStore((state) => state.distributeHorizontally);
  const distributeVertically = useLayoutCanvasStore((state) => state.distributeVertically);
  const tidyElements = useLayoutCanvasStore((state) => state.tidyElements);
  const perfMetrics = usePerfMetrics(perfMode, canvasData.elements.length, snapTime);

  const elementById = React.useMemo(
    () => new Map(canvasData.elements.map((el) => [el.id, el])),
    [canvasData.elements]
  );

  const effectiveVisibleById = React.useMemo(() => {
    const map = new Map<string, boolean>();
    canvasData.elements.forEach((element) => {
      let current: LayoutElement | undefined = element;
      let visible = true;
      while (current) {
        if (!current.visible) {
          visible = false;
          break;
        }
        current = current.parentId ? elementById.get(current.parentId) : undefined;
      }
      map.set(element.id, visible);
    });
    return map;
  }, [canvasData.elements, elementById]);

  const effectiveLockedById = React.useMemo(() => {
    const map = new Map<string, boolean>();
    canvasData.elements.forEach((element) => {
      let current: LayoutElement | undefined = element;
      let locked = false;
      while (current) {
        if (current.locked) {
          locked = true;
          break;
        }
        current = current.parentId ? elementById.get(current.parentId) : undefined;
      }
      map.set(element.id, locked);
    });
    return map;
  }, [canvasData.elements, elementById]);

  const childrenByParent = React.useMemo(() => {
    const map = new Map<string, string[]>();
    canvasData.elements.forEach((element) => {
      const parentKey = element.parentId ?? "__root__";
      const list = map.get(parentKey) ?? [];
      list.push(element.id);
      map.set(parentKey, list);
    });
    return map;
  }, [canvasData.elements]);

  const getDescendantIds = useCallback(
    (parentId: string): string[] => {
      const result: string[] = [];
      const walk = (id: string) => {
        const children = childrenByParent.get(id) ?? [];
        children.forEach((childId) => {
          result.push(childId);
          walk(childId);
        });
      };
      walk(parentId);
      return result;
    },
    [childrenByParent]
  );

  const moveGroupWithChildren = useCallback(
    (groupId: string, dx: number, dy: number) => {
      const group = findElement(groupId);
      if (!group) {
        return;
      }
      const descendants = getDescendantIds(groupId);
      const updates = [{ id: groupId, x: group.x + dx, y: group.y + dy }];
      descendants.forEach((childId) => {
        const child = findElement(childId);
        if (child) {
          updates.push({ id: childId, x: child.x + dx, y: child.y + dy });
        }
      });
      updateElements(updates);
    },
    [findElement, getDescendantIds, updateElements]
  );

  const transformGroupWithChildren = useCallback(
    (
      groupId: string,
      attrs: { x: number; y: number; width: number; height: number; rotation: number }
    ) => {
      const group = findElement(groupId);
      if (!group) {
        return;
      }
      const scaleX = attrs.width / group.width;
      const scaleY = attrs.height / group.height;
      const rotationDelta = attrs.rotation - group.rotation;
      const centerX = group.x + group.width / 2;
      const centerY = group.y + group.height / 2;
      const cos = Math.cos((rotationDelta * Math.PI) / 180);
      const sin = Math.sin((rotationDelta * Math.PI) / 180);

      const descendants = getDescendantIds(groupId);
      const updates = descendants.flatMap((childId) => {
        const child = findElement(childId);
        if (!child) {
          return [];
        }
        const childCenterX = child.x + child.width / 2;
        const childCenterY = child.y + child.height / 2;
        const relX = (childCenterX - centerX) * scaleX;
        const relY = (childCenterY - centerY) * scaleY;
        const rotatedX = relX * cos - relY * sin;
        const rotatedY = relX * sin + relY * cos;
        const newWidth = Math.max(10, child.width * scaleX);
        const newHeight = Math.max(10, child.height * scaleY);
        const newCenterX = centerX + rotatedX;
        const newCenterY = centerY + rotatedY;
        return [
          {
            id: childId,
            x: newCenterX - newWidth / 2,
            y: newCenterY - newHeight / 2,
            width: newWidth,
            height: newHeight,
            rotation: child.rotation + rotationDelta
          }
        ];
      });

      updateElements([...updates, { id: groupId, ...attrs }]);
    },
    [findElement, getDescendantIds, updateElements]
  );

  const sortedElements = React.useMemo(
    () =>
      [...canvasData.elements].sort((a, b) => a.zIndex - b.zIndex),
    [canvasData.elements]
  );

  // Handle alignment from properties panel
  const handlePropertyAlign = useCallback((type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    // Align to canvas since ElementProperties is typically for single selection context
    // or explicit "align object" actions
    const toCanvas = true;
    
    switch (type) {
      case 'left': alignLeft(selectedIds, toCanvas); break;
      case 'center': alignCenter(selectedIds, toCanvas); break;
      case 'right': alignRight(selectedIds, toCanvas); break;
      case 'top': alignTop(selectedIds, toCanvas); break;
      case 'middle': alignMiddle(selectedIds, toCanvas); break;
      case 'bottom': alignBottom(selectedIds, toCanvas); break;
    }
  }, [selectedIds, alignLeft, alignCenter, alignRight, alignTop, alignMiddle, alignBottom]);

  // Initialize store with value
  useEffect(() => {
    if (perfMode) {
      setCanvasData(createPerfDataset(perfDatasetSize, width, height));
      return;
    }
    if (value) {
      setCanvasData(value);
    }
  }, [perfDatasetSize, perfMode, setCanvasData, value, width, height]);

  // Sync store changes back to onChange
  useEffect(() => {
    if (perfMode) {
      return undefined;
    }
    const unsubscribe = useLayoutCanvasStore.subscribe((state) => {
      if (state.canvasData !== value) {
        onChange(state.canvasData);
      }
    });
    return () => unsubscribe();
  }, [onChange, perfMode, value]);

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

  useEffect(() => {
    if (perfMode) {
      setSnapTime(null);
    }
  }, [perfMode]);

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
      if (
        e.target === e.target.getStage() ||
        e.target?.name() === "canvas-background"
      ) {
        if (didDragSelectRef.current) {
          didDragSelectRef.current = false;
          return;
        }
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
      setSnapGuides([]);
      const element = findElement(id);
      if (element?.type === "group") {
        transformGroupWithChildren(id, attrs);
        return;
      }
      updateElement(id, attrs);
    },
    [findElement, transformGroupWithChildren, updateElement]
  );

  // Handle element drag move - for smart snap guides
  const handleDragMove = useCallback(
    (id: string, x: number, y: number, width: number, height: number) => {
      const result = calculateSnapGuides(id, x, y, width, height);
      if (perfMode) {
        const entries = performance.getEntriesByName("calculateSnapGuides");
        const lastEntry = entries[entries.length - 1];
        setSnapTime(lastEntry ? lastEntry.duration : null);
      }
      setSnapGuides(result.guides);
      const selectionDrag = selectionDragRef.current;
      if (selectionDrag && selectionDrag.startPositions.has(id)) {
        const start = selectionDrag.startPositions.get(id);
        if (start) {
          const deltaX = result.x - start.x;
          const deltaY = result.y - start.y;
          const stage = stageRef.current;
          if (stage) {
            selectionDrag.startPositions.forEach((pos, elementId) => {
              const node = stage.findOne<Konva.Node>(`#${elementId}`);
              if (node) {
                node.x(pos.x + deltaX);
                node.y(pos.y + deltaY);
              }
            });
          }
        }
      }
      return { x: result.x, y: result.y };
    },
    [calculateSnapGuides, perfMode]
  );

  const handleDragStart = useCallback(
    (id: string) => {
      const isAlreadySelected = selectedIds.includes(id);
      const selected = isAlreadySelected ? selectedIds : [id];
      if (!isAlreadySelected) {
        setSelection([id]);
      }

      const startPositions = new Map<string, { x: number; y: number }>();
      selected.forEach((selectedId) => {
        const element = findElement(selectedId);
        if (element) {
          startPositions.set(selectedId, { x: element.x, y: element.y });
        }
      });

      selectionDragRef.current = {
        activeId: id,
        startPositions
      };
    },
    [findElement, selectedIds, setSelection]
  );

  // Handle element drag end
  const handleDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      setSnapGuides([]);
      const selectionDrag = selectionDragRef.current;
      if (selectionDrag && selectionDrag.startPositions.has(id)) {
        const start = selectionDrag.startPositions.get(id);
        if (start) {
          const deltaX = x - start.x;
          const deltaY = y - start.y;
          const selected = Array.from(selectionDrag.startPositions.keys());
          const selectedGroups = selected.filter(
            (selectedId) => findElement(selectedId)?.type === "group"
          );
          const descendantIds = new Set<string>();
          selectedGroups.forEach((groupId) => {
            getDescendantIds(groupId).forEach((childId) => descendantIds.add(childId));
          });

          const updates: Array<{ id: string } & Partial<LayoutElement>> = [];
          selected.forEach((elementId) => {
            if (descendantIds.has(elementId)) {
              return;
            }
            const element = findElement(elementId);
            if (!element) {
              return;
            }
            if (element.type === "group" && (deltaX !== 0 || deltaY !== 0)) {
              const descendants = getDescendantIds(elementId);
              updates.push({ id: elementId, x: element.x + deltaX, y: element.y + deltaY });
              descendants.forEach((childId) => {
                const child = findElement(childId);
                if (child) {
                  updates.push({ id: childId, x: child.x + deltaX, y: child.y + deltaY });
                }
              });
            } else {
              updates.push({ id: elementId, x: element.x + deltaX, y: element.y + deltaY });
            }
          });
          updateElements(updates);
          selectionDragRef.current = null;
          return;
        }
      }

      const element = findElement(id);
      if (!element) {
        selectionDragRef.current = null;
        return;
      }
      const dx = x - element.x;
      const dy = y - element.y;
      if (element.type === "group" && (dx !== 0 || dy !== 0)) {
        moveGroupWithChildren(id, dx, dy);
      } else {
        updateElement(id, { x, y });
      }
      selectionDragRef.current = null;
    },
    [findElement, getDescendantIds, moveGroupWithChildren, updateElement, updateElements]
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
      // Add element at center of CANVAS (not container viewport)
      // This ensures elements are visible when canvas is centered in viewport
      const centerX = canvasData.width / 2 - 50;
      const centerY = canvasData.height / 2 - 50;
      const newElement = addElement(type, centerX, centerY);
      setSelection([newElement.id]);
    },
    [addElement, setSelection, canvasData.width, canvasData.height]
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

      // Space key for pan mode
      if (e.key === " " || e.key === "Space") {
        e.preventDefault();
        if (!isSpacePressedRef.current) {
          isSpacePressedRef.current = true;
          setIsSpacePressed(true);
        }
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
          const selectedGroups = selectedIds.filter(
            (selectedId) => findElement(selectedId)?.type === "group"
          );
          const descendantIds = new Set<string>();
          selectedGroups.forEach((groupId) => {
            getDescendantIds(groupId).forEach((childId) => descendantIds.add(childId));
          });

          selectedIds.forEach((id) => {
            if (descendantIds.has(id)) {
              return;
            }
            const element = findElement(id);
            if (!element || element.locked) {
              return;
            }
            if (element.type === "group") {
              moveGroupWithChildren(id, dx, dy);
            } else {
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
      getDescendantIds,
      moveGroupWithChildren,
      updateElement
    ]
  );

  // Key up handler for space key pan mode
  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Space") {
      isSpacePressedRef.current = false;
      isPanningRef.current = false;
      setIsSpacePressed(false);
      setIsPanning(false);
    }
  }, []);

  // Mouse down handler for panning (middle mouse or space+left click)
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle mouse button (button 1) or space + left click
      if (e.button === 1 || (e.button === 0 && isSpacePressedRef.current)) {
        e.preventDefault();
        isPanningRef.current = true;
        setIsPanning(true);
        setPanStart({ x: e.clientX - stagePosition.x, y: e.clientY - stagePosition.y });
      }
    },
    [stagePosition]
  );

  // Mouse move handler for panning
  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanningRef.current) {
        const newX = e.clientX - panStart.x;
        const newY = e.clientY - panStart.y;
        setStagePosition({ x: newX, y: newY });
      }
    },
    [panStart]
  );

  // Mouse up handler for panning
  const handleCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && isPanningRef.current)) {
      isPanningRef.current = false;
      setIsPanning(false);
    }
  }, []);

  const getCanvasPointerPosition = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) {
      return null;
    }
    const position = stage.getPointerPosition();
    if (!position) {
      return null;
    }
    return {
      x: position.x / zoom,
      y: position.y / zoom
    };
  }, [zoom]);

  const normalizeSelectionRect = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      return {
        x,
        y,
        width: Math.abs(start.x - end.x),
        height: Math.abs(start.y - end.y)
      };
    },
    []
  );

  const doesRectIntersect = useCallback(
    (
      rect: { x: number; y: number; width: number; height: number },
      element: { x: number; y: number; width: number; height: number }
    ) => {
      return !(
        rect.x + rect.width < element.x ||
        rect.x > element.x + element.width ||
        rect.y + rect.height < element.y ||
        rect.y > element.y + element.height
      );
    },
    []
  );

  const doesRectContain = useCallback(
    (
      rect: { x: number; y: number; width: number; height: number },
      element: { x: number; y: number; width: number; height: number }
    ) => {
      return (
        rect.x <= element.x &&
        rect.y <= element.y &&
        rect.x + rect.width >= element.x + element.width &&
        rect.y + rect.height >= element.y + element.height
      );
    },
    []
  );

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0 || isSpacePressedRef.current || isPanningRef.current) {
        return;
      }

      const stage = e.target.getStage();
      const isBackground =
        e.target === stage || e.target?.name() === "canvas-background";

      if (!isBackground) {
        return;
      }

      const start = getCanvasPointerPosition();
      if (!start) {
        return;
      }

      didDragSelectRef.current = false;
      setIsSelecting(true);
      setSelectionStart(start);
      setSelectionRect({ x: start.x, y: start.y, width: 0, height: 0 });
    },
    [getCanvasPointerPosition]
  );

  const handleStageMouseMove = useCallback(() => {
    if (!isSelecting || !selectionStart) {
      return;
    }
    const point = getCanvasPointerPosition();
    if (!point) {
      return;
    }

    const nextRect = normalizeSelectionRect(selectionStart, point);
    setSelectionRect(nextRect);

    const dragDistance =
      Math.abs(point.x - selectionStart.x) + Math.abs(point.y - selectionStart.y);
    if (dragDistance > 3) {
      didDragSelectRef.current = true;
    }
  }, [getCanvasPointerPosition, isSelecting, normalizeSelectionRect, selectionStart]);

  const handleStageMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isSelecting || !selectionStart) {
        return;
      }

      const end = getCanvasPointerPosition() ?? selectionStart;
      const rect = normalizeSelectionRect(selectionStart, end);
      const isContainedMode = e.evt.ctrlKey || e.evt.metaKey;
      const isAdditive = e.evt.shiftKey;
      const isSubtractive = e.evt.altKey;

      const hits = sortedElements
        .filter(
          (element) =>
            (effectiveVisibleById.get(element.id) ?? false) &&
            !(effectiveLockedById.get(element.id) ?? false)
        )
        .filter((element) => {
          return isContainedMode
            ? doesRectContain(rect, element)
            : doesRectIntersect(rect, element);
        })
        .map((element) => element.id);

      if (isSubtractive) {
        const nextSelection = selectedIds.filter((id) => !hits.includes(id));
        setSelection(nextSelection);
      } else if (isAdditive) {
        const nextSelection = Array.from(new Set([...selectedIds, ...hits]));
        setSelection(nextSelection);
      } else {
        setSelection(hits);
      }

      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionRect(null);
    },
    [
      doesRectContain,
      doesRectIntersect,
      getCanvasPointerPosition,
      isSelecting,
      normalizeSelectionRect,
      selectedIds,
      selectionStart,
      setSelection,
      sortedElements
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

  const selectionStroke = theme.palette.primary.main;
  const selectionFill = alpha(theme.palette.primary.main, 0.15);

  return (
    <Box
      ref={containerRef}
      className="layout-canvas-editor"
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: theme.vars.palette.background.default,
        overflow: "hidden",
        position: "relative"
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
        canvasWidth={canvasData.width}
        canvasHeight={canvasData.height}
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
        onCanvasSizeChange={setCanvasSize}
      />

      {/* Main content area */}
      <Box
        className="layout-canvas-content"
        sx={{
          display: "flex",
          flexGrow: 1,
          overflow: "hidden"
        }}
      >
        {/* Layer panel */}
        <Box
          className="layout-canvas-layer-panel-container"
          sx={{
            width: 240,
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
            onMoveLayer={moveElement}
            onSetAllVisibility={setAllVisibility}
            onSetAllLock={setAllLock}
            onGroup={groupElements}
            onUngroup={ungroupElements}
            onFlatten={flattenElements}
          />
        </Box>

        {/* Canvas area - focusable for keyboard events */}
        <Box
          className="layout-canvas-viewport"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onWheel={handleWheel}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          sx={{
            flexGrow: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor:
              theme.palette.mode === "dark" ? "#1a1a1a" : "#f5f5f5",
            overflow: "hidden",
            p: 2,
            outline: "none",
            cursor: isPanning ? "grabbing" : isSpacePressed ? "grab" : "default",
            "&:focus": {
              outline: `2px solid ${theme.palette.primary.main}`,
              outlineOffset: "-2px"
            }
          }}
        >
          <CanvasScene
            canvasData={canvasData}
            gridSettings={gridSettings}
            snapGuides={snapGuides}
            sortedElements={sortedElements}
            selectedIds={selectedIds}
            effectiveVisibleById={effectiveVisibleById}
            effectiveLockedById={effectiveLockedById}
            selectionRect={selectionRect}
            selectionStroke={selectionStroke}
            selectionFill={selectionFill}
            stageRef={stageRef}
            stagePosition={stagePosition}
            zoom={zoom}
            isPanning={isPanning}
            onSelect={handleSelect}
            onDragStart={handleDragStart}
            onTransformEnd={handleTransformEnd}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            snapToGrid={snapToGrid}
            onStageMouseDown={handleStageMouseDown}
            onStageMouseMove={handleStageMouseMove}
            onStageMouseUp={handleStageMouseUp}
            onStageClick={handleStageClick}
          />
        </Box>

        {/* Properties panel */}
        <CanvasOverlays
          element={selectedElement || null}
          exposedInputs={canvasData.exposedInputs}
          onUpdateElement={updateElement}
          onUpdateProperties={handleUpdateProperties}
          onAddExposedInput={addExposedInput}
          onRemoveExposedInput={removeExposedInput}
          onAlign={handlePropertyAlign}
        />
      </Box>
      {perfMode && (
        <Box
          className="layout-canvas-perf-overlay"
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 10,
            backgroundColor: alpha(theme.palette.background.paper, 0.9),
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: 1,
            px: 1.5,
            py: 1,
            fontSize: 12,
            fontFamily: theme.typography.fontFamily,
            color: theme.palette.text.primary,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            pointerEvents: "none"
          }}
        >
          <Box>Frame: {perfMetrics.frameTime.toFixed(2)}ms</Box>
          <Box>Avg: {perfMetrics.average.toFixed(2)}ms</Box>
          <Box>P95: {perfMetrics.p95.toFixed(2)}ms</Box>
          <Box>Elements: {perfMetrics.elementCount}</Box>
          <Box>Snap: {perfMetrics.snapTime ? `${perfMetrics.snapTime.toFixed(2)}ms` : "--"}</Box>
        </Box>
      )}
    </Box>
  );
};

export default memo(LayoutCanvasEditor);
