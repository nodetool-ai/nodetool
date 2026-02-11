/**
 * useComponentSelection Hook
 *
 * Handles component selection, focus, and multi-select operations
 * in the HTML builder canvas.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useHTMLBuilderStore } from "../../../../stores/useHTMLBuilderStore";
import type { BuilderElement } from "../types/builder.types";

/**
 * Return type for useComponentSelection hook
 */
export interface UseComponentSelectionReturn {
  /** Currently selected element ID */
  selectedId: string | null;
  /** Array of multi-selected element IDs */
  multiSelectedIds: string[];
  /** The currently selected element */
  selectedElement: BuilderElement | null;
  /** All selected elements (for multi-select) */
  selectedElements: BuilderElement[];
  /** Whether any element is selected */
  hasSelection: boolean;
  /** Whether multiple elements are selected */
  hasMultiSelection: boolean;

  // Selection actions
  /** Select a single element (clears other selections) */
  select: (id: string | null) => void;
  /** Toggle selection for multi-select (Ctrl/Cmd+click) */
  toggleSelect: (id: string) => void;
  /** Add to selection without clearing others (Shift+click) */
  addToSelection: (id: string) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Select all elements */
  selectAll: () => void;
  /** Check if an element is selected */
  isSelected: (id: string) => boolean;

  // Focus navigation
  /** Select next sibling element */
  selectNextSibling: () => void;
  /** Select previous sibling element */
  selectPreviousSibling: () => void;
  /** Select parent element */
  selectParent: () => void;
  /** Select first child element */
  selectFirstChild: () => void;

  // Bulk operations
  /** Delete all selected elements */
  deleteSelected: () => void;
  /** Duplicate all selected elements */
  duplicateSelected: () => void;
}

/**
 * Hook for managing component selection in the builder
 */
export const useComponentSelection = (): UseComponentSelectionReturn => {
  // Get state from store
  const elements = useHTMLBuilderStore((state) => state.elements);
  const rootElementIds = useHTMLBuilderStore((state) => state.rootElementIds);
  const selectedElementId = useHTMLBuilderStore(
    (state) => state.selectedElementId
  );
  const multiSelectedIds = useHTMLBuilderStore(
    (state) => state.multiSelectedIds
  );

  // Store actions
  const storeSelectElement = useHTMLBuilderStore((state) => state.selectElement);
  const storeToggleSelection = useHTMLBuilderStore(
    (state) => state.toggleElementSelection
  );
  const storeClearSelection = useHTMLBuilderStore(
    (state) => state.clearSelection
  );
  const storeDeleteElement = useHTMLBuilderStore((state) => state.deleteElement);
  const storeDuplicateElement = useHTMLBuilderStore(
    (state) => state.duplicateElement
  );

  // Derived state
  const selectedElement = useMemo(() => {
    return selectedElementId ? elements[selectedElementId] || null : null;
  }, [elements, selectedElementId]);

  const selectedElements = useMemo(() => {
    return multiSelectedIds
      .map((id) => elements[id])
      .filter((el): el is BuilderElement => el !== undefined);
  }, [elements, multiSelectedIds]);

  const hasSelection = selectedElementId !== null;
  const hasMultiSelection = multiSelectedIds.length > 1;

  // Select single element
  const select = useCallback(
    (id: string | null) => {
      storeSelectElement(id);
    },
    [storeSelectElement]
  );

  // Toggle selection for multi-select
  const toggleSelect = useCallback(
    (id: string) => {
      storeToggleSelection(id);
    },
    [storeToggleSelection]
  );

  // Add to selection (for shift+click range selection)
  const addToSelection = useCallback(
    (id: string) => {
      if (!multiSelectedIds.includes(id)) {
        storeToggleSelection(id);
      }
    },
    [multiSelectedIds, storeToggleSelection]
  );

  // Clear all selections
  const clearSelection = useCallback(() => {
    storeClearSelection();
  }, [storeClearSelection]);

  // Select all elements
  const selectAll = useCallback(() => {
    // Select all root elements and their children
    const allIds = Object.keys(elements);
    if (allIds.length > 0) {
      storeSelectElement(allIds[0]);
      for (let i = 1; i < allIds.length; i++) {
        storeToggleSelection(allIds[i]);
      }
    }
  }, [elements, storeSelectElement, storeToggleSelection]);

  // Check if element is selected
  const isSelected = useCallback(
    (id: string): boolean => {
      return multiSelectedIds.includes(id);
    },
    [multiSelectedIds]
  );

  // Get sibling IDs for navigation
  const getSiblingIds = useCallback((): string[] => {
    if (!selectedElement) {
      return rootElementIds;
    }

    if (selectedElement.parentId) {
      const parent = elements[selectedElement.parentId];
      return parent ? parent.children : rootElementIds;
    }

    return rootElementIds;
  }, [selectedElement, elements, rootElementIds]);

  // Select next sibling
  const selectNextSibling = useCallback(() => {
    if (!selectedElementId) {
      // Select first root element
      if (rootElementIds.length > 0) {
        storeSelectElement(rootElementIds[0]);
      }
      return;
    }

    const siblings = getSiblingIds();
    const currentIndex = siblings.indexOf(selectedElementId);

    if (currentIndex < siblings.length - 1) {
      storeSelectElement(siblings[currentIndex + 1]);
    }
  }, [selectedElementId, getSiblingIds, storeSelectElement, rootElementIds]);

  // Select previous sibling
  const selectPreviousSibling = useCallback(() => {
    if (!selectedElementId) {
      // Select last root element
      if (rootElementIds.length > 0) {
        storeSelectElement(rootElementIds[rootElementIds.length - 1]);
      }
      return;
    }

    const siblings = getSiblingIds();
    const currentIndex = siblings.indexOf(selectedElementId);

    if (currentIndex > 0) {
      storeSelectElement(siblings[currentIndex - 1]);
    }
  }, [selectedElementId, getSiblingIds, storeSelectElement, rootElementIds]);

  // Select parent element
  const selectParent = useCallback(() => {
    if (selectedElement?.parentId) {
      storeSelectElement(selectedElement.parentId);
    }
  }, [selectedElement, storeSelectElement]);

  // Select first child element
  const selectFirstChild = useCallback(() => {
    if (selectedElement && selectedElement.children.length > 0) {
      storeSelectElement(selectedElement.children[0]);
    }
  }, [selectedElement, storeSelectElement]);

  // Delete all selected elements
  const deleteSelected = useCallback(() => {
    // Delete in reverse order to avoid issues with parent-child relationships
    const sortedIds = [...multiSelectedIds].sort((a, b) => {
      const elemA = elements[a];
      const elemB = elements[b];

      // Children should be deleted before parents
      if (elemA?.parentId === b) {
        return -1;
      }
      if (elemB?.parentId === a) {
        return 1;
      }
      return 0;
    });

    for (const id of sortedIds) {
      storeDeleteElement(id);
    }
  }, [multiSelectedIds, elements, storeDeleteElement]);

  // Duplicate all selected elements
  const duplicateSelected = useCallback(() => {
    // Only duplicate root elements in selection (children will be included)
    const rootSelectedIds = multiSelectedIds.filter((id) => {
      const elem = elements[id];
      return !elem?.parentId || !multiSelectedIds.includes(elem.parentId);
    });

    const newIds: string[] = [];
    for (const id of rootSelectedIds) {
      const newId = storeDuplicateElement(id);
      if (newId) {
        newIds.push(newId);
      }
    }

    // Select duplicated elements
    if (newIds.length > 0) {
      storeSelectElement(newIds[0]);
      for (let i = 1; i < newIds.length; i++) {
        storeToggleSelection(newIds[i]);
      }
    }
  }, [
    multiSelectedIds,
    elements,
    storeDuplicateElement,
    storeSelectElement,
    storeToggleSelection
  ]);

  // Keyboard shortcuts for selection
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      switch (event.key) {
        case "Escape":
          clearSelection();
          event.preventDefault();
          break;

        case "a":
          if (modKey) {
            selectAll();
            event.preventDefault();
          }
          break;

        case "ArrowDown":
          if (modKey) {
            selectFirstChild();
          } else {
            selectNextSibling();
          }
          event.preventDefault();
          break;

        case "ArrowUp":
          if (modKey) {
            selectParent();
          } else {
            selectPreviousSibling();
          }
          event.preventDefault();
          break;

        case "Delete":
        case "Backspace":
          if (hasSelection && !modKey) {
            deleteSelected();
            event.preventDefault();
          }
          break;

        case "d":
          if (modKey && hasSelection) {
            duplicateSelected();
            event.preventDefault();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    clearSelection,
    selectAll,
    selectNextSibling,
    selectPreviousSibling,
    selectParent,
    selectFirstChild,
    deleteSelected,
    duplicateSelected,
    hasSelection
  ]);

  return {
    selectedId: selectedElementId,
    multiSelectedIds,
    selectedElement,
    selectedElements,
    hasSelection,
    hasMultiSelection,
    select,
    toggleSelect,
    addToSelection,
    clearSelection,
    selectAll,
    isSelected,
    selectNextSibling,
    selectPreviousSibling,
    selectParent,
    selectFirstChild,
    deleteSelected,
    duplicateSelected
  };
};

export default useComponentSelection;
