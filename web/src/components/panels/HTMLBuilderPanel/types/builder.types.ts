/**
 * Type definitions for the HTML Builder Panel
 *
 * These types define the structure for the WYSIWYG HTML builder,
 * supporting dynamic property binding with NodeTool types.
 */

import type { CSSProperties } from "react";

/**
 * Supported HTML element types in the builder
 */
export type HTMLElementType =
  | "container"
  | "text"
  | "heading"
  | "image"
  | "button"
  | "input"
  | "media"
  | "form"
  | "list"
  | "table"
  | "custom";

/**
 * Binding type for dynamic properties
 */
export type PropertyBindingType = "content" | "attribute" | "style";

/**
 * Supported NodeTool property types for binding
 */
export type NodeToolPropertyType =
  | "string"
  | "number"
  | "boolean"
  | "ImageRef"
  | "VideoRef"
  | "AudioRef"
  | "TextRef"
  | "object"
  | "array"
  | "any";

/**
 * Property binding configuration
 */
export interface PropertyBinding {
  /** Name of the bound property from workflow */
  propertyName: string;
  /** Type of the property */
  propertyType: NodeToolPropertyType;
  /** How the binding is applied */
  bindingType: PropertyBindingType;
  /** Target attribute name (when bindingType is 'attribute') */
  attributeName?: string;
  /** Style property name (when bindingType is 'style') */
  styleProperty?: string;
  /** Optional transform function name */
  transformName?: string;
}

/**
 * Builder element representing an HTML element in the canvas
 */
export interface BuilderElement {
  /** Unique identifier */
  id: string;
  /** Element type classification */
  type: HTMLElementType;
  /** HTML tag name */
  tag: string;
  /** IDs of child elements */
  children: string[];
  /** Parent element ID (undefined for root elements) */
  parentId?: string;
  /** HTML attributes */
  attributes: Record<string, string>;
  /** CSS styles */
  styles: CSSProperties;
  /** Text content (for text elements) */
  textContent?: string;
  /** Property bindings map (attribute/content name -> binding) */
  propertyBindings: Record<string, PropertyBinding>;
  /** Whether element is selected */
  selected?: boolean;
  /** Whether element is expanded in layer tree */
  expanded?: boolean;
  /** Display name for the element */
  displayName?: string;
}

/**
 * Style preset for quick styling
 */
export interface StylePreset {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Category for grouping */
  category: "layout" | "typography" | "card" | "form" | "custom";
  /** Styles to apply */
  styles: CSSProperties;
  /** Optional attributes to apply */
  attributes?: Record<string, string>;
}

/**
 * Component definition for the component library
 */
export interface ComponentDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Category */
  category: "layout" | "typography" | "forms" | "media" | "interactive";
  /** Icon name */
  icon: string;
  /** Default tag */
  tag: string;
  /** Element type */
  type: HTMLElementType;
  /** Default attributes */
  defaultAttributes: Record<string, string>;
  /** Default styles */
  defaultStyles: CSSProperties;
  /** Default text content */
  defaultTextContent?: string;
  /** Whether it can have children */
  canHaveChildren: boolean;
}

/**
 * Responsive breakpoint configuration
 */
export interface ResponsiveBreakpoint {
  id: string;
  name: string;
  width: number;
  icon: string;
}

/**
 * Available workflow input property for binding
 */
export interface WorkflowInput {
  /** Property name */
  name: string;
  /** Property type */
  type: NodeToolPropertyType;
  /** Description */
  description?: string;
  /** Default value */
  defaultValue?: unknown;
}

/**
 * HTML generation options
 */
export interface HTMLGenerationOptions {
  /** Whether to inline styles or use style tag */
  inlineStyles: boolean;
  /** Whether to pretty print HTML */
  prettyPrint: boolean;
  /** Indentation string */
  indentation: string;
  /** Whether to include DOCTYPE */
  includeDoctype: boolean;
  /** Whether to include full HTML structure */
  includeFullStructure: boolean;
  /** Custom head elements */
  headElements?: string[];
  /** Custom meta tags */
  metaTags?: Array<{ name: string; content: string }>;
}

/**
 * Builder canvas state
 */
export interface CanvasState {
  /** Zoom level (1 = 100%) */
  zoom: number;
  /** Pan offset */
  panOffset: { x: number; y: number };
  /** Grid enabled */
  gridEnabled: boolean;
  /** Snap to grid */
  snapToGrid: boolean;
  /** Grid size in pixels */
  gridSize: number;
}

/**
 * Export format options
 */
export type ExportFormat = "html" | "json";

/**
 * Undo/redo action types
 */
export type ActionType =
  | "add"
  | "delete"
  | "update"
  | "move"
  | "reorder"
  | "bind"
  | "unbind";

/**
 * History entry for undo/redo
 */
export interface HistoryEntry {
  /** Action type */
  type: ActionType;
  /** Timestamp */
  timestamp: number;
  /** Affected element IDs */
  elementIds: string[];
  /** Previous state (for undo) */
  previousState: Partial<BuilderElement>[];
  /** New state (for redo) */
  newState: Partial<BuilderElement>[];
}
