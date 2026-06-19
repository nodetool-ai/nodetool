import { type Dispatch, type SetStateAction, useCallback, useState } from "react";

interface UseEditorModeOptions {
  defaultEnabled?: boolean;
  onCodeEnabled?: () => void;
}

export function useEditorMode(options: UseEditorModeOptions = {}): Readonly<{
  isCodeEditor: boolean;
  setIsCodeEditor: Dispatch<SetStateAction<boolean>>;
  toggleEditorMode: () => void;
}> {
  const { defaultEnabled = false, onCodeEnabled } = options;

  const [isCodeEditor, setIsCodeEditor] = useState<boolean>(defaultEnabled);

  const toggleEditorMode = useCallback(() => {
    setIsCodeEditor((prev) => {
      const next = !prev;
      if (next) {
        try {
          onCodeEnabled?.();
        } catch {
          /* empty */
        }
      }
      return next;
    });
  }, [onCodeEnabled]);

  return { isCodeEditor, setIsCodeEditor, toggleEditorMode } as const;
}
