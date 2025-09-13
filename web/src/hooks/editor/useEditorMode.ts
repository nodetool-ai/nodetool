import { useCallback, useEffect, useState } from "react";

interface UseEditorModeOptions {
  storageKey?: string;
  onCodeEnabled?: () => void;
}

export function useEditorMode(options: UseEditorModeOptions = {}) {
  const { storageKey = "textEditorModal_useCodeEditor", onCodeEnabled } =
    options;

  const getInitialIsCodeEditor = useCallback(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "true" || saved === "false") {
        return saved === "true";
      }
    } catch {
      /* empty */
    }
    return false;
  }, [storageKey]);

  const [isCodeEditor, setIsCodeEditor] = useState<boolean>(
    getInitialIsCodeEditor
  );

  // Persist mode to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, isCodeEditor ? "true" : "false");
    } catch {
      /* empty */
    }
  }, [isCodeEditor, storageKey]);

  // Ensure dependent resources are loaded when code editor is enabled
  useEffect(() => {
    if (isCodeEditor) {
      try {
        onCodeEnabled?.();
      } catch {
        /* empty */
      }
    }
  }, [isCodeEditor, onCodeEnabled]);

  const toggleEditorMode = useCallback(() => {
    setIsCodeEditor((prev) => !prev);
  }, []);

  return { isCodeEditor, setIsCodeEditor, toggleEditorMode } as const;
}
