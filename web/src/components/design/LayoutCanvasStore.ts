/**
 * Zustand store for LayoutCanvas editor state management
 */

import { create } from "zustand";
import {
  LayoutCanvasData,
  LayoutElement,
  ExposedInput,
  ElementType,
  DEFAULT_CANVAS_DATA,
  DEFAULT_TEXT_PROPS,
  DEFAULT_IMAGE_PROPS,
  DEFAULT_RECT_PROPS,
  DEFAULT_ELLIPSE_PROPS,
  DEFAULT_LINE_PROPS,
  DEFAULT_GROUP_PROPS,
  GridSettings,
  SnapGuide
} from "./types";

// Generate unique ID
const generateId = (): string => {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
};

// Helper type for position updates
type PositionUpdate = { id: string; x?: number; y?: number };
type DropPosition = "before" | "after" | "inside" | "root";

// Helper function to apply position updates to elements
const applyPositionUpdates = (
  elements: LayoutElement[],
  positions: PositionUpdate[]
): LayoutElement[] => {
  return elements.map((el) => {
    const pos = positions.find((p) => p.id === el.id);
    if (!pos) {return el;}
    return {
      ...el,
      ...(pos.x !== undefined && { x: pos.x }),
      ...(pos.y !== undefined && { y: pos.y })
    };
  });
};

const ROOT_PARENT_ID = "__root__";

const buildChildrenMap = (elements: LayoutElement[]) => {
  const map = new Map<string, LayoutElement[]>();
  elements.forEach((element) => {
    const parentKey = element.parentId ?? ROOT_PARENT_ID;
    const list = map.get(parentKey) ?? [];
    list.push(element);
    map.set(parentKey, list);
  });
  return map;
};

const getDescendantIds = (elements: LayoutElement[], parentId: string): string[] => {
  const childrenMap = buildChildrenMap(elements);
  const result: string[] = [];

  const walk = (id: string) => {
    const children = childrenMap.get(id) ?? [];
    children.forEach((child) => {
      result.push(child.id);
      walk(child.id);
    });
  };

  walk(parentId);
  return result;
};

const isDescendantOf = (
  element: LayoutElement,
  ancestorId: string,
  elementById: Map<string, LayoutElement>
) => {
  let currentParent = element.parentId;
  while (currentParent) {
    if (currentParent === ancestorId) {
      return true;
    }
    currentParent = elementById.get(currentParent)?.parentId;
  }
  return false;
};

const getPanelOrder = (elements: LayoutElement[]) => {
  const childrenMap = buildChildrenMap(elements);

  const walk = (parentKey: string): LayoutElement[] => {
    const children = [...(childrenMap.get(parentKey) ?? [])].sort(
      (a, b) => b.zIndex - a.zIndex
    );
    const result: LayoutElement[] = [];
    children.forEach((child) => {
      result.push(child);
      result.push(...walk(child.id));
    });
    return result;
  };

  return walk(ROOT_PARENT_ID);
};

const normalizeZIndex = (elements: LayoutElement[]) => {
  const ordered = getPanelOrder(elements);
  const orderedById = new Map<string, LayoutElement>();
  ordered.forEach((el, index) => {
    orderedById.set(el.id, {
      ...el,
      zIndex: ordered.length - 1 - index
    });
  });
  return elements.map((el) => orderedById.get(el.id) ?? el);
};

const getBoundsForIds = (elements: LayoutElement[], ids: string[]) => {
  const targets = elements.filter((el) => ids.includes(el.id));
  const minX = Math.min(...targets.map((el) => el.x));
  const minY = Math.min(...targets.map((el) => el.y));
  const maxX = Math.max(...targets.map((el) => el.x + el.width));
  const maxY = Math.max(...targets.map((el) => el.y + el.height));
  return {
    x: minX,
    y: minY,
    width: Math.max(10, maxX - minX),
    height: Math.max(10, maxY - minY)
  };
};

interface LayoutCanvasStoreState {
  // Canvas data
  canvasData: LayoutCanvasData;

  // Selection state
  selectedIds: string[];

  // Grid settings
  gridSettings: GridSettings;

  // Smart snap guides (shown during drag)
  snapGuides: SnapGuide[];
  snapEnabled: boolean;
  snapThreshold: number;

  // Clipboard for copy/paste
  clipboard: LayoutElement[];

  // History for undo/redo
  history: LayoutCanvasData[];
  historyIndex: number;

  // Actions
  setCanvasData: (data: LayoutCanvasData) => void;
  setCanvasSize: (width: number, height: number) => void;
  setBackgroundColor: (color: string) => void;
  setBackgroundImage: (image: string | undefined) => void;

  // Element actions
  addElement: (type: ElementType, x?: number, y?: number) => LayoutElement;
  updateElement: (id: string, updates: Partial<LayoutElement>) => void;
  deleteElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => LayoutElement[];

  // Selection actions
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Layer ordering
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  reorderElements: (fromIndex: number, toIndex: number) => void;

  // Alignment
  alignLeft: (ids: string[], toCanvas?: boolean) => void;
  alignCenter: (ids: string[], toCanvas?: boolean) => void;
  alignRight: (ids: string[], toCanvas?: boolean) => void;
  alignTop: (ids: string[], toCanvas?: boolean) => void;
  alignMiddle: (ids: string[], toCanvas?: boolean) => void;
  alignBottom: (ids: string[], toCanvas?: boolean) => void;
  distributeHorizontally: (ids: string[]) => void;
  distributeVertically: (ids: string[]) => void;
  
  // Tidy - arrange elements into a neat grid
  tidyElements: (ids: string[], spacing?: number) => void;
  
  // Set specific spacing between elements
  setHorizontalSpacing: (ids: string[], spacing: number) => void;
  setVerticalSpacing: (ids: string[], spacing: number) => void;

  // Visibility & lock
  toggleVisibility: (id: string) => void;
  toggleLock: (id: string) => void;
  setAllVisibility: (visible: boolean) => void;
  setAllLock: (locked: boolean) => void;

  // Hierarchy
  moveElement: (id: string, targetId: string | null, position: DropPosition) => void;
  setElements: (elements: LayoutElement[]) => void;
  groupElements: (ids: string[]) => void;
  ungroupElements: (ids: string[]) => void;
  flattenElements: (ids: string[]) => void;

  // Exposed inputs
  addExposedInput: (input: ExposedInput) => void;
  removeExposedInput: (elementId: string, property: string) => void;
  updateExposedInput: (elementId: string, property: string, updates: Partial<ExposedInput>) => void;

  // Grid
  setGridSettings: (settings: Partial<GridSettings>) => void;
  snapToGrid: (value: number) => number;

  // Smart snap guides
  setSnapEnabled: (enabled: boolean) => void;
  setSnapGuides: (guides: SnapGuide[]) => void;
  clearSnapGuides: () => void;
  calculateSnapGuides: (elementId: string, x: number, y: number, width: number, height: number) => { x: number; y: number; guides: SnapGuide[] };

  // Copy/paste
  copyToClipboard: (ids: string[]) => void;
  pasteFromClipboard: (offsetX?: number, offsetY?: number) => LayoutElement[];

  // History (undo/redo)
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;

  // Find element
  findElement: (id: string) => LayoutElement | undefined;
  getSelectedElements: () => LayoutElement[];
}

export const useLayoutCanvasStore = create<LayoutCanvasStoreState>((set, get) => ({
  canvasData: DEFAULT_CANVAS_DATA,
  selectedIds: [],
  gridSettings: {
    enabled: true,
    size: 10,
    snap: true
  },
  snapGuides: [],
  snapEnabled: true,
  snapThreshold: 5,
  clipboard: [],
  history: [DEFAULT_CANVAS_DATA],
  historyIndex: 0,

  // Set entire canvas data
  setCanvasData: (data) => {
    const current = get().canvasData;
    // Skip update if data is the same object or has the same content
    // This prevents update loops when syncing with parent components
    if (current === data) {
      return;
    }
    // Compare content for objects with same structure but different references
    if (
      current.width === data.width &&
      current.height === data.height &&
      current.backgroundColor === data.backgroundColor &&
      current.backgroundImage === data.backgroundImage &&
      current.elements.length === data.elements.length &&
      current.exposedInputs.length === data.exposedInputs.length &&
      current.elements.every((el, i) => el.id === data.elements[i]?.id)
    ) {
      return;
    }
    // Ensure type field is always present for backend compatibility
    set({ canvasData: { ...data, type: "layout_canvas" as const } });
    get().saveToHistory();
  },

  setCanvasSize: (width, height) => {
    set((state) => ({
      canvasData: { ...state.canvasData, width, height }
    }));
    get().saveToHistory();
  },

  setBackgroundColor: (color) => {
    set((state) => ({
      canvasData: { ...state.canvasData, backgroundColor: color }
    }));
    get().saveToHistory();
  },

  setBackgroundImage: (image) => {
    set((state) => ({
      canvasData: { ...state.canvasData, backgroundImage: image }
    }));
    get().saveToHistory();
  },

  // Add new element
  addElement: (type, x = 50, y = 50) => {
    const id = generateId();
    let properties;
    let width = 100;
    let height = 100;

    switch (type) {
      case "text":
        properties = { ...DEFAULT_TEXT_PROPS };
        width = 200;
        height = 50;
        break;
      case "image":
        properties = { ...DEFAULT_IMAGE_PROPS };
        break;
      case "rectangle":
        properties = { ...DEFAULT_RECT_PROPS };
        break;
      case "ellipse":
        properties = { ...DEFAULT_ELLIPSE_PROPS };
        break;
      case "line":
        properties = { ...DEFAULT_LINE_PROPS };
        width = 100;
        height = 2;
        break;
      case "group":
        properties = { ...DEFAULT_GROUP_PROPS };
        width = 200;
        height = 200;
        break;
      default:
        properties = { ...DEFAULT_RECT_PROPS };
    }

    const maxZIndex = Math.max(
      0,
      ...get().canvasData.elements.map((el) => el.zIndex)
    );

    const newElement: LayoutElement = {
      id,
      type,
      x,
      y,
      width,
      height,
      rotation: 0,
      zIndex: maxZIndex + 1,
      visible: true,
      locked: false,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${get().canvasData.elements.length + 1}`,
      properties
    };

    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: [...state.canvasData.elements, newElement]
      }
    }));

    get().saveToHistory();
    return newElement;
  },

  // Update element
  updateElement: (id, updates) => {
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          el.id === id ? { ...el, ...updates } : el
        )
      }
    }));
    get().saveToHistory();
  },

  // Delete elements
  deleteElements: (ids) => {
    const { canvasData } = get();
    const idsWithDescendants = new Set<string>();
    ids.forEach((id) => {
      idsWithDescendants.add(id);
      getDescendantIds(canvasData.elements, id).forEach((descId) =>
        idsWithDescendants.add(descId)
      );
    });
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.filter((el) => !idsWithDescendants.has(el.id)),
        exposedInputs: state.canvasData.exposedInputs.filter(
          (ei) => !idsWithDescendants.has(ei.elementId)
        )
      },
      selectedIds: state.selectedIds.filter((id) => !idsWithDescendants.has(id))
    }));
    get().saveToHistory();
  },

  // Duplicate elements
  duplicateElements: (ids) => {
    const { canvasData } = get();
    const idsWithDescendants = new Set<string>();
    ids.forEach((id) => {
      idsWithDescendants.add(id);
      getDescendantIds(canvasData.elements, id).forEach((descId) =>
        idsWithDescendants.add(descId)
      );
    });
    const elements = canvasData.elements.filter((el) => idsWithDescendants.has(el.id));
    const maxZIndex = Math.max(0, ...canvasData.elements.map((el) => el.zIndex));
    
    const newElements = elements.map((el, idx) => ({
      ...el,
      id: generateId(),
      x: el.x + 20,
      y: el.y + 20,
      zIndex: maxZIndex + idx + 1,
      name: `${el.name} copy`,
      parentId: el.parentId
    }));

    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: [...state.canvasData.elements, ...newElements]
      },
      selectedIds: newElements.map((el) => el.id)
    }));

    get().saveToHistory();
    return newElements;
  },

  // Selection
  setSelection: (ids) => set({ selectedIds: ids }),
  
  addToSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds
        : [...state.selectedIds, id]
    })),
  
  removeFromSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.filter((i) => i !== id)
    })),
  
  clearSelection: () => set({ selectedIds: [] }),
  
  selectAll: () =>
    set((state) => ({
      selectedIds: state.canvasData.elements
        .filter((el) => !el.locked)
        .map((el) => el.id)
    })),

  // Layer ordering
  bringToFront: (ids) => {
    const maxZIndex = Math.max(0, ...get().canvasData.elements.map((el) => el.zIndex));
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el, idx) =>
          ids.includes(el.id) ? { ...el, zIndex: maxZIndex + idx + 1 } : el
        )
      }
    }));
    get().saveToHistory();
  },

  sendToBack: (ids) => {
    const minZIndex = Math.min(...get().canvasData.elements.map((el) => el.zIndex));
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el, idx) =>
          ids.includes(el.id) ? { ...el, zIndex: minZIndex - ids.length + idx } : el
        )
      }
    }));
    get().saveToHistory();
  },

  bringForward: (ids) => {
    set((state) => {
      const elements = [...state.canvasData.elements];
      const selectedElements = elements.filter((el) => ids.includes(el.id));
      const maxSelectedZ = Math.max(...selectedElements.map((el) => el.zIndex));
      const nextElement = elements.find(
        (el) => !ids.includes(el.id) && el.zIndex > maxSelectedZ
      );
      
      if (nextElement) {
        return {
          canvasData: {
            ...state.canvasData,
            elements: elements.map((el) => {
              if (ids.includes(el.id)) {
                return { ...el, zIndex: el.zIndex + 1 };
              }
              if (el.id === nextElement.id) {
                return { ...el, zIndex: el.zIndex - ids.length };
              }
              return el;
            })
          }
        };
      }
      return state;
    });
    get().saveToHistory();
  },

  sendBackward: (ids) => {
    set((state) => {
      const elements = [...state.canvasData.elements];
      const selectedElements = elements.filter((el) => ids.includes(el.id));
      const minSelectedZ = Math.min(...selectedElements.map((el) => el.zIndex));
      const prevElement = elements.find(
        (el) => !ids.includes(el.id) && el.zIndex < minSelectedZ
      );
      
      if (prevElement) {
        return {
          canvasData: {
            ...state.canvasData,
            elements: elements.map((el) => {
              if (ids.includes(el.id)) {
                return { ...el, zIndex: el.zIndex - 1 };
              }
              if (el.id === prevElement.id) {
                return { ...el, zIndex: el.zIndex + ids.length };
              }
              return el;
            })
          }
        };
      }
      return state;
    });
    get().saveToHistory();
  },

  reorderElements: (fromIndex, toIndex) => {
    set((state) => {
      const elements = [...state.canvasData.elements];
      const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);
      const [removed] = sortedElements.splice(fromIndex, 1);
      sortedElements.splice(toIndex, 0, removed);
      
      // Reassign zIndex based on new order
      const reindexed = sortedElements.map((el, idx) => ({
        ...el,
        zIndex: idx
      }));
      
      return {
        canvasData: {
          ...state.canvasData,
          elements: reindexed
        }
      };
    });
    get().saveToHistory();
  },

  // Alignment helpers
  // When toCanvas is true, single elements align to canvas boundaries
  // When toCanvas is false (default), multiple elements align to selection bounds
  alignLeft: (ids, toCanvas = false) => {
    const { canvasData } = get();
    const elements = canvasData.elements.filter((el) => ids.includes(el.id));
    if (elements.length === 0) {return;}
    
    // Single element: align to canvas if toCanvas is true
    // Multiple elements: align to leftmost element
    const targetX = (elements.length === 1 && toCanvas) ? 0 : Math.min(...elements.map((el) => el.x));
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          ids.includes(el.id) ? { ...el, x: targetX } : el
        )
      }
    }));
    get().saveToHistory();
  },

  alignCenter: (ids, toCanvas = false) => {
    const { canvasData } = get();
    const elements = canvasData.elements.filter((el) => ids.includes(el.id));
    if (elements.length === 0) {return;}
    
    let targetCenterX: number;
    if (elements.length === 1 && toCanvas) {
      // Center in canvas
      targetCenterX = canvasData.width / 2;
    } else {
      // Center based on selection bounds
      const centers = elements.map((el) => el.x + el.width / 2);
      targetCenterX = centers.reduce((a, b) => a + b, 0) / centers.length;
    }
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          ids.includes(el.id) ? { ...el, x: targetCenterX - el.width / 2 } : el
        )
      }
    }));
    get().saveToHistory();
  },

  alignRight: (ids, toCanvas = false) => {
    const { canvasData } = get();
    const elements = canvasData.elements.filter((el) => ids.includes(el.id));
    if (elements.length === 0) {return;}
    
    const targetRight = (elements.length === 1 && toCanvas) 
      ? canvasData.width 
      : Math.max(...elements.map((el) => el.x + el.width));
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          ids.includes(el.id) ? { ...el, x: targetRight - el.width } : el
        )
      }
    }));
    get().saveToHistory();
  },

  alignTop: (ids, toCanvas = false) => {
    const { canvasData } = get();
    const elements = canvasData.elements.filter((el) => ids.includes(el.id));
    if (elements.length === 0) {return;}
    
    const targetY = (elements.length === 1 && toCanvas) ? 0 : Math.min(...elements.map((el) => el.y));
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          ids.includes(el.id) ? { ...el, y: targetY } : el
        )
      }
    }));
    get().saveToHistory();
  },

  alignMiddle: (ids, toCanvas = false) => {
    const { canvasData } = get();
    const elements = canvasData.elements.filter((el) => ids.includes(el.id));
    if (elements.length === 0) {return;}
    
    let targetCenterY: number;
    if (elements.length === 1 && toCanvas) {
      // Center in canvas
      targetCenterY = canvasData.height / 2;
    } else {
      // Center based on selection bounds
      const middles = elements.map((el) => el.y + el.height / 2);
      targetCenterY = middles.reduce((a, b) => a + b, 0) / middles.length;
    }
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          ids.includes(el.id) ? { ...el, y: targetCenterY - el.height / 2 } : el
        )
      }
    }));
    get().saveToHistory();
  },

  alignBottom: (ids, toCanvas = false) => {
    const { canvasData } = get();
    const elements = canvasData.elements.filter((el) => ids.includes(el.id));
    if (elements.length === 0) {return;}
    
    const targetBottom = (elements.length === 1 && toCanvas) 
      ? canvasData.height 
      : Math.max(...elements.map((el) => el.y + el.height));
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          ids.includes(el.id) ? { ...el, y: targetBottom - el.height } : el
        )
      }
    }));
    get().saveToHistory();
  },

  distributeHorizontally: (ids) => {
    const elements = get()
      .canvasData.elements.filter((el) => ids.includes(el.id))
      .sort((a, b) => a.x - b.x);
    
    if (elements.length < 3) {return;}
    
    const totalWidth = elements.reduce((sum, el) => sum + el.width, 0);
    const minX = elements[0].x;
    const maxRight = elements[elements.length - 1].x + elements[elements.length - 1].width;
    const totalSpace = maxRight - minX - totalWidth;
    const gap = totalSpace / (elements.length - 1);
    
    let currentX = minX;
    const positions: PositionUpdate[] = elements.map((el) => {
      const pos = currentX;
      currentX += el.width + gap;
      return { id: el.id, x: pos };
    });
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: applyPositionUpdates(state.canvasData.elements, positions)
      }
    }));
    get().saveToHistory();
  },

  distributeVertically: (ids) => {
    const elements = get()
      .canvasData.elements.filter((el) => ids.includes(el.id))
      .sort((a, b) => a.y - b.y);
    
    if (elements.length < 3) {return;}
    
    const totalHeight = elements.reduce((sum, el) => sum + el.height, 0);
    const minY = elements[0].y;
    const maxBottom = elements[elements.length - 1].y + elements[elements.length - 1].height;
    const totalSpace = maxBottom - minY - totalHeight;
    const gap = totalSpace / (elements.length - 1);
    
    let currentY = minY;
    const positions: PositionUpdate[] = elements.map((el) => {
      const pos = currentY;
      currentY += el.height + gap;
      return { id: el.id, y: pos };
    });
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: applyPositionUpdates(state.canvasData.elements, positions)
      }
    }));
    get().saveToHistory();
  },
  
  // Tidy: Arrange elements into a neat grid with even spacing
  tidyElements: (ids, spacing = 10) => {
    const elements = get()
      .canvasData.elements.filter((el) => ids.includes(el.id));
    
    if (elements.length < 2) {return;}
    
    // Sort by position (top-left to bottom-right reading order)
    const sorted = [...elements].sort((a, b) => {
      const rowDiff = Math.floor(a.y / 50) - Math.floor(b.y / 50);
      if (rowDiff !== 0) {return rowDiff;}
      return a.x - b.x;
    });
    
    // Calculate grid dimensions
    const avgWidth = sorted.reduce((sum, el) => sum + el.width, 0) / sorted.length;
    const avgHeight = sorted.reduce((sum, el) => sum + el.height, 0) / sorted.length;
    
    // Determine optimal columns based on selection bounds
    const minX = Math.min(...sorted.map((el) => el.x));
    const maxX = Math.max(...sorted.map((el) => el.x + el.width));
    const boundsWidth = maxX - minX;
    
    // Calculate columns to fit in existing width (rows are implicitly determined)
    const cols = Math.max(1, Math.floor((boundsWidth + spacing) / (avgWidth + spacing)));
    
    // Calculate starting position (use bounds of original selection)
    const startX = minX;
    const startY = Math.min(...sorted.map((el) => el.y));
    
    // Position elements in grid - row is derived from index/cols
    const positions: PositionUpdate[] = sorted.map((el, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      return {
        id: el.id,
        x: startX + col * (avgWidth + spacing) + (avgWidth - el.width) / 2,
        y: startY + row * (avgHeight + spacing) + (avgHeight - el.height) / 2
      };
    });
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: applyPositionUpdates(state.canvasData.elements, positions)
      }
    }));
    get().saveToHistory();
  },
  
  // Set specific horizontal spacing between selected elements
  setHorizontalSpacing: (ids, spacing) => {
    const elements = get()
      .canvasData.elements.filter((el) => ids.includes(el.id))
      .sort((a, b) => a.x - b.x);
    
    if (elements.length < 2) {return;}
    
    let currentX = elements[0].x;
    const positions: PositionUpdate[] = elements.map((el) => {
      const pos = currentX;
      currentX += el.width + spacing;
      return { id: el.id, x: pos };
    });
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: applyPositionUpdates(state.canvasData.elements, positions)
      }
    }));
    get().saveToHistory();
  },
  
  // Set specific vertical spacing between selected elements
  setVerticalSpacing: (ids, spacing) => {
    const elements = get()
      .canvasData.elements.filter((el) => ids.includes(el.id))
      .sort((a, b) => a.y - b.y);
    
    if (elements.length < 2) {return;}
    
    let currentY = elements[0].y;
    const positions: PositionUpdate[] = elements.map((el) => {
      const pos = currentY;
      currentY += el.height + spacing;
      return { id: el.id, y: pos };
    });
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: applyPositionUpdates(state.canvasData.elements, positions)
      }
    }));
    get().saveToHistory();
  },

  // Visibility & lock
  toggleVisibility: (id) => {
    const { canvasData } = get();
    const element = canvasData.elements.find((el) => el.id === id);
    if (!element) {return;}
    const newVisible = !element.visible;
    const descendantIds = getDescendantIds(canvasData.elements, id);
    const idsToUpdate = new Set([id, ...descendantIds]);
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          idsToUpdate.has(el.id) ? { ...el, visible: newVisible } : el
        )
      }
    }));
    get().saveToHistory();
  },

  toggleLock: (id) => {
    const { canvasData } = get();
    const element = canvasData.elements.find((el) => el.id === id);
    if (!element) {return;}
    const newLocked = !element.locked;
    const descendantIds = getDescendantIds(canvasData.elements, id);
    const idsToUpdate = new Set([id, ...descendantIds]);
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          idsToUpdate.has(el.id) ? { ...el, locked: newLocked } : el
        )
      }
    }));
    get().saveToHistory();
  },

  setAllVisibility: (visible) => {
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) => ({ ...el, visible }))
      }
    }));
    get().saveToHistory();
  },

  setAllLock: (locked) => {
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) => ({ ...el, locked }))
      }
    }));
    get().saveToHistory();
  },

  moveElement: (id, targetId, position) => {
    set((state) => {
      const elements = [...state.canvasData.elements];
      const elementById = new Map(elements.map((el) => [el.id, el]));
      const dragged = elementById.get(id);
      if (!dragged) {
        return state;
      }

      if (targetId && targetId === id) {
        return state;
      }

      const descendantIds = getDescendantIds(elements, id);
      if (targetId && descendantIds.includes(targetId)) {
        return state;
      }

      const dragBlockIds = new Set([id, ...descendantIds]);
      const panelOrder = getPanelOrder(elements);
      const dragBlock = panelOrder.filter((el) => dragBlockIds.has(el.id));
      const remaining = panelOrder.filter((el) => !dragBlockIds.has(el.id));

      const targetIndex = targetId
        ? remaining.findIndex((el) => el.id === targetId)
        : remaining.length;
      const safeTargetIndex = targetIndex === -1 ? remaining.length : targetIndex;
      let insertIndex = safeTargetIndex;

      if (targetId) {
        const target = elementById.get(targetId);
        if (!target) {
          insertIndex = remaining.length;
        } else if (position === "inside") {
          insertIndex = safeTargetIndex + 1;
        } else if (position === "after") {
          let lastIndex = safeTargetIndex;
          for (let idx = safeTargetIndex + 1; idx < remaining.length; idx += 1) {
            if (isDescendantOf(remaining[idx], targetId, elementById)) {
              lastIndex = idx;
            } else {
              break;
            }
          }
          insertIndex = lastIndex + 1;
        }
      }

      const newOrder = [
        ...remaining.slice(0, insertIndex),
        ...dragBlock,
        ...remaining.slice(insertIndex)
      ];

      let newParentId: string | undefined;
      if (position === "inside" && targetId) {
        newParentId = targetId;
      } else if (targetId) {
        newParentId = elementById.get(targetId)?.parentId;
      }

      if (position === "root" || !targetId) {
        newParentId = undefined;
      }

      const orderLength = newOrder.length;
      const updatedById = new Map<string, LayoutElement>();
      newOrder.forEach((el, index) => {
        const base = elementById.get(el.id) ?? el;
        const updated: LayoutElement = {
          ...base,
          zIndex: orderLength - 1 - index
        };
        if (el.id === id) {
          updated.parentId = newParentId;
        }
        updatedById.set(el.id, updated);
      });

      return {
        canvasData: {
          ...state.canvasData,
          elements: elements.map((el) => updatedById.get(el.id) ?? el)
        }
      };
    });
    get().saveToHistory();
  },

  setElements: (elements) => {
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements
      }
    }));
    get().saveToHistory();
  },

  groupElements: (ids) => {
    set((state) => {
      if (ids.length < 2) {
        return state;
      }
      const elements = [...state.canvasData.elements];
      const elementById = new Map(elements.map((el) => [el.id, el]));
      const selectedIds = ids.filter((id) => elementById.has(id));
      if (selectedIds.length < 2) {
        return state;
      }

      const topLevelIds = selectedIds.filter((id) => {
        const element = elementById.get(id);
        if (!element) {
          return false;
        }
        return !selectedIds.some((otherId) => {
          if (otherId === id) {
            return false;
          }
          const other = elementById.get(otherId);
          return other ? isDescendantOf(element, otherId, elementById) : false;
        });
      });

      const idsToInclude = new Set<string>();
      topLevelIds.forEach((id) => {
        idsToInclude.add(id);
        getDescendantIds(elements, id).forEach((descId) => idsToInclude.add(descId));
      });

      const bounds = getBoundsForIds(elements, Array.from(idsToInclude));
      const parentIds = new Set(topLevelIds.map((id) => elementById.get(id)?.parentId ?? null));
      const groupParentId = parentIds.size === 1 ? Array.from(parentIds)[0] ?? undefined : undefined;

      const maxZIndex = Math.max(0, ...elements.map((el) => el.zIndex));
      const groupId = generateId();
      const groupElement: LayoutElement = {
        id: groupId,
        type: "group",
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: 0,
        zIndex: maxZIndex + 1,
        visible: true,
        locked: false,
        name: `Group ${state.canvasData.elements.length + 1}`,
        properties: { ...DEFAULT_GROUP_PROPS },
        parentId: groupParentId
      };

      const updatedElements = elements.map((el) =>
        topLevelIds.includes(el.id) ? { ...el, parentId: groupId } : el
      );

      return {
        canvasData: {
          ...state.canvasData,
          elements: normalizeZIndex([...updatedElements, groupElement])
        },
        selectedIds: [groupId]
      };
    });
    get().saveToHistory();
  },

  ungroupElements: (ids) => {
    set((state) => {
      const elements = [...state.canvasData.elements];
      const elementById = new Map(elements.map((el) => [el.id, el]));
      const groupIds = ids.filter((id) => elementById.get(id)?.type === "group");
      if (groupIds.length === 0) {
        return state;
      }

      const updated = elements
        .filter((el) => !groupIds.includes(el.id))
        .map((el) => {
          const parentGroup = groupIds.find((groupId) => el.parentId === groupId);
          if (!parentGroup) {
            return el;
          }
          const group = elementById.get(parentGroup);
          return {
            ...el,
            parentId: group?.parentId
          };
        });

      return {
        canvasData: {
          ...state.canvasData,
          elements: normalizeZIndex(updated)
        },
        selectedIds: state.selectedIds.filter((id) => !groupIds.includes(id))
      };
    });
    get().saveToHistory();
  },

  flattenElements: (ids) => {
    set((state) => {
      const elements = [...state.canvasData.elements];
      const elementById = new Map(elements.map((el) => [el.id, el]));
      const groupIds = ids.filter((id) => elementById.get(id)?.type === "group");
      if (groupIds.length === 0) {
        return state;
      }

      const groupsToRemove = new Set<string>();
      const childReparent = new Map<string, string | undefined>();

      groupIds.forEach((groupId) => {
        const group = elementById.get(groupId);
        if (!group) {
          return;
        }
        groupsToRemove.add(groupId);
        const descendants = getDescendantIds(elements, groupId);
        descendants.forEach((descId) => {
          const desc = elementById.get(descId);
          if (desc?.type === "group") {
            groupsToRemove.add(descId);
          } else {
            childReparent.set(descId, group.parentId);
          }
        });
      });

      const updated = elements
        .filter((el) => !groupsToRemove.has(el.id))
        .map((el) => {
          if (!childReparent.has(el.id)) {
            return el;
          }
          return {
            ...el,
            parentId: childReparent.get(el.id)
          };
        });

      return {
        canvasData: {
          ...state.canvasData,
          elements: normalizeZIndex(updated)
        },
        selectedIds: state.selectedIds.filter((id) => !groupsToRemove.has(id))
      };
    });
    get().saveToHistory();
  },

  // Exposed inputs
  addExposedInput: (input) => {
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        exposedInputs: [...state.canvasData.exposedInputs, input]
      }
    }));
  },

  removeExposedInput: (elementId, property) => {
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        exposedInputs: state.canvasData.exposedInputs.filter(
          (ei) => !(ei.elementId === elementId && ei.property === property)
        )
      }
    }));
  },

  updateExposedInput: (elementId, property, updates) => {
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        exposedInputs: state.canvasData.exposedInputs.map((ei) =>
          ei.elementId === elementId && ei.property === property
            ? { ...ei, ...updates }
            : ei
        )
      }
    }));
  },

  // Grid
  setGridSettings: (settings) => {
    set((state) => ({
      gridSettings: { ...state.gridSettings, ...settings }
    }));
  },

  snapToGrid: (value) => {
    const { gridSettings } = get();
    if (!gridSettings.snap) {return value;}
    return Math.round(value / gridSettings.size) * gridSettings.size;
  },

  // Smart snap guides
  setSnapEnabled: (enabled) => {
    set({ snapEnabled: enabled });
  },

  setSnapGuides: (guides) => {
    set({ snapGuides: guides });
  },

  clearSnapGuides: () => {
    set({ snapGuides: [] });
  },

  calculateSnapGuides: (elementId, x, y, width, height) => {
    const { canvasData, snapEnabled, snapThreshold } = get();
    
    if (!snapEnabled) {
      return { x, y, guides: [] };
    }
    
    const guides: SnapGuide[] = [];
    let snappedX = x;
    let snappedY = y;
    
    // Type for snap alignment sources
    type SnapSource = "left" | "right" | "center" | "top" | "bottom";
    
    // Get other elements (not the one being dragged)
    // Note: This filter runs on every drag move event. For canvases with 
    // many elements, consider caching the visible elements list.
    const otherElements = canvasData.elements.filter((el) => el.id !== elementId && el.visible);
    
    // Calculate edges and centers for the dragged element
    const draggedLeft = x;
    const draggedRight = x + width;
    const draggedTop = y;
    const draggedBottom = y + height;
    const draggedCenterX = x + width / 2;
    const draggedCenterY = y + height / 2;
    
    // Also consider canvas edges
    const allEdgesX = [0, canvasData.width];
    const allEdgesY = [0, canvasData.height];
    const allCentersX = [canvasData.width / 2];
    const allCentersY = [canvasData.height / 2];
    
    // Collect edges and centers from other elements
    for (const el of otherElements) {
      allEdgesX.push(el.x, el.x + el.width);
      allEdgesY.push(el.y, el.y + el.height);
      allCentersX.push(el.x + el.width / 2);
      allCentersY.push(el.y + el.height / 2);
    }
    
    // Check horizontal snapping (X axis)
    let bestSnapX: { target: number; offset: number; source: SnapSource } | null = null;
    
    // Left edge alignment
    for (const edgeX of allEdgesX) {
      const diff = edgeX - draggedLeft;
      if (Math.abs(diff) <= snapThreshold) {
        if (!bestSnapX || Math.abs(diff) < Math.abs(bestSnapX.offset)) {
          bestSnapX = { target: edgeX, offset: diff, source: "left" };
        }
      }
    }
    
    // Right edge alignment
    for (const edgeX of allEdgesX) {
      const diff = edgeX - draggedRight;
      if (Math.abs(diff) <= snapThreshold) {
        if (!bestSnapX || Math.abs(diff) < Math.abs(bestSnapX.offset)) {
          bestSnapX = { target: edgeX - width, offset: diff, source: "right" };
        }
      }
    }
    
    // Center alignment
    for (const centerX of allCentersX) {
      const diff = centerX - draggedCenterX;
      if (Math.abs(diff) <= snapThreshold) {
        if (!bestSnapX || Math.abs(diff) < Math.abs(bestSnapX.offset)) {
          bestSnapX = { target: centerX - width / 2, offset: diff, source: "center" };
        }
      }
    }
    
    // Check vertical snapping (Y axis)
    let bestSnapY: { target: number; offset: number; source: SnapSource } | null = null;
    
    // Top edge alignment
    for (const edgeY of allEdgesY) {
      const diff = edgeY - draggedTop;
      if (Math.abs(diff) <= snapThreshold) {
        if (!bestSnapY || Math.abs(diff) < Math.abs(bestSnapY.offset)) {
          bestSnapY = { target: edgeY, offset: diff, source: "top" };
        }
      }
    }
    
    // Bottom edge alignment
    for (const edgeY of allEdgesY) {
      const diff = edgeY - draggedBottom;
      if (Math.abs(diff) <= snapThreshold) {
        if (!bestSnapY || Math.abs(diff) < Math.abs(bestSnapY.offset)) {
          bestSnapY = { target: edgeY - height, offset: diff, source: "bottom" };
        }
      }
    }
    
    // Center alignment
    for (const centerY of allCentersY) {
      const diff = centerY - draggedCenterY;
      if (Math.abs(diff) <= snapThreshold) {
        if (!bestSnapY || Math.abs(diff) < Math.abs(bestSnapY.offset)) {
          bestSnapY = { target: centerY - height / 2, offset: diff, source: "center" };
        }
      }
    }
    
    // Apply snapping
    if (bestSnapX) {
      snappedX = bestSnapX.target;
      const guideX = bestSnapX.source === "left" ? snappedX : 
                     bestSnapX.source === "right" ? snappedX + width :
                     snappedX + width / 2;
      guides.push({
        type: "vertical",
        position: guideX,
        start: 0,
        end: canvasData.height
      });
    }
    
    if (bestSnapY) {
      snappedY = bestSnapY.target;
      const guideY = bestSnapY.source === "top" ? snappedY :
                     bestSnapY.source === "bottom" ? snappedY + height :
                     snappedY + height / 2;
      guides.push({
        type: "horizontal",
        position: guideY,
        start: 0,
        end: canvasData.width
      });
    }
    
    return { x: snappedX, y: snappedY, guides };
  },

  // Copy/paste
  copyToClipboard: (ids) => {
    const elements = get().canvasData.elements.filter((el) => ids.includes(el.id));
    set({ clipboard: elements });
  },

  pasteFromClipboard: (offsetX = 20, offsetY = 20) => {
    const { clipboard } = get();
    if (clipboard.length === 0) {return [];}

    const maxZIndex = Math.max(0, ...get().canvasData.elements.map((el) => el.zIndex));
    const newElements = clipboard.map((el, idx) => ({
      ...el,
      id: generateId(),
      x: el.x + offsetX,
      y: el.y + offsetY,
      zIndex: maxZIndex + idx + 1,
      name: `${el.name} copy`
    }));

    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: [...state.canvasData.elements, ...newElements]
      },
      selectedIds: newElements.map((el) => el.id)
    }));

    get().saveToHistory();
    return newElements;
  },

  // History (undo/redo)
  saveToHistory: () => {
    set((state) => {
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      // Ensure type field is preserved in history
      newHistory.push({ ...state.canvasData, type: "layout_canvas" as const });
      
      // Limit history to 50 entries
      if (newHistory.length > 50) {
        newHistory.shift();
      }
      
      return {
        history: newHistory,
        historyIndex: newHistory.length - 1
      };
    });
  },

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      set({
        canvasData: { ...history[newIndex], type: "layout_canvas" as const },
        historyIndex: newIndex
      });
    }
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      set({
        canvasData: { ...history[newIndex], type: "layout_canvas" as const },
        historyIndex: newIndex
      });
    }
  },

  // Find element
  findElement: (id) => {
    return get().canvasData.elements.find((el) => el.id === id);
  },

  getSelectedElements: () => {
    const { canvasData, selectedIds } = get();
    return canvasData.elements.filter((el) => selectedIds.includes(el.id));
  }
}));

// Export type for the store
export type LayoutCanvasStore = ReturnType<typeof useLayoutCanvasStore.getState>;
