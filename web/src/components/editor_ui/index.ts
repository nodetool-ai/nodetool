/**
 * Editor UI Primitives
 *
 * This module exports editor-specific UI components and utilities.
 * These components are designed for use in node properties, the inspector,
 * and other editor contexts.
 *
 * Usage:
 * - Wrap your editor context with EditorUiProvider to set the scope
 * - Use NodeTextField, NodeSwitch, NodeSelect instead of raw MUI components
 * - Use editorClassNames.nodrag and other utilities for ReactFlow compatibility
 *
 * @example
 * import {
 *   EditorUiProvider,
 *   NodeTextField,
 *   NodeSwitch,
 *   NodeSelect,
 *   NodeMenuItem
 * } from "../editor_ui";
 *
 * // In Inspector
 * <EditorUiProvider scope="inspector">
 *   <NodeTextField value={value} onChange={onChange} />
 * </EditorUiProvider>
 *
 * // In Node Editor (default scope)
 * <EditorUiProvider>
 *   <NodeSwitch checked={checked} onChange={onChange} />
 * </EditorUiProvider>
 */

// Context and hooks
export {
  EditorUiProvider,
  useEditorScope
} from "./EditorUiContext";

export type { EditorUiScope } from "./EditorUiContext";

// Primitives
export { NodeTextField } from "./NodeTextField";
export type { NodeTextFieldProps } from "./NodeTextField";

export { NodeSwitch } from "./NodeSwitch";
export type { NodeSwitchProps } from "./NodeSwitch";

export { NodeSelect, NodeMenuItem } from "./NodeSelect";
export type { NodeSelectProps, NodeMenuItemProps } from "./NodeSelect";

export { EditorButton } from "./EditorButton";
export type { EditorButtonProps } from "./EditorButton";

export { EditorMenu, EditorMenuItem } from "./EditorMenu";
export type { EditorMenuProps, EditorMenuItemProps } from "./EditorMenu";

// Utilities
export {
  editorClassNames,
  cn,
  textFieldNodragSlotProps,
  stopPropagationHandlers
} from "./editorUtils";
