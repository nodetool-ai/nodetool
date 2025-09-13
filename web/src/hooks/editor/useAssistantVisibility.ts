import { useCallback, useEffect, useState } from "react";

interface UseAssistantVisibilityOptions {
  storageKey?: string;
  defaultVisible?: boolean;
}

export function useAssistantVisibility(
  options: UseAssistantVisibilityOptions = {}
) {
  const {
    storageKey = "textEditorModal_assistantVisible",
    defaultVisible = true
  } = options;

  const getInitialVisible = useCallback(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "true" || saved === "false") return saved === "true";
    } catch {
      /* empty */
    }
    return defaultVisible;
  }, [storageKey, defaultVisible]);

  const [assistantVisible, setAssistantVisible] =
    useState<boolean>(getInitialVisible);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, assistantVisible ? "true" : "false");
    } catch {
      /* empty */
    }
  }, [assistantVisible, storageKey]);

  const toggleAssistantVisible = useCallback(() => {
    setAssistantVisible((v) => !v);
  }, []);

  return {
    assistantVisible,
    setAssistantVisible,
    toggleAssistantVisible
  } as const;
}
