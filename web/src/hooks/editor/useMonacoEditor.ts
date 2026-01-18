import { useCallback, useRef, useState } from "react";

/**
 * Monaco editor component type definition.
 */
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

/**
 * Result object containing Monaco editor state and functions.
 */
export type MonacoEditorResult = {
  /** The lazily-loaded Monaco editor component */
  MonacoEditor: MonacoComponent | null;
  /** Error message if Monaco failed to load */
  monacoLoadError: string | null;
  /** Function to load Monaco editor if not already loaded */
  loadMonacoIfNeeded: () => Promise<void>;
  /** Reference to the Monaco editor instance */
  monacoRef: React.MutableRefObject<any>;
  /** Callback called when Monaco editor mounts */
  monacoOnMount: (editor: any) => void;
  /** Opens the find panel in the editor */
  handleMonacoFind: () => void;
  /** Formats the document in the editor */
  handleMonacoFormat: () => void;
};

/**
 * Hook for lazy-loading and managing Monaco editor instance.
 * 
 * This hook handles dynamic importing of the Monaco editor library,
 * providing lazy loading to avoid loading the heavy editor until needed.
 * 
 * @returns Object containing Monaco editor state and control functions
 * 
 * @example
 * ```typescript
 * const { MonacoEditor, loadMonacoIfNeeded, handleMonacoFormat } = useMonacoEditor();
 * 
 * useEffect(() => { loadMonacoIfNeeded(); }, [loadMonacoIfNeeded]);
 * 
 * if (!MonacoEditor) return <Loading />;
 * return <MonacoEditor value={code} language="typescript" />;
 * ```
 */
export function useMonacoEditor(): MonacoEditorResult {
  const [MonacoEditor, setMonacoEditor] = useState<MonacoComponent | null>(
    null
  );
  const [monacoLoadError, setMonacoLoadError] = useState<string | null>(null);

  const monacoRef = useRef<any>(null);

  const monacoOnMount = useCallback((editor: any) => {
    monacoRef.current = editor;
  }, []);

  const loadMonacoIfNeeded = useCallback(async () => {
    if (MonacoEditor || monacoLoadError) {return;}
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





