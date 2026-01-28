/**
 * Canvas state management helpers for LLM tools
 * Provides access to the LayoutCanvasStore for tool operations
 */

import { useLayoutCanvasStore } from "../../../../components/design/LayoutCanvasStore";
import { 
  LayoutCanvasData, 
  LayoutElement, 
  ElementType,
  DEFAULT_CANVAS_DATA 
} from "../../../../components/design/types";

// Store instance getter - the store is a singleton
export const getCanvasStore = () => useLayoutCanvasStore.getState();

// =============================================================================
// Canvas State Accessors
// =============================================================================

/**
 * Get the current canvas data
 */
export const getCanvasData = (): LayoutCanvasData => {
  return getCanvasStore().canvasData;
};

/**
 * Get all elements on the canvas
 */
export const getElements = (): LayoutElement[] => {
  return getCanvasStore().canvasData.elements;
};

/**
 * Find an element by ID
 */
export const findElement = (id: string): LayoutElement | undefined => {
  return getCanvasStore().findElement(id);
};

/**
 * Get elements by their IDs
 */
export const getElementsById = (ids: string[]): LayoutElement[] => {
  const elements = getElements();
  return elements.filter(el => ids.includes(el.id));
};

/**
 * Get currently selected element IDs
 */
export const getSelectedIds = (): string[] => {
  return getCanvasStore().selectedIds;
};

/**
 * Get selected elements
 */
export const getSelectedElements = (): LayoutElement[] => {
  return getCanvasStore().getSelectedElements();
};

// =============================================================================
// Canvas State Modifiers
// =============================================================================

/**
 * Initialize or reset the canvas with specified dimensions
 */
export const initializeCanvas = (
  width: number, 
  height: number, 
  backgroundColor?: string
): LayoutCanvasData => {
  const store = getCanvasStore();
  const newData: LayoutCanvasData = {
    ...DEFAULT_CANVAS_DATA,
    width,
    height,
    backgroundColor: backgroundColor || "#ffffff",
    elements: [],
    exposedInputs: []
  };
  store.setCanvasData(newData);
  return newData;
};

/**
 * Add a new element to the canvas
 */
export const addElement = (
  type: ElementType,
  x?: number,
  y?: number
): LayoutElement => {
  return getCanvasStore().addElement(type, x, y);
};

/**
 * Update an element's properties
 */
export const updateElement = (
  id: string, 
  updates: Partial<LayoutElement>
): void => {
  getCanvasStore().updateElement(id, updates);
};

/**
 * Delete elements by IDs
 */
export const deleteElements = (ids: string[]): void => {
  getCanvasStore().deleteElements(ids);
};

/**
 * Duplicate elements
 */
export const duplicateElements = (ids: string[]): LayoutElement[] => {
  return getCanvasStore().duplicateElements(ids);
};

/**
 * Set selection
 */
export const setSelection = (ids: string[]): void => {
  getCanvasStore().setSelection(ids);
};

/**
 * Clear selection
 */
export const clearSelection = (): void => {
  getCanvasStore().clearSelection();
};

// =============================================================================
// Alignment Operations
// =============================================================================

/**
 * Align elements in a direction
 */
export const alignElements = (
  ids: string[], 
  direction: "left" | "center" | "right" | "top" | "middle" | "bottom",
  toCanvas: boolean = false
): void => {
  const store = getCanvasStore();
  switch (direction) {
    case "left":
      store.alignLeft(ids, toCanvas);
      break;
    case "center":
      store.alignCenter(ids, toCanvas);
      break;
    case "right":
      store.alignRight(ids, toCanvas);
      break;
    case "top":
      store.alignTop(ids, toCanvas);
      break;
    case "middle":
      store.alignMiddle(ids, toCanvas);
      break;
    case "bottom":
      store.alignBottom(ids, toCanvas);
      break;
  }
};

/**
 * Distribute elements evenly
 */
export const distributeElements = (
  ids: string[],
  direction: "horizontal" | "vertical"
): void => {
  const store = getCanvasStore();
  if (direction === "horizontal") {
    store.distributeHorizontally(ids);
  } else {
    store.distributeVertically(ids);
  }
};

/**
 * Tidy elements into a grid
 */
export const tidyElements = (ids: string[], spacing?: number): void => {
  getCanvasStore().tidyElements(ids, spacing);
};

/**
 * Set horizontal spacing between elements
 */
export const setHorizontalSpacing = (ids: string[], spacing: number): void => {
  getCanvasStore().setHorizontalSpacing(ids, spacing);
};

/**
 * Set vertical spacing between elements
 */
export const setVerticalSpacing = (ids: string[], spacing: number): void => {
  getCanvasStore().setVerticalSpacing(ids, spacing);
};

// =============================================================================
// Layer Operations
// =============================================================================

/**
 * Bring elements to front
 */
export const bringToFront = (ids: string[]): void => {
  getCanvasStore().bringToFront(ids);
};

/**
 * Send elements to back
 */
export const sendToBack = (ids: string[]): void => {
  getCanvasStore().sendToBack(ids);
};

/**
 * Bring elements forward by one level
 */
export const bringForward = (ids: string[]): void => {
  getCanvasStore().bringForward(ids);
};

/**
 * Send elements backward by one level
 */
export const sendBackward = (ids: string[]): void => {
  getCanvasStore().sendBackward(ids);
};

// =============================================================================
// Visibility & Lock
// =============================================================================

/**
 * Toggle element visibility
 */
export const toggleVisibility = (id: string): void => {
  getCanvasStore().toggleVisibility(id);
};

/**
 * Toggle element lock
 */
export const toggleLock = (id: string): void => {
  getCanvasStore().toggleLock(id);
};

// =============================================================================
// History
// =============================================================================

/**
 * Undo last action
 */
export const undo = (): void => {
  getCanvasStore().undo();
};

/**
 * Redo last undone action
 */
export const redo = (): void => {
  getCanvasStore().redo();
};

// =============================================================================
// Utilities
// =============================================================================

/**
 * Generate a summary of elements for tool responses
 */
export const summarizeElement = (el: LayoutElement) => ({
  id: el.id,
  type: el.type,
  name: el.name,
  x: el.x,
  y: el.y,
  width: el.width,
  height: el.height,
  visible: el.visible,
  locked: el.locked
});

/**
 * Get a brief description of the canvas state
 */
export const getCanvasSummary = () => {
  const data = getCanvasData();
  return {
    width: data.width,
    height: data.height,
    backgroundColor: data.backgroundColor,
    elementCount: data.elements.length
  };
};
