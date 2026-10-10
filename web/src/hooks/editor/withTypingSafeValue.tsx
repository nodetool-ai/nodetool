import React, { useCallback, useEffect, useRef } from "react";
import type * as monaco from "monaco-editor";

type MonacoInstance = typeof import("monaco-editor");

/** The props every NodeTool Monaco call site passes. */
export interface ControlledMonacoProps {
  value: string;
  onChange?: (val?: string) => void;
  onMount?: (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoInstance: MonacoInstance
  ) => void;
  [prop: string]: unknown;
}

type LibraryEditor = React.ComponentType<
  Omit<ControlledMonacoProps, "value"> & { defaultValue?: string }
>;

/** Enough for any burst of keystrokes React has not rendered yet. */
const MAX_PENDING_ECHOES = 200;

/**
 * Wraps `@monaco-editor/react`'s Editor so a stale `value` prop cannot
 * overwrite what the user just typed.
 *
 * The library treats `value` as the truth: after every render it replaces the
 * whole model when `value` differs from the editor. When keystrokes arrive
 * faster than the parent re-renders, the prop still holds the text from a few
 * keys ago, and each replacement deletes the newer letters ("Hello, this is"
 * became "Hlo,ti s"). Here the editor owns its text. A new `value` is applied
 * only when it is not an echo of something the editor already reported
 * through `onChange`, so loading a file or an outside edit still lands.
 */
export function withTypingSafeValue(
  Editor: LibraryEditor
): React.ComponentType<ControlledMonacoProps> {
  function TypingSafeEditor({
    value,
    onChange,
    onMount,
    ...rest
  }: ControlledMonacoProps): React.JSX.Element {
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
      null
    );
    const monacoRef = useRef<MonacoInstance | null>(null);
    // Values the editor reported that the parent has not rendered back yet.
    const pendingEchoes = useRef<string[]>([]);
    const applyingValue = useRef(false);

    const handleChange = useCallback(
      (next?: string) => {
        // The library stays silent while it applies `value` itself. Match it.
        if (applyingValue.current) {
          return;
        }
        const pending = pendingEchoes.current;
        pending.push(next ?? "");
        if (pending.length > MAX_PENDING_ECHOES) {
          pending.shift();
        }
        onChange?.(next);
      },
      [onChange]
    );

    const handleMount = useCallback(
      (
        editor: monaco.editor.IStandaloneCodeEditor,
        monacoInstance: MonacoInstance
      ) => {
        editorRef.current = editor;
        monacoRef.current = monacoInstance;
        onMount?.(editor, monacoInstance);
      },
      [onMount]
    );

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      const pending = pendingEchoes.current;
      const echo = pending.indexOf(value);
      if (echo >= 0) {
        pending.splice(0, echo + 1);
        return;
      }
      pending.length = 0;
      if (value === editor.getValue()) {
        return;
      }
      const readOnly = monacoRef.current
        ? editor.getOption(monacoRef.current.editor.EditorOption.readOnly)
        : false;
      const model = editor.getModel();
      applyingValue.current = true;
      try {
        if (readOnly || !model) {
          editor.setValue(value);
          return;
        }
        // An edit, not setValue, so the outside change can be undone.
        editor.executeEdits("", [
          {
            range: model.getFullModelRange(),
            text: value,
            forceMoveMarkers: true
          }
        ]);
        editor.pushUndoStop();
      } finally {
        applyingValue.current = false;
      }
    }, [value]);

    return (
      <Editor
        {...rest}
        defaultValue={value}
        onChange={handleChange}
        onMount={handleMount}
      />
    );
  }
  return TypingSafeEditor;
}
