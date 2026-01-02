/**
 * useDynamicProperties Hook
 *
 * Integrates with NodeTool's workflow system to provide
 * dynamic property binding capabilities for the HTML builder.
 */

import { useCallback, useMemo } from "react";
import { useHTMLBuilderStore } from "../../../../stores/useHTMLBuilderStore";
import type {
  WorkflowInput,
  PropertyBinding,
  NodeToolPropertyType,
  BuilderElement
} from "../types/builder.types";
import {
  mapPropertyType,
  suggestBindings,
  getBindableAttributes,
  getBindableStyles,
  isCompatibleType,
  getPropertyTypeIcon
} from "../utils/propertyResolver";

/**
 * Binding suggestion for UI
 */
export interface BindingSuggestion {
  /** The workflow input */
  input: WorkflowInput;
  /** Suggested target (attribute name or 'content') */
  target: string;
  /** Type of binding */
  bindingType: PropertyBinding["bindingType"];
  /** Human-readable description */
  description: string;
  /** Icon for the property type */
  icon: string;
}

/**
 * Return type for useDynamicProperties hook
 */
export interface UseDynamicPropertiesReturn {
  /** Available workflow inputs for binding */
  workflowInputs: WorkflowInput[];
  /** Set available workflow inputs */
  setWorkflowInputs: (inputs: WorkflowInput[]) => void;

  /** Get bindings for an element */
  getElementBindings: (elementId: string) => Record<string, PropertyBinding>;
  /** Get binding suggestions for an element based on its tag */
  getSuggestions: (element: BuilderElement) => BindingSuggestion[];
  /** Get bindable attributes for an element's tag */
  getBindableAttributesForElement: (
    element: BuilderElement
  ) => Array<{ name: string; description: string; types: NodeToolPropertyType[] }>;
  /** Get bindable style properties */
  getBindableStyleProperties: () => Array<{
    name: string;
    cssProperty: string;
    description: string;
    types: NodeToolPropertyType[];
  }>;

  /** Create a property binding */
  createBinding: (
    elementId: string,
    input: WorkflowInput,
    target: string,
    bindingType: PropertyBinding["bindingType"]
  ) => void;
  /** Remove a property binding */
  removeBinding: (elementId: string, bindingKey: string) => void;

  /** Check if an input is compatible with a target type */
  isInputCompatible: (
    input: WorkflowInput,
    targetTypes: NodeToolPropertyType[]
  ) => boolean;

  /** Get icon for a property type */
  getTypeIcon: (type: NodeToolPropertyType) => string;
  /** Map an API type string to NodeTool property type */
  mapType: (apiType: string) => NodeToolPropertyType;

  /** Filter inputs by type compatibility */
  filterInputsByType: (
    targetTypes: NodeToolPropertyType[]
  ) => WorkflowInput[];
}

/**
 * Hook for managing dynamic property bindings
 */
export const useDynamicProperties = (): UseDynamicPropertiesReturn => {
  // Get state from store
  const workflowInputs = useHTMLBuilderStore((state) => state.workflowInputs);
  const elements = useHTMLBuilderStore((state) => state.elements);

  // Store actions
  const storeSetWorkflowInputs = useHTMLBuilderStore(
    (state) => state.setWorkflowInputs
  );
  const storeBindProperty = useHTMLBuilderStore((state) => state.bindProperty);
  const storeUnbindProperty = useHTMLBuilderStore(
    (state) => state.unbindProperty
  );

  // Set workflow inputs
  const setWorkflowInputs = useCallback(
    (inputs: WorkflowInput[]) => {
      storeSetWorkflowInputs(inputs);
    },
    [storeSetWorkflowInputs]
  );

  // Get element bindings
  const getElementBindings = useCallback(
    (elementId: string): Record<string, PropertyBinding> => {
      const element = elements[elementId];
      return element?.propertyBindings || {};
    },
    [elements]
  );

  // Get binding suggestions for an element
  const getSuggestions = useCallback(
    (element: BuilderElement): BindingSuggestion[] => {
      const rawSuggestions = suggestBindings(element.tag, workflowInputs);

      return rawSuggestions.map((suggestion) => ({
        input: suggestion.input,
        target: suggestion.suggestedAttribute,
        bindingType: suggestion.bindingType,
        description: `Bind "${suggestion.input.name}" to ${suggestion.suggestedAttribute}`,
        icon: getPropertyTypeIcon(suggestion.input.type)
      }));
    },
    [workflowInputs]
  );

  // Get bindable attributes for an element
  const getBindableAttributesForElement = useCallback(
    (element: BuilderElement) => {
      return getBindableAttributes(element.tag);
    },
    []
  );

  // Get bindable style properties
  const getBindableStyleProperties = useCallback(() => {
    return getBindableStyles();
  }, []);

  // Create a binding
  const createBinding = useCallback(
    (
      elementId: string,
      input: WorkflowInput,
      target: string,
      bindingType: PropertyBinding["bindingType"]
    ) => {
      const binding: PropertyBinding = {
        propertyName: input.name,
        propertyType: input.type,
        bindingType
      };

      if (bindingType === "attribute") {
        binding.attributeName = target;
      } else if (bindingType === "style") {
        binding.styleProperty = target;
      }

      // Use a unique key for the binding
      const bindingKey =
        bindingType === "content" ? "content" : `${bindingType}:${target}`;
      storeBindProperty(elementId, bindingKey, binding);
    },
    [storeBindProperty]
  );

  // Remove a binding
  const removeBinding = useCallback(
    (elementId: string, bindingKey: string) => {
      storeUnbindProperty(elementId, bindingKey);
    },
    [storeUnbindProperty]
  );

  // Check input compatibility
  const isInputCompatible = useCallback(
    (input: WorkflowInput, targetTypes: NodeToolPropertyType[]): boolean => {
      return isCompatibleType(input.type, targetTypes);
    },
    []
  );

  // Get type icon
  const getTypeIcon = useCallback((type: NodeToolPropertyType): string => {
    return getPropertyTypeIcon(type);
  }, []);

  // Map type
  const mapType = useCallback((apiType: string): NodeToolPropertyType => {
    return mapPropertyType(apiType);
  }, []);

  // Filter inputs by type
  const filterInputsByType = useCallback(
    (targetTypes: NodeToolPropertyType[]): WorkflowInput[] => {
      return workflowInputs.filter((input) =>
        isCompatibleType(input.type, targetTypes)
      );
    },
    [workflowInputs]
  );

  return {
    workflowInputs,
    setWorkflowInputs,
    getElementBindings,
    getSuggestions,
    getBindableAttributesForElement,
    getBindableStyleProperties,
    createBinding,
    removeBinding,
    isInputCompatible,
    getTypeIcon,
    mapType,
    filterInputsByType
  };
};

export default useDynamicProperties;
