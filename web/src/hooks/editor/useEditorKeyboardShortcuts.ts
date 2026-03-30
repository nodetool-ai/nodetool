import { useCombo } from "../../stores/KeyPressedStore";

export function useEditorKeyboardShortcuts(options: {
  onToggleFullscreen: () => void;
  onToggleAssistant: () => void;
  onToggleEditorMode: () => void;
}) {
  const { onToggleFullscreen, onToggleAssistant, onToggleEditorMode } = options;

  // Register combos; the hook itself is declarative wrappers around useCombo
  useCombo(["Control", "shift", "f"], onToggleFullscreen, false);
  useCombo(["Meta", "shift", "f"], onToggleFullscreen, false);
  useCombo(["Control", "shift", "a"], onToggleAssistant, false);
  useCombo(["Meta", "shift", "a"], onToggleAssistant, false);
  useCombo(["Control", "shift", "e"], onToggleEditorMode, false);
  useCombo(["Meta", "shift", "e"], onToggleEditorMode, false);
}





