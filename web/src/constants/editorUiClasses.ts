/**
 * Editor UI marker classes
 *
 * These class names are used to opt-in to editor-specific theme overrides
 * without leaking styles to non-editor screens.
 */

export const editorUiClasses = {
  /** Applied to control roots (OutlinedInput / Select root) */
  control: "nt-editor-control",

  /** Applied to Menu paper (portal-safe) */
  menuPaper: "nt-editor-menu-paper",

  /** Applied to Menu list (portal-safe) */
  menuList: "nt-editor-menu-list",

  /** Applied to MenuItem */
  menuItem: "nt-editor-menu-item",

  /** Applied to Switch root */
  switchRoot: "nt-editor-switch",

  /** Scope markers (optional; useful for node vs inspector density differences) */
  scopeNode: "nt-editor-scope-node",
  scopeInspector: "nt-editor-scope-inspector"
} as const;
