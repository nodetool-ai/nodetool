/** @jsxImportSource @emotion/react */
import { Global, css } from "@emotion/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect, useState } from "react";
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
    overflow-x: hidden;
    overflow-y: auto;
  }
  .editor-placeholder {
    color: rgba(0, 0, 0, 0.6);
    position: absolute;
    font-size: var(--fontSizeSmall);
    top: 1.5em;
    left: 1.5em;
    pointer-events: none;
  }
  .editor-input p {
    line-height: 1.25em;
    padding-top: 0;
    margin-top: 0;
    margin-block-end: 0.5em;
  }
  .editor-input {
    font-size: var(--fontSizeSmall);
  }
  .editor-input .font-size-large {
    font-size: var(--fontSizeBigger);
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
  onFocusChange?: (isFocused: boolean) => void;
}

const LexicalPlugins = ({
  onChange,
  onBlur,
  onFocusChange
}: LexicalPluginsProps) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
    onFocusChange?.(true);
  };

  const handleInternalBlur = () => {
    setIsFocused(false);
    onFocusChange?.(false);
  };

  return (
    <>
      <Global styles={editorStyles} />
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className={`editor-input ${
              isFocused ? "focused nodrag nowheel" : ""
            }`.trim()}
            spellCheck={false}
            onClick={(e) => e.stopPropagation()}
            onFocus={handleFocus}
            onBlur={handleInternalBlur}
          />
        }
        placeholder={
          <div className="editor-placeholder">{isFocused ? "" : "// ..."}</div>
        }
        ErrorBoundary={() => null}
      />
      <HistoryPlugin />
      <OnChangePlugin onChange={onChange} />
      {onBlur && <BlurPlugin onBlur={onBlur} />}
    </>
  );
};

export default LexicalPlugins;
