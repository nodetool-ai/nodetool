/**
 * UI Primitives
 *
 * Re-exports all UI primitives for easy importing.
 * These primitives follow semantic design principles and are theme-driven.
 */

// Export components
export { NodeSlider } from "./NodeSlider";
export type { NodeSliderProps } from "./NodeSlider";

// Re-export editor_ui primitives for convenience
export {
  NodeTextField,
  NodeSwitch,
  NodeSelect,
  NodeMenuItem,
  EditorButton,
  EditorMenu,
  EditorMenuItem
} from "../editor_ui";
export type {
  NodeTextFieldProps,
  NodeSwitchProps,
  NodeSelectProps,
  NodeMenuItemProps,
  EditorButtonProps
} from "../editor_ui";

// Re-export utilities
export {
  editorClassNames,
  reactFlowClasses,
  cn,
  stopPropagationHandlers,
  textFieldNodragSlotProps,
  editorUiClasses
} from "../editor_ui/editorUtils";

// Re-export context
export {
  EditorUiProvider,
  useEditorScope
} from "../editor_ui/EditorUiContext";
export type { EditorUiScope } from "../editor_ui/EditorUiContext";
