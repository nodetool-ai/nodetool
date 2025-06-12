/** @jsxImportSource @emotion/react */
import { Global, css } from "@emotion/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { memo, useEffect } from "react";
import { EditorState, LexicalEditor } from "lexical";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";

const editorStyles = css`
  .editor-input {
    height: 100%;
    outline: none;
    border: 0;
    cursor: text;
    width: 100%;
    padding: 0;
    resize: none;
  }
  .editor-placeholder {
    color: rgba(0, 0, 0, 0.6);
    position: absolute;
    font-size: var(--fontSizeSmall);
    top: 0.75em;
    left: 0;
    pointer-events: none;
  }
`;

function BlurPlugin({
  onBlur
}: {
  onBlur: (editorState: EditorState) => void;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const onBlurHandler = () => onBlur(editor.getEditorState());
    return editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement) {
        prevRootElement.removeEventListener("blur", onBlurHandler);
      }
      if (rootElement) {
        rootElement.addEventListener("blur", onBlurHandler, true);
      }
    });
  }, [editor, onBlur]);
  return null;
}

interface LexicalPluginsProps {
  onChange: (editorState: EditorState, editor: LexicalEditor) => void;
  onBlur?: (editorState: EditorState) => void;
}

const LexicalPlugins = memo(({ onChange, onBlur }: LexicalPluginsProps) => {
  return (
    <>
      <Global styles={editorStyles} />
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="nowheel nodrag editor-input"
            spellCheck={false}
          />
        }
        placeholder={
          <div className="editor-placeholder">Enter some text...</div>
        }
        ErrorBoundary={() => null}
      />
      <HistoryPlugin />
      <OnChangePlugin onChange={onChange} />
      {onBlur && <BlurPlugin onBlur={onBlur} />}
    </>
  );
});

LexicalPlugins.displayName = "LexicalPlugins";

export default LexicalPlugins;
