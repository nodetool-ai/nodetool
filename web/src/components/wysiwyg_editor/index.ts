/**
 * WYSIWYG Editor Module
 *
 * A visual editor for composing MUI-based UI layouts.
 * Produces clean JSON schema output that can be rendered or transformed.
 */

// Main component
export { WysiwygEditor, type WysiwygEditorProps } from "./WysiwygEditor";
export { default } from "./WysiwygEditor";

// Types
export * from "./types";

// Utility functions
export * from "./utils/schemaUtils";

// Store
export { useWysiwygEditorStore, useWysiwygHistory } from "./hooks/useWysiwygEditorStore";

// Components (for advanced usage)
export { ComponentRenderer } from "./components/ComponentRenderer";
export { ComponentTree } from "./components/ComponentTree";
export { Canvas } from "./components/Canvas";
export { PropertiesPanel } from "./components/PropertiesPanel";
