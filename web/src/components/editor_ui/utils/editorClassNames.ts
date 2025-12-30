/**
 * Utility function to conditionally join class names.
 * Filters out falsy values and joins remaining strings with spaces.
 *
 * @example
 * cn("base", isActive && "active", disabled && "disabled")
 * // Returns "base active" if isActive is true and disabled is false
 */
export function cn(
  ...classes: (string | boolean | undefined | null)[]
): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * ReactFlow class names to prevent event propagation.
 * Use these when controls need to intercept drag/scroll/pan events.
 */
export const editorClassNames = {
  /** Prevents node dragging when interacting with the element */
  nodrag: "nodrag",
  /** Prevents mouse wheel scrolling from zooming the canvas */
  nowheel: "nowheel",
  /** Prevents panning when interacting with the element */
  nopan: "nopan"
} as const;

/**
 * Combines multiple editorClassNames together.
 *
 * @example
 * combineEditorClasses("nodrag", "nowheel")
 * // Returns "nodrag nowheel"
 */
export function combineEditorClasses(
  ...classNames: (keyof typeof editorClassNames)[]
): string {
  return classNames.map((name) => editorClassNames[name]).join(" ");
}
