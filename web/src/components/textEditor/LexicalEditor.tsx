/** @jsxImportSource @emotion/react */
import { Global, css, useTheme } from "@emotion/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect, useState } from "react";
import { EditorState, LexicalEditor } from "lexical";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { CodeHighlightPlugin } from "./CodeHighlightPlugin";

const styles = (theme: any) =>
  css({
    "::highlight(findMatches)": {
      backgroundColor: "rgba(255, 255, 0, 0.4)"
    },
    "::highlight(findCurrent)": {
      backgroundColor: "rgba(255, 165, 0, 0.7)"
    },
    ".editor": {
      "&.word-wrap": {
        whiteSpace: "pre-wrap !important",
        "& *": {
          whiteSpace: "pre-wrap !important"
        }
      },
      "&.no-wrap": {
        whiteSpace: "pre !important",
        "& *": {
          whiteSpace: "pre !important"
        }
      }
    },
    ".editor-input": {
      height: "100%",
      outline: "none",
      border: 0,
      cursor: "text",
      width: "100%",
      padding: 0,
      resize: "none",
      overflowX: "hidden",
      overflowY: "auto",
      fontSize: theme.fontSizeSmall,
      fontWeight: 400,
      p: {
        lineHeight: "1.25em",
        paddingTop: 0,
        marginTop: 0,
        marginBlockEnd: "0.5em"
      },
      ".font-size-large": {
        fontSize: theme.fontSizeBigger
      }
    },
    ".editor-placeholder": {
      color: "rgba(0, 0, 0, 0.6)",
      position: "absolute",
      fontSize: theme.fontSizeSmall,
      top: "1.5em",
      left: "1.5em",
      pointerEvents: "none"
    }
  });

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
  wordWrapEnabled?: boolean;
}

const LexicalPlugins = ({
  onChange,
  onBlur,
  onFocusChange,
  wordWrapEnabled = true
}: LexicalPluginsProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const theme = useTheme();

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
      <Global styles={styles(theme)} />
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className={`editor editor-input nodrag ${
              isFocused ? "focused  nowheel" : ""
            } ${wordWrapEnabled ? "word-wrap" : "no-wrap"}`.trim()}
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
      <CodeHighlightPlugin />
      {onBlur && <BlurPlugin onBlur={onBlur} />}
    </>
  );
};

export default LexicalPlugins;
