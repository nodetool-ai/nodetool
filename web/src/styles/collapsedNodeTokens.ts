/**
 * Workflow node collapsed (header-only) layout tokens.
 *
 * Canonical definitions: `styles/vars.css` (`--node-collapsed-*`).
 * Global selectors: `styles/collapsed.css`.
 */

/** Emotion `&.collapsed` / inner chrome — mirrors `--node-collapsed-*` */
export const NODE_COLLAPSED_LAYOUT = {
  height: "var(--node-collapsed-height)",
  minHeight: "var(--node-collapsed-min-height)",
  maxHeight: "var(--node-collapsed-max-height)",
  overflow: "var(--node-collapsed-overflow)"
} as const;

/**
 * Vertical center for handles anchored in the header row (constant string helper,
 * aligns with collapsed.css `.react-flow__handle` rules).
 */
export const NODE_COLLAPSED_HANDLE_CENTER = {
  top: "var(--node-collapsed-handle-mid-y)",
  transform: "translateY(-50%)"
} as const;

/** Overrides expanded-node `height: 100%` rules (e.g. Constant String). */
export const NODE_COLLAPSED_BODY_HEIGHT_WIN =
  "var(--node-collapsed-height) !important";

/** MUI `sx` / BaseNode collapsed size branch (adds stretch for flex parents) */
export const NODE_COLLAPSED_BASE_NODE_SX = {
  ...NODE_COLLAPSED_LAYOUT,
  alignSelf: "stretch" as const
} as const;
