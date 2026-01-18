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
      backgroundColor: `rgba(${theme.vars.palette.warning.mainChannel} / 0.4)`
    },
    "::highlight(findCurrent)": {
      backgroundColor: `rgba(${theme.vars.palette.warning.mainChannel} / 0.7)`
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
      color: theme.vars.palette.text.primary,
      fontWeight: "300",
      fontSize: theme.fontSizeSmall,
      lineHeight: "1.5em"
    },
    ".editor-text-code": {
      backgroundColor: theme.vars.palette.action.selected,
      padding: "2px 4px",
      borderRadius: "3px",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall
    },
    ".editor-code": {
      backgroundColor: theme.vars.palette.action.disabledBackground,
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
      borderLeft: `4px solid ${theme.vars.palette.action.selected}`,
      paddingLeft: "12px",
      margin: "8px 0",
      fontStyle: "italic",
      color: theme.vars.palette.text.secondary
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
        lineHeight: "1.5em",
        paddingTop: 0,
        marginTop: 0,
        marginBlockEnd: "0.5em"
      },
      ".font-size-large": {
        fontSize: theme.fontSizeBigger
      }
    },
    ".editor-placeholder": {
      color: theme.vars.palette.text.disabled,
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
      {/* Wrap in a block container to avoid Chrome flex + contenteditable focus issues */}
      <div style={{ display: "block", flex: 1, minHeight: 0, overflow: "auto" }}>
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
      </div>
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
