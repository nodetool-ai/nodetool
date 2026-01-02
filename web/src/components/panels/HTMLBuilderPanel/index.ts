/**
 * HTML Builder Panel
 *
 * A professional WYSIWYG HTML builder for NodeTool.
 * Supports dynamic property binding with NodeTool types.
 */

// Main component
export { HTMLBuilderPanel } from "./HTMLBuilderPanel";
export { default } from "./HTMLBuilderPanel";

// Sub-components
export { Canvas } from "./components/Canvas";
export { ComponentLibrary } from "./components/ComponentLibrary";
export { PropertyEditor } from "./components/PropertyEditor";
export { PreviewPane } from "./components/PreviewPane";
export { LayerTree } from "./components/LayerTree";
export { PropertyBindingDialog } from "./components/PropertyBindingDialog";

// Hooks
export { useHTMLBuilder } from "./hooks/useHTMLBuilder";
export { useComponentSelection } from "./hooks/useComponentSelection";
export { useDynamicProperties } from "./hooks/useDynamicProperties";

// Types
export type {
  BuilderElement,
  PropertyBinding,
  HTMLElementType,
  PropertyBindingType,
  NodeToolPropertyType,
  StylePreset,
  ComponentDefinition,
  WorkflowInput,
  HTMLGenerationOptions,
  CanvasState,
  ResponsiveBreakpoint,
  ExportFormat,
  ActionType,
  HistoryEntry
} from "./types/builder.types";

// Utilities
export {
  componentRegistry,
  getComponentsByCategory,
  getComponentById,
  getCategories
} from "./utils/componentRegistry";

export {
  escapeHtml,
  stylesToString,
  stringToStyles,
  resolveMediaRef,
  resolvePropertyValue,
  resolveTemplates,
  resolveBindings,
  generateAttributeString,
  generateElementHTML,
  generateStyleTag,
  generateFullHTML,
  validateHTML,
  minifyHTML,
  prettyPrintHTML
} from "./utils/htmlGenerator";

export {
  mapPropertyType,
  isMediaType,
  isPrimitiveType,
  getMediaAttribute,
  createPropertyBinding,
  suggestBindings,
  getBindableAttributes,
  getBindableStyles,
  isCompatibleType,
  extractWorkflowInputs,
  formatPropertyValue,
  getPropertyTypeIcon
} from "./utils/propertyResolver";
