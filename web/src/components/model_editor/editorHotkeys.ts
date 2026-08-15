export type Model3DEditorHotkey =
  | "save"
  | "delete"
  | "translate"
  | "rotate"
  | "scale";

/**
 * Map a key event to a 3D editor command.
 *
 * Cmd/Ctrl+S is save. Bare `s` is scale. The save chord must win, or the
 * standard save shortcut only changes the gizmo mode.
 */
export const model3DEditorHotkey = (e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}): Model3DEditorHotkey | null => {
  if (e.metaKey || e.ctrlKey) {
    if (e.key === "s" || e.key === "S") {
      return "save";
    }
    return null;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    return "delete";
  }
  if (e.key === "g") {
    return "translate";
  }
  if (e.key === "r") {
    return "rotate";
  }
  if (e.key === "s") {
    return "scale";
  }
  return null;
};
