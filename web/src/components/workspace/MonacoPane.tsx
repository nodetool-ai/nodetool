import { useCallback, useEffect, useMemo, useRef } from "react";
import type * as monaco from "monaco-editor";

import { useMonacoEditor } from "../../hooks/editor/useMonacoEditor";
import { Caption, FlexColumn, LoadingSpinner } from "../ui_primitives";

interface MonacoPaneProps {
  value: string;
  language: string;
  readOnly?: boolean;
  wordWrap?: boolean;
  onChange?: (value: string) => void;
  /** Registers Cmd/Ctrl+S inside the editor when provided. */
  onSave?: () => void;
  onEditorMount?: (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoInstance: typeof import("monaco-editor")
  ) => void;
}

/**
 * A thin wrapper around the lazily-loaded Monaco editor, shared by the text
 * tab's edit surface (TextDocumentEditor) and its read-only code preview
 * (TextPreview). Handles loading/error states, theme, options, and an optional
 * save keybinding so callers only supply value + language.
 */
const MonacoPane = ({
  value,
  language,
  readOnly = false,
  wordWrap = true,
  onChange,
  onSave,
  onEditorMount
}: MonacoPaneProps) => {
  const {
    MonacoEditor,
    monacoLoadError,
    isMonacoLoading,
    loadMonacoIfNeeded,
    monacoOnMount
  } = useMonacoEditor();
  const monacoTheme = "vs-dark";

  useEffect(() => {
    void loadMonacoIfNeeded();
  }, [loadMonacoIfNeeded]);

  // Fire the save keybinding through a ref so the command — registered once on
  // mount — always calls the latest handler instead of a stale closure.
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const handleMount = useCallback(
    (
      editor: monaco.editor.IStandaloneCodeEditor,
      monacoInstance: typeof import("monaco-editor")
    ) => {
      monacoOnMount(editor);
      onEditorMount?.(editor, monacoInstance);
      editor.addCommand(
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
        () => saveRef.current?.()
      );
    },
    [monacoOnMount, onEditorMount]
  );

  const handleChange = useCallback(
    (next?: string) => onChange?.(next ?? ""),
    [onChange]
  );

  const options = useMemo(
    () => ({
      readOnly,
      automaticLayout: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      wordWrap: wordWrap ? ("on" as const) : ("off" as const),
      fontSize: 13,
      tabSize: 2,
      renderWhitespace: "selection" as const,
      smoothScrolling: true,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }
    }),
    [readOnly, wordWrap]
  );

  if (monacoLoadError) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <Caption sx={{ color: "error.main" }}>{monacoLoadError}</Caption>
      </FlexColumn>
    );
  }

  if (!MonacoEditor) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <LoadingSpinner />
        {isMonacoLoading && <Caption>Loading editor…</Caption>}
      </FlexColumn>
    );
  }

  return (
    <MonacoEditor
      value={value}
      onChange={handleChange}
      language={language}
      theme={monacoTheme}
      width="100%"
      height="100%"
      onMount={handleMount}
      options={options}
    />
  );
};

export default MonacoPane;
