import { useEffect } from "react";
import { useCombo } from "../../stores/KeyPressedStore";

export function useEditorKeyboardShortcuts(options: {
  onToggleFullscreen: () => void;
  onToggleAssistant: () => void;
  onToggleEditorMode: () => void;
}) {
  const { onToggleFullscreen, onToggleAssistant, onToggleEditorMode } = options;

  // Register combos; the hook itself is declarative wrappers around useCombo
  useCombo(["ctrl", "shift", "f"], onToggleFullscreen, false);
  useCombo(["meta", "shift", "f"], onToggleFullscreen, false);
  useCombo(["ctrl", "shift", "a"], onToggleAssistant, false);
  useCombo(["meta", "shift", "a"], onToggleAssistant, false);
  useCombo(["ctrl", "shift", "e"], onToggleEditorMode, false);
  useCombo(["meta", "shift", "e"], onToggleEditorMode, false);

  // No return value; side-effect registration only
  useEffect(() => {}, []);
}



