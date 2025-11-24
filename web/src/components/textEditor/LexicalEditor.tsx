/** @jsxImportSource @emotion/react */
import { Global, css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect, useState } from "react";
import { EditorState, LexicalEditor } from "lexical";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { CodeHighlightPlugin } from "./CodeHighlightPlugin";
import { MarkdownPastePlugin } from "./MarkdownPastePlugin";
import { AutoLinkPlugin } from "./AutoLinkPlugin";
import { HorizontalRulePlugin } from "./HorizontalRulePlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";

const styles = (theme: Theme) =>
  css({
    "::highlight(findMatches)": {
      backgroundColor: "rgba(255, 255, 0, 0.4)"
    },
    "::highlight(findCurrent)": {
      backgroundColor: "rgba(255, 165, 0, 0.7)"
    },
    ".editor-link": {
      color: theme.vars.palette.c_link,
      textDecoration: "none",
      cursor: "pointer",
      "&:hover": {
        textDecoration: "underline"
      }
    },
    ".editor-text-bold": {
      fontWeight: "bold"
    },
    ".editor-text-italic": {
      fontStyle: "italic"
    },
    ".editor-text-underline": {
      textDecoration: "underline"
    },
    ".editor-text-strikethrough": {
      textDecoration: "line-through"
    },
    ".editor-input p, .editor-input ol,.editor-input ul": {
      fontWeight: "300",
      fontSize: theme.fontSizeSmall
    },
    ".editor-text-code": {
      backgroundColor: "rgba(255, 255, 255, 0.1)",
      padding: "2px 4px",
      borderRadius: "3px",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall
    },
    ".editor-code": {
      backgroundColor: "rgba(0, 0, 0, 0.3)",
      padding: "8px 12px",
      borderRadius: "4px",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      margin: "8px 0",
      display: "block",
      overflowX: "auto"
    },
    ".editor-heading-h1": {
      fontSize: theme.fontSizeBigger,
      fontWeight: "bold",
      margin: "0.5em 0"
    },
    ".editor-heading-h2": {
      fontSize: theme.fontSizeBig,
      fontWeight: "normal",
      margin: "0.5em 0"
    },
    ".editor-heading-h3": {
      fontSize: theme.fontSizeNormal,
      fontWeight: "normal",
      margin: "0.5em 0"
    },
    ".editor-quote": {
      borderLeft: "4px solid rgba(255, 255, 255, 0.3)",
      paddingLeft: "12px",
      margin: "8px 0",
      fontStyle: "italic",
      color: "rgba(255, 255, 255, 0.8)"
    },
    ".editor-list-ul, .editor-list-ol": {
      paddingLeft: "20px",
      margin: "4px 0"
    },
    ".editor-listitem": {
      margin: "2px 0"
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
      <LinkPlugin />
      <CodeHighlightPlugin />
      <MarkdownPastePlugin />
      <AutoLinkPlugin />
      <HorizontalRulePlugin />
      {onBlur && <BlurPlugin onBlur={onBlur} />}
    </>
  );
};

export default LexicalPlugins;
