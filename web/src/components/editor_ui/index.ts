/**
 * Editor UI Component System
 *
 * This module provides a standardized set of UI primitives for the node editor
 * and inspector panels. All components follow these principles:
 *
 * 1. Semantic props (changed, invalid, disabled) express state visually
 * 2. Scope-aware sizing (node vs inspector) via EditorUiProvider
 * 3. Theme values accessed via useTheme() directly
 * 4. ReactFlow compatibility via nodrag/nowheel classes
 * 5. No global CSS selectors or DOM reach-in patterns
 */

// Context
export { EditorUiProvider, useEditorScope } from "./EditorUiContext";
export type { EditorUiScope, EditorUiProviderProps } from "./EditorUiContext";

// Primitives
export { NodeTextField } from "./primitives/NodeTextField";
export type {
  NodeTextFieldProps,
  EditorPrimitiveProps
} from "./primitives/NodeTextField";

export { NodeSelect, NodeMenuItem } from "./primitives/NodeSelect";
export type {
  NodeSelectProps,
  NodeMenuItemProps
} from "./primitives/NodeSelect";

export { NodeSwitch } from "./primitives/NodeSwitch";
export type { NodeSwitchProps } from "./primitives/NodeSwitch";

export { NodeSlider } from "./primitives/NodeSlider";
export type { NodeSliderProps } from "./primitives/NodeSlider";

export { EditorButton } from "./primitives/EditorButton";
export type { EditorButtonProps } from "./primitives/EditorButton";

export { EditorMenu } from "./primitives/EditorMenu";
export type { EditorMenuProps } from "./primitives/EditorMenu";

export { EditorDialog } from "./primitives/EditorDialog";
export type { EditorDialogProps } from "./primitives/EditorDialog";

// Utils
export {
  cn,
  editorClassNames,
  combineEditorClasses
} from "./utils/editorClassNames";
