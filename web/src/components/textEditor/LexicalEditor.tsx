/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { EditorState, LexicalEditor } from "lexical";
import { memo, useEffect, forwardRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

const styles = css`
  position: relative;
  .editor-container {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .editor-input {
    height: 100%;
    outline: none;
    border: 0;
    cursor: text;
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

const initialConfig = {
  namespace: "LexicalEditor",
  onError: (error: Error) => {
    console.error(error);
  },
  nodes: [],
  theme: {}
};

interface LexicalEditorProps {
  initialState?: string;
  onChange: (editorState: EditorState, editor: LexicalEditor) => void;
  onBlur?: (editorState: EditorState) => void;
  toolbar?: React.ReactNode;
}

function BlurPlugin({
  onBlur
}: {
  onBlur: (editorState: EditorState) => void;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement) {
        prevRootElement.removeEventListener("blur", () =>
          onBlur(editor.getEditorState())
        );
      }
      if (rootElement) {
        rootElement.addEventListener("blur", () =>
          onBlur(editor.getEditorState())
        );
      }
    });
  }, [editor, onBlur]);
  return null;
}

const LexicalEditorComponent = memo(
  forwardRef<HTMLDivElement, LexicalEditorProps>(
    ({ initialState, onChange, onBlur, toolbar }, ref) => {
      const editorConfig = {
        ...initialConfig,
        editorState: initialState
      };

      return (
        <div css={styles} ref={ref}>
          <LexicalComposer initialConfig={editorConfig}>
            {toolbar}
            <div className="editor-container">
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    className="nodrag editor-input"
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
            </div>
          </LexicalComposer>
        </div>
      );
    }
  )
);

LexicalEditorComponent.displayName = "LexicalEditorComponent";

export default LexicalEditorComponent;
