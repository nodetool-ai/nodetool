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
import { CopyToClipboardButton } from "../common/CopyToClipboardButton";

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

const styles = (theme: any) =>
  css({
    ".modal-overlay": {
      position: "fixed",
      top: "72px",
      left: "51px",
      width: "calc(100vw - 51px)",
      height: "calc(100vh - 200px)",
      backgroundColor: "rgba(50, 50, 50, 0.8)",
      zIndex: 10000,
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    },
    ".modal-content": {
      backgroundColor: theme.palette.c_gray0,
      color: theme.palette.c_gray6,
      fontSize: theme.fontSizeBigger,
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      border: `.7em solid ${theme.palette.c_black}`,
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)"
    },
    ".modal-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      padding: ".5em 1em",
      minHeight: "2em",
      backgroundColor: theme.palette.c_gray0,
      h4: {
        cursor: "default",
        fontWeight: "600",
        margin: "0",
        fontSize: theme.fontSizeBig,
        letterSpacing: "0.02em"
      }
    },
    ".title-and-description": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: "0.5em"
    },
    ".description": {
      padding: "0",
      margin: "0",
      fontSize: theme.fontSizeSmaller,
      p: {
        color: theme.palette.c_gray5,
        margin: "0 0 0.5em 0",
        "&:last-child": {
          margin: 0
        }
      }
    },
    ".modal-body": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      padding: "1em",
      borderRadius: "1em",
      backgroundColor: theme.palette.c_gray1,
      height: "100%",
      overflow: "hidden",
      ".editor": {
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
        borderRadius: "4px",
        pre: {
          height: "100vh",
          whiteSpace: "pre !important",
          overflowWrap: "break-word"
        },
        textarea: {
          whiteSpace: "pre !important",
          overflowWrap: "break-word",
          height: "100vh !important",
          width: "100% !important"
        }
      }
    },
    ".actions": {
      display: "flex",
      gap: "1em",
      alignItems: "flex-start",
      marginTop: "0.25em"
    },
    ".copy-to-clipboard-button": {
      padding: "10px 14px !important",
      backgroundColor: `${theme.palette.c_gray2} !important`,
      color: `${theme.palette.c_white} !important`,
      borderRadius: "4px !important",
      fontSize: theme.fontSizeSmaller,
      fontWeight: "500",
      transition: "all 0.2s ease",
      minWidth: "44px",
      minHeight: "44px",
      "&:hover": {
        backgroundColor: `${theme.palette.c_gray3} !important`
      }
    },
    ".button": {
      padding: "10px 14px",
      cursor: "pointer",
      backgroundColor: theme.palette.c_gray2,
      color: theme.palette.c_white,
      textTransform: "uppercase",
      border: "none",
      borderRadius: "4px",
      fontSize: theme.fontSizeSmaller,
      fontWeight: "500",
      transition: "all 0.2s ease",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "44px",
      minHeight: "44px",
      "&:hover": {
        backgroundColor: theme.palette.c_gray3
      }
    },
    ".button-close": {
      backgroundColor: theme.palette.c_gray2,
      "&:hover": {
        backgroundColor: theme.palette.c_gray3
      }
    },
    ".modal-footer": {
      display: "flex",
      width: "100%",
      marginTop: "1em",
      height: "2em",
      borderRadius: ".5em",
      justifyContent: "flex-end",
      backgroundColor: theme.palette.c_gray1
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
      className={`text-editor-modal ${readOnly ? "read-only" : ""}`}
      css={styles(theme)}
    >
      <div
        className="modal-overlay"
        role="presentation"
        onClick={handleOverlayClick}
        ref={modalOverlayRef}
      >
        <div className="modal-content" role="dialog" aria-modal="true">
          <div className="modal-header">
            <div className="title-and-description">
              <h4 className="title">{propertyName}</h4>
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
            </div>
            <div className="actions">
              <CopyToClipboardButton textToCopy={value || ""} />
              <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Close | Esc">
                <button className="button button-close" onClick={onClose}>
                  <CloseIcon />
                </button>
              </Tooltip>
            </div>
          </div>
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
