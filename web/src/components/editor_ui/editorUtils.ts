/**
 * Editor Utilities
 *
 * Shared utility functions and class names for editor UI components.
 */

/**
 * Common class names used in editor components.
 * These classes are used for ReactFlow behavior control.
 */
export const editorClassNames = {
  /**
   * Prevents ReactFlow from starting a drag when interacting with the element.
   * Use on inputs, buttons, and other interactive elements within nodes.
   */
  nodrag: "nodrag",

  /**
   * Prevents scroll wheel events from being captured by ReactFlow zoom.
   * Use on scrollable containers like textareas when focused.
   */
  nowheel: "nowheel",

  /**
   * Prevents pan interactions from starting on this element.
   * Use on elements that shouldn't trigger panning.
   */
  nopan: "nopan"
} as const;

/**
 * Combines multiple class names, filtering out falsy values.
 *
 * @param classes - Class names to combine
 * @returns Combined class string
 *
 * @example
 * cn(editorClassNames.nodrag, isFocused && editorClassNames.nowheel)
 * // Returns "nodrag nowheel" or "nodrag"
 */
export const cn = (
  ...classes: (string | boolean | null | undefined)[]
): string => {
  return classes.filter(Boolean).join(" ");
};

/**
 * Common slot props for MUI TextField to maintain nodrag behavior.
 * Spread this into TextField's slotProps to prevent drag issues.
 *
 * @example
 * <TextField slotProps={textFieldNodragSlotProps} />
 */
export const textFieldNodragSlotProps = {
  input: {
    className: editorClassNames.nodrag
  },
  htmlInput: {
    className: editorClassNames.nodrag
  }
} as const;

/**
 * Event handlers to stop propagation for interactive elements in nodes.
 * Prevents ReactFlow from capturing mouse/pointer events.
 *
 * @example
 * <div {...stopPropagationHandlers}>
 *   <TextField />
 * </div>
 */
export const stopPropagationHandlers = {
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation()
} as const;
