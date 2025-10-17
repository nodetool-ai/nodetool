import { useCallback, useEffect, useState } from "react";

export function useCodeLanguage(options: {
  storageKey?: string;
  defaultLanguage: string;
}) {
  const { storageKey = "textEditorModal_codeLanguage", defaultLanguage } =
    options;

  const getInitialCodeLanguage = useCallback(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && typeof saved === "string") return saved;
    } catch {
      /* empty */
    }
    return defaultLanguage;
  }, [storageKey, defaultLanguage]);

  const [codeLanguage, setCodeLanguage] = useState<string>(
    getInitialCodeLanguage
  );

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, codeLanguage);
    } catch {
      /* empty */
    }
  }, [codeLanguage, storageKey]);

  return { codeLanguage, setCodeLanguage } as const;
}
