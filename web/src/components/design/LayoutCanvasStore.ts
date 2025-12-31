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
  DEFAULT_GROUP_PROPS,
  GridSettings
} from "./types";

// Generate unique ID
const generateId = (): string => {
  return `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

interface LayoutCanvasStoreState {
  // Canvas data
  canvasData: LayoutCanvasData;

  // Selection state
  selectedIds: string[];

  // Grid settings
  gridSettings: GridSettings;

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
  alignLeft: (ids: string[]) => void;
  alignCenter: (ids: string[]) => void;
  alignRight: (ids: string[]) => void;
  alignTop: (ids: string[]) => void;
  alignMiddle: (ids: string[]) => void;
  alignBottom: (ids: string[]) => void;
  distributeHorizontally: (ids: string[]) => void;
  distributeVertically: (ids: string[]) => void;

  // Visibility & lock
  toggleVisibility: (id: string) => void;
  toggleLock: (id: string) => void;

  // Exposed inputs
  addExposedInput: (input: ExposedInput) => void;
  removeExposedInput: (elementId: string, property: string) => void;
  updateExposedInput: (elementId: string, property: string, updates: Partial<ExposedInput>) => void;

  // Grid
  setGridSettings: (settings: Partial<GridSettings>) => void;
  snapToGrid: (value: number) => number;

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
  clipboard: [],
  history: [DEFAULT_CANVAS_DATA],
  historyIndex: 0,

  // Set entire canvas data
  setCanvasData: (data) => {
    set({ canvasData: data });
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
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.filter((el) => !ids.includes(el.id)),
        exposedInputs: state.canvasData.exposedInputs.filter(
          (ei) => !ids.includes(ei.elementId)
        )
      },
      selectedIds: state.selectedIds.filter((id) => !ids.includes(id))
    }));
    get().saveToHistory();
  },

  // Duplicate elements
  duplicateElements: (ids) => {
    const elements = get().canvasData.elements.filter((el) => ids.includes(el.id));
    const maxZIndex = Math.max(0, ...get().canvasData.elements.map((el) => el.zIndex));
    
    const newElements = elements.map((el, idx) => ({
      ...el,
      id: generateId(),
      x: el.x + 20,
      y: el.y + 20,
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
  alignLeft: (ids) => {
    const elements = get().canvasData.elements.filter((el) => ids.includes(el.id));
    if (elements.length < 2) {return;}
    
    const minX = Math.min(...elements.map((el) => el.x));
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          ids.includes(el.id) ? { ...el, x: minX } : el
        )
      }
    }));
    get().saveToHistory();
  },

  alignCenter: (ids) => {
    const elements = get().canvasData.elements.filter((el) => ids.includes(el.id));
    if (elements.length < 2) {return;}
    
    const centers = elements.map((el) => el.x + el.width / 2);
    const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          ids.includes(el.id) ? { ...el, x: avgCenter - el.width / 2 } : el
        )
      }
    }));
    get().saveToHistory();
  },

  alignRight: (ids) => {
    const elements = get().canvasData.elements.filter((el) => ids.includes(el.id));
    if (elements.length < 2) {return;}
    
    const maxRight = Math.max(...elements.map((el) => el.x + el.width));
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          ids.includes(el.id) ? { ...el, x: maxRight - el.width } : el
        )
      }
    }));
    get().saveToHistory();
  },

  alignTop: (ids) => {
    const elements = get().canvasData.elements.filter((el) => ids.includes(el.id));
    if (elements.length < 2) {return;}
    
    const minY = Math.min(...elements.map((el) => el.y));
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          ids.includes(el.id) ? { ...el, y: minY } : el
        )
      }
    }));
    get().saveToHistory();
  },

  alignMiddle: (ids) => {
    const elements = get().canvasData.elements.filter((el) => ids.includes(el.id));
    if (elements.length < 2) {return;}
    
    const middles = elements.map((el) => el.y + el.height / 2);
    const avgMiddle = middles.reduce((a, b) => a + b, 0) / middles.length;
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          ids.includes(el.id) ? { ...el, y: avgMiddle - el.height / 2 } : el
        )
      }
    }));
    get().saveToHistory();
  },

  alignBottom: (ids) => {
    const elements = get().canvasData.elements.filter((el) => ids.includes(el.id));
    if (elements.length < 2) {return;}
    
    const maxBottom = Math.max(...elements.map((el) => el.y + el.height));
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          ids.includes(el.id) ? { ...el, y: maxBottom - el.height } : el
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
    const positions = elements.map((el) => {
      const pos = currentX;
      currentX += el.width + gap;
      return { id: el.id, x: pos };
    });
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) => {
          const pos = positions.find((p) => p.id === el.id);
          return pos ? { ...el, x: pos.x } : el;
        })
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
    const positions = elements.map((el) => {
      const pos = currentY;
      currentY += el.height + gap;
      return { id: el.id, y: pos };
    });
    
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) => {
          const pos = positions.find((p) => p.id === el.id);
          return pos ? { ...el, y: pos.y } : el;
        })
      }
    }));
    get().saveToHistory();
  },

  // Visibility & lock
  toggleVisibility: (id) => {
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          el.id === id ? { ...el, visible: !el.visible } : el
        )
      }
    }));
    get().saveToHistory();
  },

  toggleLock: (id) => {
    set((state) => ({
      canvasData: {
        ...state.canvasData,
        elements: state.canvasData.elements.map((el) =>
          el.id === id ? { ...el, locked: !el.locked } : el
        )
      }
    }));
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
      newHistory.push({ ...state.canvasData });
      
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
        canvasData: { ...history[newIndex] },
        historyIndex: newIndex
      });
    }
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      set({
        canvasData: { ...history[newIndex] },
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
