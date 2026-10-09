import { useCallback, useEffect, useState } from "react";
import type * as monaco from "monaco-editor";

export interface CodeEditorActivation {
  /** Monaco has focus anywhere in its widget (text, find box, suggest). */
  isActive: boolean;
  /** The mounted editor, or null before mount. */
  editor: monaco.editor.IStandaloneCodeEditor | null;
  /** Call from the editor's onMount. */
  attachEditor: (editor: monaco.editor.IStandaloneCodeEditor) => void;
  /** Focus the editor with the caret under the given client point. */
  activateAt: (clientX: number, clientY: number) => void;
}

/**
 * Keeps a Monaco editor on the canvas inert until clicked. Monaco consumes
 * every wheel event it sees, pinches included, so while the editor is idle a
 * cover (EditorActivationCover) sits over it and the canvas gets the
 * gestures. Losing focus makes the editor idle again.
 */
export const useCodeEditorActivation = (): CodeEditorActivation => {
  const [editor, setEditor] =
    useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const focus = editor.onDidFocusEditorWidget(() => setIsActive(true));
    const blur = editor.onDidBlurEditorWidget(() => setIsActive(false));
    const dispose = editor.onDidDispose(() => {
      setEditor(null);
      setIsActive(false);
    });
    return () => {
      focus.dispose();
      blur.dispose();
      dispose.dispose();
    };
  }, [editor]);

  const activateAt = useCallback(
    (clientX: number, clientY: number) => {
      if (!editor) {
        return;
      }
      // Drop the cover first: Monaco hit-tests the point against its own DOM.
      setIsActive(true);
      requestAnimationFrame(() => {
        const position = editor.getTargetAtClientPoint(clientX, clientY)
          ?.position;
        if (position) {
          editor.setPosition(position);
        }
        editor.focus();
      });
    },
    [editor]
  );

  return { isActive, editor, attachEditor: setEditor, activateAt };
};
