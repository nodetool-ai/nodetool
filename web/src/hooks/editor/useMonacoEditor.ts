import { useCallback, useRef, useState } from "react";

type MonacoComponent = (props: {
  value: string;
  onChange?: (val?: string) => void;
  language?: string;
  theme?: string;
  options?: Record<string, unknown>;
  width?: string | number;
  height?: string | number;
  onMount?: (editor: unknown, monaco: unknown) => void;
}) => JSX.Element;

export function useMonacoEditor() {
  const [MonacoEditor, setMonacoEditor] = useState<MonacoComponent | null>(
    null
  );
  const [monacoLoadError, setMonacoLoadError] = useState<string | null>(null);

  const monacoRef = useRef<any>(null);

  const monacoOnMount = useCallback((editor: any) => {
    monacoRef.current = editor;
  }, []);

  const loadMonacoIfNeeded = useCallback(async () => {
    if (MonacoEditor || monacoLoadError) return;
    try {
      const mod = await import("@monaco-editor/react");
      setMonacoEditor(() => mod.default as unknown as MonacoComponent);
    } catch {
      setMonacoLoadError("Failed to load code editor");
    }
  }, [MonacoEditor, monacoLoadError]);

  const handleMonacoFind = useCallback(() => {
    try {
      const editor = monacoRef.current;
      editor?.getAction?.("actions.find")?.run?.();
    } catch {
      /* empty */
    }
  }, []);

  const handleMonacoFormat = useCallback(() => {
    try {
      const editor = monacoRef.current;
      editor?.getAction?.("editor.action.formatDocument")?.run?.();
    } catch {
      /* empty */
    }
  }, []);

  return {
    MonacoEditor,
    monacoLoadError,
    loadMonacoIfNeeded,
    monacoRef,
    monacoOnMount,
    handleMonacoFind,
    handleMonacoFormat
  } as const;
}


