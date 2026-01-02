/**
 * HTML Builder Store
 *
 * Zustand store for managing the HTML Builder panel state.
 * Handles elements, selection, property bindings, and HTML generation.
 */

import { create } from "zustand";
import { temporal } from "zundo";
import type {
  BuilderElement,
  PropertyBinding,
  StylePreset,
  CanvasState,
  HTMLGenerationOptions,
  WorkflowInput
} from "../components/panels/HTMLBuilderPanel/types/builder.types";
import type { CSSProperties } from "react";

/**
 * Generate a unique ID for elements
 */
const generateId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const randomValue = (Math.random() * 16) | 0;
    const hexValue = char === "x" ? randomValue : (randomValue & 0x3) | 0x8;
    return hexValue.toString(16);
  });
};

/**
 * HTML Builder state interface
 */
export interface HTMLBuilderState {
  /** All builder elements */
  elements: Record<string, BuilderElement>;
  /** Root element IDs (elements without parents) */
  rootElementIds: string[];
  /** Currently selected element ID */
  selectedElementId: string | null;
  /** Multiple selected element IDs */
  multiSelectedIds: string[];
  /** Available workflow inputs for binding */
  workflowInputs: WorkflowInput[];
  /** Style presets */
  stylePresets: StylePreset[];
  /** Canvas state */
  canvas: CanvasState;
  /** HTML generation options */
  generationOptions: HTMLGenerationOptions;
  /** Current responsive breakpoint */
  currentBreakpoint: "desktop" | "tablet" | "mobile";
  /** Whether preview mode is active */
  isPreviewMode: boolean;
  /** Whether the builder is dirty (has unsaved changes) */
  isDirty: boolean;

  // Actions
  /** Add a new element */
  addElement: (
    element: Omit<BuilderElement, "id">,
    parentId?: string,
    index?: number
  ) => string;
  /** Update an existing element */
  updateElement: (id: string, updates: Partial<BuilderElement>) => void;
  /** Delete an element */
  deleteElement: (id: string) => void;
  /** Duplicate an element */
  duplicateElement: (id: string) => string | null;
  /** Move element to a new parent */
  moveElement: (id: string, newParentId?: string, index?: number) => void;
  /** Reorder element within parent */
  reorderElement: (id: string, newIndex: number) => void;
  /** Select an element */
  selectElement: (id: string | null) => void;
  /** Toggle element selection for multi-select */
  toggleElementSelection: (id: string) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Bind a property to an element */
  bindProperty: (
    elementId: string,
    bindingKey: string,
    binding: PropertyBinding
  ) => void;
  /** Unbind a property from an element */
  unbindProperty: (elementId: string, bindingKey: string) => void;
  /** Update element styles */
  updateElementStyles: (id: string, styles: CSSProperties) => void;
  /** Update element attributes */
  updateElementAttributes: (
    id: string,
    attributes: Record<string, string>
  ) => void;
  /** Set workflow inputs */
  setWorkflowInputs: (inputs: WorkflowInput[]) => void;
  /** Update canvas state */
  updateCanvas: (updates: Partial<CanvasState>) => void;
  /** Update generation options */
  updateGenerationOptions: (updates: Partial<HTMLGenerationOptions>) => void;
  /** Set current breakpoint */
  setCurrentBreakpoint: (breakpoint: "desktop" | "tablet" | "mobile") => void;
  /** Toggle preview mode */
  togglePreviewMode: () => void;
  /** Generate HTML output */
  generateHTML: (propertyValues?: Record<string, unknown>) => string;
  /** Load builder state from JSON */
  loadState: (state: Partial<HTMLBuilderState>) => void;
  /** Clear all elements */
  clearAll: () => void;
  /** Get element by ID */
  getElementById: (id: string) => BuilderElement | undefined;
  /** Get children of an element */
  getChildren: (parentId?: string) => BuilderElement[];
  /** Mark as clean (after save) */
  markClean: () => void;
}

/**
 * Default canvas state
 */
const defaultCanvasState: CanvasState = {
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  gridEnabled: true,
  snapToGrid: true,
  gridSize: 8
};

/**
 * Default HTML generation options
 */
const defaultGenerationOptions: HTMLGenerationOptions = {
  inlineStyles: true,
  prettyPrint: true,
  indentation: "  ",
  includeDoctype: true,
  includeFullStructure: true,
  headElements: [],
  metaTags: []
};

/**
 * Default style presets
 */
const defaultStylePresets: StylePreset[] = [
  {
    id: "card",
    name: "Card",
    category: "card",
    styles: {
      backgroundColor: "#ffffff",
      borderRadius: "8px",
      padding: "16px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
    }
  },
  {
    id: "flex-row",
    name: "Flex Row",
    category: "layout",
    styles: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: "8px"
    }
  },
  {
    id: "flex-column",
    name: "Flex Column",
    category: "layout",
    styles: {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    }
  },
  {
    id: "centered",
    name: "Centered",
    category: "layout",
    styles: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    }
  },
  {
    id: "heading",
    name: "Heading",
    category: "typography",
    styles: {
      fontSize: "24px",
      fontWeight: "bold",
      marginBottom: "16px"
    }
  },
  {
    id: "body-text",
    name: "Body Text",
    category: "typography",
    styles: {
      fontSize: "16px",
      lineHeight: "1.5"
    }
  }
];

/**
 * Escape HTML special characters
 */
const escapeHtml = (text: string): string => {
  const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
};

/**
 * Convert CSSProperties to inline style string
 */
const stylesToString = (styles: CSSProperties): string => {
  return Object.entries(styles)
    .map(([key, value]) => {
      const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `${cssKey}: ${value}`;
    })
    .join("; ");
};

/**
 * Resolve property bindings with actual values
 */
const resolveBindings = (
  element: BuilderElement,
  propertyValues: Record<string, unknown>
): { textContent?: string; attributes: Record<string, string> } => {
  const result = {
    textContent: element.textContent,
    attributes: { ...element.attributes }
  };

  for (const [key, binding] of Object.entries(element.propertyBindings)) {
    const value = propertyValues[binding.propertyName];
    if (value === undefined) {
      continue;
    }

    let resolvedValue: string;

    // Handle different property types
    switch (binding.propertyType) {
      case "ImageRef":
      case "VideoRef":
      case "AudioRef":
        // For media refs, try to extract URL
        if (typeof value === "object" && value !== null && "uri" in value) {
          resolvedValue = String((value as { uri: string }).uri);
        } else if (typeof value === "string") {
          resolvedValue = value;
        } else {
          resolvedValue = "";
        }
        break;
      case "number":
      case "boolean":
        resolvedValue = String(value);
        break;
      case "object":
      case "array":
        resolvedValue = JSON.stringify(value);
        break;
      default:
        resolvedValue = String(value);
    }

    // Apply the binding
    if (binding.bindingType === "content") {
      result.textContent = resolvedValue;
    } else if (binding.bindingType === "attribute" && binding.attributeName) {
      result.attributes[binding.attributeName] = resolvedValue;
    }
  }

  // Handle template syntax in text content (e.g., {{property_name}})
  if (result.textContent) {
    result.textContent = result.textContent.replace(
      /\{\{(\w+)\}\}/g,
      (_, propName) => {
        const value = propertyValues[propName];
        return value !== undefined ? String(value) : `{{${propName}}}`;
      }
    );
  }

  // Handle template syntax in attributes
  for (const [attrName, attrValue] of Object.entries(result.attributes)) {
    result.attributes[attrName] = attrValue.replace(
      /\{\{(\w+)\}\}/g,
      (_, propName) => {
        const value = propertyValues[propName];
        return value !== undefined ? String(value) : `{{${propName}}}`;
      }
    );
  }

  return result;
};

/**
 * Create the HTML Builder store
 */
export const useHTMLBuilderStore = create<HTMLBuilderState>()(
  temporal(
    (set, get) => ({
      elements: {},
      rootElementIds: [],
      selectedElementId: null,
      multiSelectedIds: [],
      workflowInputs: [],
      stylePresets: defaultStylePresets,
      canvas: defaultCanvasState,
      generationOptions: defaultGenerationOptions,
      currentBreakpoint: "desktop",
      isPreviewMode: false,
      isDirty: false,

      addElement: (element, parentId, index) => {
        const id = generateId();
        const newElement: BuilderElement = {
          ...element,
          id,
          parentId,
          children: element.children || [],
          propertyBindings: element.propertyBindings || {}
        };

        set((state) => {
          const newElements = { ...state.elements, [id]: newElement };

          let newRootIds = [...state.rootElementIds];
          if (parentId && state.elements[parentId]) {
            // Add to parent's children
            const parent = { ...state.elements[parentId] };
            const childIndex =
              index !== undefined
                ? Math.min(index, parent.children.length)
                : parent.children.length;
            parent.children = [
              ...parent.children.slice(0, childIndex),
              id,
              ...parent.children.slice(childIndex)
            ];
            newElements[parentId] = parent;
          } else {
            // Add to root
            const rootIndex =
              index !== undefined
                ? Math.min(index, newRootIds.length)
                : newRootIds.length;
            newRootIds = [
              ...newRootIds.slice(0, rootIndex),
              id,
              ...newRootIds.slice(rootIndex)
            ];
          }

          return {
            elements: newElements,
            rootElementIds: newRootIds,
            isDirty: true
          };
        });

        return id;
      },

      updateElement: (id, updates) => {
        set((state) => {
          if (!state.elements[id]) {
            return state;
          }
          return {
            elements: {
              ...state.elements,
              [id]: { ...state.elements[id], ...updates }
            },
            isDirty: true
          };
        });
      },

      deleteElement: (id) => {
        set((state) => {
          const element = state.elements[id];
          if (!element) {
            return state;
          }

          // Recursively collect all descendant IDs
          const collectDescendants = (elementId: string): string[] => {
            const el = state.elements[elementId];
            if (!el) {
              return [];
            }
            return [
              elementId,
              ...el.children.flatMap((childId) => collectDescendants(childId))
            ];
          };

          const idsToDelete = new Set(collectDescendants(id));

          // Remove from parent or root
          let newRootIds = state.rootElementIds.filter(
            (rid) => !idsToDelete.has(rid)
          );
          const newElements = { ...state.elements };

          // Update parent's children array
          if (element.parentId && newElements[element.parentId]) {
            newElements[element.parentId] = {
              ...newElements[element.parentId],
              children: newElements[element.parentId].children.filter(
                (childId) => !idsToDelete.has(childId)
              )
            };
          }

          // Delete all collected elements
          for (const deleteId of idsToDelete) {
            delete newElements[deleteId];
          }

          return {
            elements: newElements,
            rootElementIds: newRootIds,
            selectedElementId:
              state.selectedElementId &&
              idsToDelete.has(state.selectedElementId)
                ? null
                : state.selectedElementId,
            multiSelectedIds: state.multiSelectedIds.filter(
              (mid) => !idsToDelete.has(mid)
            ),
            isDirty: true
          };
        });
      },

      duplicateElement: (id) => {
        const state = get();
        const element = state.elements[id];
        if (!element) {
          return null;
        }

        // Deep clone the element and its children
        const cloneElement = (
          el: BuilderElement,
          newParentId?: string
        ): BuilderElement => {
          const newId = generateId();
          const clonedChildren: string[] = [];

          // Clone children first
          for (const childId of el.children) {
            const child = state.elements[childId];
            if (child) {
              const clonedChild = cloneElement(child, newId);
              clonedChildren.push(clonedChild.id);
            }
          }

          return {
            ...el,
            id: newId,
            parentId: newParentId,
            children: clonedChildren,
            displayName: el.displayName ? `${el.displayName} (copy)` : undefined
          };
        };

        const cloned = cloneElement(element, element.parentId);

        // Add all cloned elements
        const addClonedElements = (el: BuilderElement): void => {
          set((s) => ({
            elements: { ...s.elements, [el.id]: el },
            rootElementIds: !el.parentId
              ? [...s.rootElementIds, el.id]
              : s.rootElementIds,
            isDirty: true
          }));

          for (const childId of el.children) {
            const child = { ...state.elements[childId], parentId: el.id };
            addClonedElements(child as BuilderElement);
          }
        };

        // Insert after original
        set((s) => {
          const newElements = { ...s.elements, [cloned.id]: cloned };
          let newRootIds = s.rootElementIds;

          if (element.parentId && s.elements[element.parentId]) {
            const parent = s.elements[element.parentId];
            const originalIndex = parent.children.indexOf(id);
            const newChildren = [...parent.children];
            newChildren.splice(originalIndex + 1, 0, cloned.id);
            newElements[element.parentId] = { ...parent, children: newChildren };
          } else {
            const originalIndex = s.rootElementIds.indexOf(id);
            newRootIds = [...s.rootElementIds];
            newRootIds.splice(originalIndex + 1, 0, cloned.id);
          }

          return {
            elements: newElements,
            rootElementIds: newRootIds,
            isDirty: true
          };
        });

        return cloned.id;
      },

      moveElement: (id, newParentId, index) => {
        set((state) => {
          const element = state.elements[id];
          if (!element) {
            return state;
          }

          const newElements = { ...state.elements };
          let newRootIds = [...state.rootElementIds];

          // Remove from old parent or root
          if (element.parentId && newElements[element.parentId]) {
            newElements[element.parentId] = {
              ...newElements[element.parentId],
              children: newElements[element.parentId].children.filter(
                (c) => c !== id
              )
            };
          } else {
            newRootIds = newRootIds.filter((r) => r !== id);
          }

          // Add to new parent or root
          if (newParentId && newElements[newParentId]) {
            const parent = newElements[newParentId];
            const insertIndex =
              index !== undefined ? index : parent.children.length;
            newElements[newParentId] = {
              ...parent,
              children: [
                ...parent.children.slice(0, insertIndex),
                id,
                ...parent.children.slice(insertIndex)
              ]
            };
          } else {
            const insertIndex =
              index !== undefined ? index : newRootIds.length;
            newRootIds = [
              ...newRootIds.slice(0, insertIndex),
              id,
              ...newRootIds.slice(insertIndex)
            ];
          }

          // Update element's parentId
          newElements[id] = { ...element, parentId: newParentId };

          return {
            elements: newElements,
            rootElementIds: newRootIds,
            isDirty: true
          };
        });
      },

      reorderElement: (id, newIndex) => {
        set((state) => {
          const element = state.elements[id];
          if (!element) {
            return state;
          }

          if (element.parentId) {
            const parent = state.elements[element.parentId];
            if (!parent) {
              return state;
            }
            const children = parent.children.filter((c) => c !== id);
            children.splice(newIndex, 0, id);
            return {
              elements: {
                ...state.elements,
                [element.parentId]: { ...parent, children }
              },
              isDirty: true
            };
          } else {
            const rootIds = state.rootElementIds.filter((r) => r !== id);
            rootIds.splice(newIndex, 0, id);
            return {
              rootElementIds: rootIds,
              isDirty: true
            };
          }
        });
      },

      selectElement: (id) => {
        set({ selectedElementId: id, multiSelectedIds: id ? [id] : [] });
      },

      toggleElementSelection: (id) => {
        set((state) => {
          const newSelected = state.multiSelectedIds.includes(id)
            ? state.multiSelectedIds.filter((mid) => mid !== id)
            : [...state.multiSelectedIds, id];
          return {
            multiSelectedIds: newSelected,
            selectedElementId: newSelected.length > 0 ? newSelected[0] : null
          };
        });
      },

      clearSelection: () => {
        set({ selectedElementId: null, multiSelectedIds: [] });
      },

      bindProperty: (elementId, bindingKey, binding) => {
        set((state) => {
          const element = state.elements[elementId];
          if (!element) {
            return state;
          }
          return {
            elements: {
              ...state.elements,
              [elementId]: {
                ...element,
                propertyBindings: {
                  ...element.propertyBindings,
                  [bindingKey]: binding
                }
              }
            },
            isDirty: true
          };
        });
      },

      unbindProperty: (elementId, bindingKey) => {
        set((state) => {
          const element = state.elements[elementId];
          if (!element) {
            return state;
          }
          const newBindings = { ...element.propertyBindings };
          delete newBindings[bindingKey];
          return {
            elements: {
              ...state.elements,
              [elementId]: {
                ...element,
                propertyBindings: newBindings
              }
            },
            isDirty: true
          };
        });
      },

      updateElementStyles: (id, styles) => {
        set((state) => {
          const element = state.elements[id];
          if (!element) {
            return state;
          }
          return {
            elements: {
              ...state.elements,
              [id]: {
                ...element,
                styles: { ...element.styles, ...styles }
              }
            },
            isDirty: true
          };
        });
      },

      updateElementAttributes: (id, attributes) => {
        set((state) => {
          const element = state.elements[id];
          if (!element) {
            return state;
          }
          return {
            elements: {
              ...state.elements,
              [id]: {
                ...element,
                attributes: { ...element.attributes, ...attributes }
              }
            },
            isDirty: true
          };
        });
      },

      setWorkflowInputs: (inputs) => {
        set({ workflowInputs: inputs });
      },

      updateCanvas: (updates) => {
        set((state) => ({
          canvas: { ...state.canvas, ...updates }
        }));
      },

      updateGenerationOptions: (updates) => {
        set((state) => ({
          generationOptions: { ...state.generationOptions, ...updates }
        }));
      },

      setCurrentBreakpoint: (breakpoint) => {
        set({ currentBreakpoint: breakpoint });
      },

      togglePreviewMode: () => {
        set((state) => ({ isPreviewMode: !state.isPreviewMode }));
      },

      generateHTML: (propertyValues = {}) => {
        const state = get();
        const { generationOptions } = state;
        const indent = generationOptions.indentation;

        const generateElementHTML = (
          elementId: string,
          depth: number
        ): string => {
          const element = state.elements[elementId];
          if (!element) {
            return "";
          }

          const prefix = generationOptions.prettyPrint
            ? indent.repeat(depth)
            : "";
          const newline = generationOptions.prettyPrint ? "\n" : "";

          // Resolve property bindings
          const resolved = resolveBindings(element, propertyValues);

          // Build attributes string
          const attrParts: string[] = [];
          for (const [key, value] of Object.entries(resolved.attributes)) {
            attrParts.push(`${key}="${escapeHtml(value)}"`);
          }

          // Add style attribute
          if (
            Object.keys(element.styles).length > 0 &&
            generationOptions.inlineStyles
          ) {
            attrParts.push(`style="${stylesToString(element.styles)}"`);
          }

          const attrString =
            attrParts.length > 0 ? " " + attrParts.join(" ") : "";

          // Self-closing tags
          const selfClosingTags = [
            "img",
            "br",
            "hr",
            "input",
            "meta",
            "link",
            "area",
            "base",
            "col",
            "embed",
            "source",
            "track",
            "wbr"
          ];

          if (selfClosingTags.includes(element.tag)) {
            return `${prefix}<${element.tag}${attrString} />${newline}`;
          }

          // Generate children HTML
          const childrenHTML = element.children
            .map((childId) => generateElementHTML(childId, depth + 1))
            .join("");

          // Text content
          const textContent = resolved.textContent
            ? escapeHtml(resolved.textContent)
            : "";

          const hasChildren = element.children.length > 0 || textContent;

          if (!hasChildren) {
            return `${prefix}<${element.tag}${attrString}></${element.tag}>${newline}`;
          }

          if (textContent && element.children.length === 0) {
            return `${prefix}<${element.tag}${attrString}>${textContent}</${element.tag}>${newline}`;
          }

          return `${prefix}<${element.tag}${attrString}>${newline}${textContent ? prefix + indent + textContent + newline : ""}${childrenHTML}${prefix}</${element.tag}>${newline}`;
        };

        // Generate body content
        const bodyContent = state.rootElementIds
          .map((id) =>
            generateElementHTML(
              id,
              generationOptions.includeFullStructure ? 2 : 0
            )
          )
          .join("");

        if (!generationOptions.includeFullStructure) {
          return bodyContent;
        }

        // Build meta tags
        const metaTagsHTML = (generationOptions.metaTags || [])
          .map((meta) => `    <meta name="${meta.name}" content="${meta.content}">`)
          .join("\n");

        // Build head elements
        const headElementsHTML = (generationOptions.headElements || [])
          .map((el) => `    ${el}`)
          .join("\n");

        // Build style tag if not inlining
        let styleTagHTML = "";
        if (!generationOptions.inlineStyles) {
          const styles: string[] = [];
          for (const element of Object.values(state.elements)) {
            if (Object.keys(element.styles).length > 0) {
              styles.push(`#${element.id} { ${stylesToString(element.styles)} }`);
            }
          }
          if (styles.length > 0) {
            styleTagHTML = `    <style>\n${styles.map((s) => "      " + s).join("\n")}\n    </style>\n`;
          }
        }

        const doctype = generationOptions.includeDoctype
          ? "<!DOCTYPE html>\n"
          : "";

        return `${doctype}<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
${metaTagsHTML}
${headElementsHTML}
${styleTagHTML}  </head>
  <body>
${bodyContent}  </body>
</html>`;
      },

      loadState: (newState) => {
        set((state) => ({
          ...state,
          ...newState,
          isDirty: false
        }));
      },

      clearAll: () => {
        set({
          elements: {},
          rootElementIds: [],
          selectedElementId: null,
          multiSelectedIds: [],
          isDirty: true
        });
      },

      getElementById: (id) => {
        return get().elements[id];
      },

      getChildren: (parentId) => {
        const state = get();
        const childIds = parentId
          ? state.elements[parentId]?.children || []
          : state.rootElementIds;
        return childIds
          .map((id) => state.elements[id])
          .filter(Boolean) as BuilderElement[];
      },

      markClean: () => {
        set({ isDirty: false });
      }
    }),
    {
      limit: 100,
      partialize: (state) => ({
        elements: state.elements,
        rootElementIds: state.rootElementIds
      })
    }
  )
);
