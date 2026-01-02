/**
 * useHTMLBuilder Hook
 *
 * Main hook for managing the HTML builder state and operations.
 * Provides a simplified API for common builder operations.
 */

import { useCallback, useMemo } from "react";
import { useHTMLBuilderStore } from "../../../../stores/useHTMLBuilderStore";
import type {
  BuilderElement,
  ComponentDefinition,
  PropertyBinding,
  HTMLGenerationOptions
} from "../types/builder.types";
import type { CSSProperties } from "react";
import {
  componentRegistry,
  getComponentById
} from "../utils/componentRegistry";

/**
 * Return type for useHTMLBuilder hook
 */
export interface UseHTMLBuilderReturn {
  /** All elements in the builder */
  elements: Record<string, BuilderElement>;
  /** Root element IDs */
  rootElementIds: string[];
  /** Currently selected element */
  selectedElement: BuilderElement | null;
  /** Whether the builder has unsaved changes */
  isDirty: boolean;
  /** Whether preview mode is active */
  isPreviewMode: boolean;
  /** Current responsive breakpoint */
  currentBreakpoint: "desktop" | "tablet" | "mobile";

  // Element operations
  /** Add a component from the library */
  addComponent: (
    componentId: string,
    parentId?: string,
    index?: number
  ) => string | null;
  /** Add a custom element */
  addCustomElement: (
    element: Omit<BuilderElement, "id">,
    parentId?: string,
    index?: number
  ) => string;
  /** Update an element */
  updateElement: (id: string, updates: Partial<BuilderElement>) => void;
  /** Delete an element */
  deleteElement: (id: string) => void;
  /** Duplicate an element */
  duplicateElement: (id: string) => string | null;
  /** Move an element */
  moveElement: (id: string, newParentId?: string, index?: number) => void;

  // Selection
  /** Select an element */
  selectElement: (id: string | null) => void;
  /** Clear selection */
  clearSelection: () => void;

  // Styling
  /** Update element styles */
  updateStyles: (id: string, styles: CSSProperties) => void;
  /** Apply a style preset */
  applyStylePreset: (elementId: string, presetId: string) => void;

  // Property binding
  /** Bind a workflow property to an element */
  bindProperty: (
    elementId: string,
    bindingKey: string,
    binding: PropertyBinding
  ) => void;
  /** Remove a property binding */
  unbindProperty: (elementId: string, bindingKey: string) => void;

  // Generation
  /** Generate HTML output */
  generateHTML: (propertyValues?: Record<string, unknown>) => string;
  /** Update generation options */
  updateGenerationOptions: (options: Partial<HTMLGenerationOptions>) => void;

  // State management
  /** Clear all elements */
  clearAll: () => void;
  /** Mark builder as clean (after save) */
  markClean: () => void;
  /** Toggle preview mode */
  togglePreviewMode: () => void;
  /** Set responsive breakpoint */
  setBreakpoint: (breakpoint: "desktop" | "tablet" | "mobile") => void;

  // Component library
  /** Available components */
  components: ComponentDefinition[];
}

/**
 * Main hook for HTML Builder operations
 */
export const useHTMLBuilder = (): UseHTMLBuilderReturn => {
  // Get state and actions from store
  const elements = useHTMLBuilderStore((state) => state.elements);
  const rootElementIds = useHTMLBuilderStore((state) => state.rootElementIds);
  const selectedElementId = useHTMLBuilderStore(
    (state) => state.selectedElementId
  );
  const isDirty = useHTMLBuilderStore((state) => state.isDirty);
  const isPreviewMode = useHTMLBuilderStore((state) => state.isPreviewMode);
  const currentBreakpoint = useHTMLBuilderStore(
    (state) => state.currentBreakpoint
  );
  const stylePresets = useHTMLBuilderStore((state) => state.stylePresets);

  // Store actions
  const storeAddElement = useHTMLBuilderStore((state) => state.addElement);
  const storeUpdateElement = useHTMLBuilderStore((state) => state.updateElement);
  const storeDeleteElement = useHTMLBuilderStore((state) => state.deleteElement);
  const storeDuplicateElement = useHTMLBuilderStore(
    (state) => state.duplicateElement
  );
  const storeMoveElement = useHTMLBuilderStore((state) => state.moveElement);
  const storeSelectElement = useHTMLBuilderStore((state) => state.selectElement);
  const storeClearSelection = useHTMLBuilderStore(
    (state) => state.clearSelection
  );
  const storeBindProperty = useHTMLBuilderStore((state) => state.bindProperty);
  const storeUnbindProperty = useHTMLBuilderStore(
    (state) => state.unbindProperty
  );
  const storeUpdateStyles = useHTMLBuilderStore(
    (state) => state.updateElementStyles
  );
  const storeGenerateHTML = useHTMLBuilderStore((state) => state.generateHTML);
  const storeUpdateGenerationOptions = useHTMLBuilderStore(
    (state) => state.updateGenerationOptions
  );
  const storeClearAll = useHTMLBuilderStore((state) => state.clearAll);
  const storeMarkClean = useHTMLBuilderStore((state) => state.markClean);
  const storeTogglePreviewMode = useHTMLBuilderStore(
    (state) => state.togglePreviewMode
  );
  const storeSetBreakpoint = useHTMLBuilderStore(
    (state) => state.setCurrentBreakpoint
  );

  // Derived state
  const selectedElement = useMemo(() => {
    return selectedElementId ? elements[selectedElementId] || null : null;
  }, [elements, selectedElementId]);

  // Add component from library
  const addComponent = useCallback(
    (componentId: string, parentId?: string, index?: number): string | null => {
      const definition = getComponentById(componentId);
      if (!definition) {
        console.warn(`Component not found: ${componentId}`);
        return null;
      }

      const element: Omit<BuilderElement, "id"> = {
        type: definition.type,
        tag: definition.tag,
        children: [],
        attributes: { ...definition.defaultAttributes },
        styles: { ...definition.defaultStyles },
        textContent: definition.defaultTextContent,
        propertyBindings: {},
        displayName: definition.name
      };

      return storeAddElement(element, parentId, index);
    },
    [storeAddElement]
  );

  // Add custom element
  const addCustomElement = useCallback(
    (
      element: Omit<BuilderElement, "id">,
      parentId?: string,
      index?: number
    ): string => {
      return storeAddElement(element, parentId, index);
    },
    [storeAddElement]
  );

  // Update element
  const updateElement = useCallback(
    (id: string, updates: Partial<BuilderElement>): void => {
      storeUpdateElement(id, updates);
    },
    [storeUpdateElement]
  );

  // Delete element
  const deleteElement = useCallback(
    (id: string): void => {
      storeDeleteElement(id);
    },
    [storeDeleteElement]
  );

  // Duplicate element
  const duplicateElement = useCallback(
    (id: string): string | null => {
      return storeDuplicateElement(id);
    },
    [storeDuplicateElement]
  );

  // Move element
  const moveElement = useCallback(
    (id: string, newParentId?: string, index?: number): void => {
      storeMoveElement(id, newParentId, index);
    },
    [storeMoveElement]
  );

  // Select element
  const selectElement = useCallback(
    (id: string | null): void => {
      storeSelectElement(id);
    },
    [storeSelectElement]
  );

  // Clear selection
  const clearSelection = useCallback((): void => {
    storeClearSelection();
  }, [storeClearSelection]);

  // Update styles
  const updateStyles = useCallback(
    (id: string, styles: CSSProperties): void => {
      storeUpdateStyles(id, styles);
    },
    [storeUpdateStyles]
  );

  // Apply style preset
  const applyStylePreset = useCallback(
    (elementId: string, presetId: string): void => {
      const preset = stylePresets.find((p) => p.id === presetId);
      if (preset) {
        storeUpdateStyles(elementId, preset.styles);
        if (preset.attributes) {
          storeUpdateElement(elementId, {
            attributes: {
              ...elements[elementId]?.attributes,
              ...preset.attributes
            }
          });
        }
      }
    },
    [stylePresets, storeUpdateStyles, storeUpdateElement, elements]
  );

  // Bind property
  const bindProperty = useCallback(
    (
      elementId: string,
      bindingKey: string,
      binding: PropertyBinding
    ): void => {
      storeBindProperty(elementId, bindingKey, binding);
    },
    [storeBindProperty]
  );

  // Unbind property
  const unbindProperty = useCallback(
    (elementId: string, bindingKey: string): void => {
      storeUnbindProperty(elementId, bindingKey);
    },
    [storeUnbindProperty]
  );

  // Generate HTML
  const generateHTML = useCallback(
    (propertyValues?: Record<string, unknown>): string => {
      return storeGenerateHTML(propertyValues);
    },
    [storeGenerateHTML]
  );

  // Update generation options
  const updateGenerationOptions = useCallback(
    (options: Partial<HTMLGenerationOptions>): void => {
      storeUpdateGenerationOptions(options);
    },
    [storeUpdateGenerationOptions]
  );

  // Clear all
  const clearAll = useCallback((): void => {
    storeClearAll();
  }, [storeClearAll]);

  // Mark clean
  const markClean = useCallback((): void => {
    storeMarkClean();
  }, [storeMarkClean]);

  // Toggle preview mode
  const togglePreviewMode = useCallback((): void => {
    storeTogglePreviewMode();
  }, [storeTogglePreviewMode]);

  // Set breakpoint
  const setBreakpoint = useCallback(
    (breakpoint: "desktop" | "tablet" | "mobile"): void => {
      storeSetBreakpoint(breakpoint);
    },
    [storeSetBreakpoint]
  );

  return {
    elements,
    rootElementIds,
    selectedElement,
    isDirty,
    isPreviewMode,
    currentBreakpoint,
    addComponent,
    addCustomElement,
    updateElement,
    deleteElement,
    duplicateElement,
    moveElement,
    selectElement,
    clearSelection,
    updateStyles,
    applyStylePreset,
    bindProperty,
    unbindProperty,
    generateHTML,
    updateGenerationOptions,
    clearAll,
    markClean,
    togglePreviewMode,
    setBreakpoint,
    components: componentRegistry
  };
};

export default useHTMLBuilder;
