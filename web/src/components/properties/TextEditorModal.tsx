/** @jsxImportSource @emotion/react */
import { css, useTheme } from "@emotion/react";
import "prismjs/components/prism-core";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
import "prismjs/themes/prism.css";

import ReactDOM from "react-dom";
import { memo, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useClipboard } from "../../hooks/browser/useClipboard";
import CloseIcon from "@mui/icons-material/Close";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { Tooltip } from "@mui/material";
import ThemeNodes from "../themes/ThemeNodes";
import CircularProgress from "@mui/material/CircularProgress";
import { useCombo } from "../../stores/KeyPressedStore";
import { isEqual } from "lodash";
import { EditorState, LexicalEditor, $getRoot } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import LexicalPlugins from "../textEditor/LexicalEditor";

const initialConfigTemplate = {
  namespace: "TextEditorModal",
  onError: (error: Error) => {
    console.error(error);
  },
  nodes: [
    HeadingNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    CodeNode,
    CodeHighlightNode,
    AutoLinkNode,
    LinkNode
  ],
  theme: {
    text: {
      large: "font-size-large"
    }
  }
};

interface TextEditorModalProps {
  value: string;
  onChange?: (value: string) => void;
  onClose: () => void;
  propertyName: string;
  propertyDescription?: string;
  readOnly?: boolean;
  isLoading?: boolean;
}

import { CSSObject } from "@emotion/react";
import Markdown from "react-markdown";

const modalStyles = (
  theme: any,
  textareaHeight: number,
  textareaWidth: number
): CSSObject => ({
  ".modal-overlay": {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    zIndex: 10000,
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  ".modal-content": {
    backgroundColor: theme.palette.c_gray1,
    color: theme.palette.c_gray6,
    fontSize: theme.fontSizeBigger,
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    borderTop: `.7em solid ${theme.palette.c_black}`,
    borderRight: `.7em solid ${theme.palette.c_black}`,
    borderLeft: `.7em solid ${theme.palette.c_black}`
  },
  ".modal-header": {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1em 0 1em 1em",
    height: "1.5em",
    backgroundColor: theme.palette.c_gray0
  },
  ".modal-header h4": {
    cursor: "default",
    fontWeight: "normal",
    margin: 0
  },
  ".description": {
    padding: "1em 1em .5em 1.5em",
    fontSize: theme.fontSizeTiny,
    color: theme.palette.c_gray6,
    fontFamily: theme.fontFamily2,
    wordSpacing: "-0.2em",
    lineHeight: "1.2",
    backgroundColor: theme.palette.c_gray1
  },
  ".modal-body": {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: ".5em",
    backgroundColor: theme.palette.c_gray1,
    height: "100%",
    overflow: "hidden"
  },
  ".modal-body .editor": {
    flex: 1,
    width: "100%",
    fontFamily: theme.fontFamily1,
    fontSize: theme.fontSizeSmall,
    lineHeight: "1.2",
    color: theme.palette.c_white,
    backgroundColor: theme.palette.c_gray2,
    outline: "none",
    overflow: "auto !important",
    whiteSpace: "pre-wrap",
    height: "100vh",
    ["& pre"]: {
      height: "100vh",
      whiteSpace: "pre !important",
      overflowWrap: "break-word"
    },
    ["& textarea"]: {
      whiteSpace: "pre !important",
      overflowWrap: "break-word",
      height: `${textareaHeight}px !important`,
      width: `${textareaWidth}px !important`
    }
  },
  ".actions": {
    display: "flex",
    gap: "1em"
  },
  ".button": {
    padding: "8px 12px",
    cursor: "pointer",
    backgroundColor: theme.palette.c_gray1,
    color: "#fff",
    textTransform: "uppercase",
    border: "none",
    borderRadius: "0"
  },
  ".button:hover": {
    backgroundColor: theme.palette.c_gray2
  },
  ".button-close": {
    backgroundColor: theme.palette.c_gray1
  },
  ".modal-footer": {
    display: "flex",
    width: "100%",
    height: ".7em",
    justifyContent: "flex-end",
    backgroundColor: theme.palette.c_gray0
  }
});

const TextEditorModal = ({
  value,
  onChange,
  onClose,
  propertyName,
  propertyDescription,
  readOnly = false,
  isLoading = false
}: TextEditorModalProps) => {
  const theme = useTheme();
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const { writeClipboard } = useClipboard();

  const [textareaHeight, setTextareaHeight] = useState(window.innerHeight);
  const [textareaWidth, setTextareaWidth] = useState(window.innerWidth);

  // Convert plain text to Lexical format
  const initialEditorState = useMemo(() => {
    if (value) {
      // Create a simple paragraph with the text
      const editorState = {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: "normal",
                  style: "",
                  text: value,
                  type: "text",
                  version: 1
                }
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1
            }
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          type: "root",
          version: 1
        }
      };
      return JSON.stringify(editorState);
    }
    return undefined;
  }, [value]);

  const editorConfig = useMemo(
    () => ({
      ...initialConfigTemplate,
      editorState: initialEditorState,
      readOnly: readOnly
    }),
    [initialEditorState, readOnly]
  );

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      if (!readOnly && onChange) {
        // Convert Lexical state back to plain text
        const textContent = editorState.read(() => {
          return $getRoot().getTextContent();
        });
        onChange(textContent);
      }
    },
    [onChange, readOnly]
  );

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === modalOverlayRef.current) {
      onClose();
    }
  };

  useCombo(["escape"], onClose);

  const content = (
    <div
      css={modalStyles(theme, textareaHeight, textareaWidth)}
      className={readOnly ? "read-only" : ""}
    >
      <div
        className="modal-overlay"
        role="presentation"
        onClick={handleOverlayClick}
        ref={modalOverlayRef}
      >
        <div className="modal-content" role="dialog" aria-modal="true">
          <div className="modal-header">
            <h4>{propertyName}</h4>
            <div className="actions">
              <Tooltip
                enterDelay={TOOLTIP_ENTER_DELAY}
                title="Copy to Clipboard"
              >
                <button
                  className="button"
                  onClick={() => {
                    writeClipboard(value, true);
                  }}
                >
                  Copy
                </button>
              </Tooltip>
              <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Close | Esc">
                <button className="button button-close" onClick={onClose}>
                  <CloseIcon />
                </button>
              </Tooltip>
            </div>
          </div>
          {propertyDescription && (
            <div
              className="description"
              style={{
                color: readOnly
                  ? ThemeNodes.palette.c_warning
                  : ThemeNodes.palette.c_white
              }}
            >
              <Markdown>{propertyDescription}</Markdown>
            </div>
          )}
          <div className="modal-body">
            {isLoading ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "100%"
                }}
              >
                <CircularProgress />
              </div>
            ) : (
              <LexicalComposer initialConfig={editorConfig}>
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column"
                  }}
                >
                  <LexicalPlugins onChange={handleEditorChange} />
                </div>
              </LexicalComposer>
            )}
          </div>
          <div className="modal-footer"></div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};

export default memo(TextEditorModal, isEqual);
