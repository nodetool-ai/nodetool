/** @jsxImportSource @emotion/react */

import ReactDOM from "react-dom";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { css, useTheme } from "@emotion/react";
import CloseIcon from "@mui/icons-material/Close";
import { CircularProgress, Tooltip } from "@mui/material";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ListItemNode, ListNode } from "@lexical/list";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { EditorState, $getRoot } from "lexical";
import { debounce, isEqual } from "lodash";
import Markdown from "react-markdown";

import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useCombo } from "../../stores/KeyPressedStore";

import { CopyToClipboardButton } from "../common/CopyToClipboardButton";
import ThemeNodes from "../themes/ThemeNodes";
import LexicalPlugins from "../textEditor/LexicalEditor";
import EditorController from "../textEditor/EditorController";
import EditorStatusBar from "../textEditor/EditorStatusBar";
import EditorToolbar from "../textEditor/EditorToolbar";
import FindReplaceBar from "../textEditor/FindReplaceBar";

/* code-highlight */
import { codeHighlightTheme } from "../textEditor/codeHighlightTheme";
import { codeHighlightTokenStyles } from "../textEditor/codeHighlightStyles";

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
    },
    ...codeHighlightTheme
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
  showToolbar?: boolean;
  showStatusBar?: boolean;
  showFindReplace?: boolean;
}

const styles = (theme: any) =>
  css({
    ".modal-overlay": {
      position: "fixed",
      top: "72px",
      left: "51px",
      width: "calc(100vw - 51px)",
      height: "fit-content",
      padding: ".5em .5em 0 .5em",
      backgroundColor: "var(--palette-background-default)",
      zIndex: 10000,
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start"
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
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)"
    },
    ".modal-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      padding: ".5em 1em",
      minHeight: "2em",
      backgroundColor: theme.palette.c_gray1,
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
      flexDirection: "row",
      alignItems: "baseline",
      gap: "1em"
    },
    ".description": {
      width: "calc(100% - 100px)",
      maxWidth: "800px",
      maxHeight: "110px",
      overflowY: "auto",
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
      position: "relative",
      flex: 1,
      display: "flex",
      flexDirection: "column",
      padding: "1em 2em 1em 1em",
      backgroundColor: theme.palette.background.default,
      height: "100%",
      overflow: "hidden",
      ".editor": {
        flex: 1,
        width: "100%",
        fontFamily: theme.fontFamily1,
        fontSize: theme.fontSizeSmall,
        lineHeight: "1.2",
        color: theme.palette.c_white,
        // backgroundColor: theme.palette.c_gray2,
        outline: "none",
        overflow: "auto !important",
        height: "100vh",
        borderRadius: "4px",
        pre: {
          height: "100vh",
          overflowWrap: "break-word"
        },
        textarea: {
          overflowWrap: "break-word",
          height: "100vh !important",
          width: "100% !important"
        },
        "&.word-wrap": {
          whiteSpace: "pre-wrap",
          pre: {
            whiteSpace: "pre-wrap !important"
          },
          textarea: {
            whiteSpace: "pre-wrap !important"
          }
        },
        "&.no-wrap": {
          whiteSpace: "pre",
          pre: {
            whiteSpace: "pre !important"
          },
          textarea: {
            whiteSpace: "pre !important"
          }
        },
        ...codeHighlightTokenStyles(theme)
      }
    },
    ".actions": {
      display: "flex",
      gap: "1em",
      alignItems: "flex-start",
      marginTop: "0",
      marginRight: "-18px"
    },
    ".copy-to-clipboard-button": {
      position: "absolute",
      right: ".3em",
      top: "1em",
      zIndex: 10,
      padding: "8px !important",
      backgroundColor: "transparent",
      color: `${theme.palette.c_white} !important`,
      borderRadius: "4px !important",
      fontSize: theme.fontSizeSmaller,
      fontWeight: "500",
      transition: "all 0.2s ease",
      minWidth: "32px",
      minHeight: "32px",
      "&:hover": {
        backgroundColor: `${theme.palette.c_gray2} `
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
      backgroundColor: "transparent",
      position: "absolute",
      padding: "5px",
      right: ".5em",
      minWidth: "32px",
      minHeight: "32px",
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      }
    },
    ".resize-handle": {
      height: "8px",
      width: "100%",
      cursor: "row-resize",
      borderRadius: "4px",
      backgroundColor: theme.palette.c_gray3,
      "&:hover": {
        backgroundColor: theme.palette.c_gray5
      }
    }
  });

const TextEditorModal = ({
  value,
  onChange,
  onClose,
  propertyName,
  propertyDescription,
  readOnly = false,
  isLoading = false,
  showToolbar = true,
  showStatusBar = true,
  showFindReplace = true
}: TextEditorModalProps) => {
  const theme = useTheme();
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const { writeClipboard } = useClipboard();

  // Resizable modal height state
  const DEFAULT_HEIGHT = Math.min(600, window.innerHeight - 200);
  const MIN_HEIGHT = 250;
  const MAX_HEIGHT = window.innerHeight - 120;
  const STORAGE_KEY = "textEditorModal_height";

  // Get initial height from localStorage or use default
  const getInitialHeight = useCallback(() => {
    try {
      const savedHeight = localStorage.getItem(STORAGE_KEY);
      if (savedHeight) {
        const height = parseInt(savedHeight, 10);
        // Validate the saved height is within bounds
        if (height >= MIN_HEIGHT && height <= MAX_HEIGHT) {
          return height;
        }
      }
    } catch (error) {
      console.warn("Failed to read modal height from localStorage:", error);
    }
    return DEFAULT_HEIGHT;
  }, [DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT]);

  const [modalHeight, setModalHeight] = useState<number>(getInitialHeight);

  // Debounced function to save height to localStorage
  const saveHeightToStorage = useMemo(
    () =>
      debounce((height: number) => {
        try {
          localStorage.setItem(STORAGE_KEY, height.toString());
        } catch (error) {
          console.warn("Failed to save modal height to localStorage:", error);
        }
      }, 500), // Save after 500ms of no height changes
    []
  );

  // Update modal height and persist to storage
  const updateModalHeight = useCallback(
    (newHeight: number) => {
      const clampedHeight = Math.max(
        MIN_HEIGHT,
        Math.min(newHeight, MAX_HEIGHT)
      );
      setModalHeight(clampedHeight);
      saveHeightToStorage(clampedHeight);
    },
    [MIN_HEIGHT, MAX_HEIGHT, saveHeightToStorage]
  );

  // refs for drag logic
  const dragStartY = useRef(0);
  const startHeight = useRef(0);

  const handleResizeMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      dragStartY.current = event.clientY;
      startHeight.current = modalHeight;

      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientY - dragStartY.current;
        const newHeight = startHeight.current + delta;
        updateModalHeight(newHeight);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      event.preventDefault();
    },
    [modalHeight, updateModalHeight]
  );

  // Clean up debounced function on unmount
  useEffect(() => {
    return () => {
      saveHeightToStorage.cancel();
    };
  }, [saveHeightToStorage]);

  // Editor state management
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [wordWrapEnabled, setWordWrapEnabled] = useState(true);
  const [isCodeBlock, setIsCodeBlock] = useState(false);
  const [findReplaceVisible, setFindReplaceVisible] = useState(false);
  const [currentText, setCurrentText] = useState(value || "");

  // Editor command function refs – using refs avoids re-renders when the
  // underlying functions are recreated in the child component on every mount.
  const undoFnRef = useRef<(() => void) | null>(null);
  const redoFnRef = useRef<(() => void) | null>(null);
  const findFnRef = useRef<
    | ((searchTerm: string) => { totalMatches: number; currentMatch: number })
    | null
  >(null);
  const replaceFnRef = useRef<
    | ((searchTerm: string, replaceTerm: string, replaceAll?: boolean) => void)
    | null
  >(null);
  const navigateFnRef = useRef<
    | ((direction: "next" | "previous") => {
        currentMatch: number;
        totalMatches: number;
      })
    | null
  >(null);
  const formatCodeBlockFnRef = useRef<(() => void) | null>(null);

  // Search state
  const [searchResults, setSearchResults] = useState({
    currentMatch: 0,
    totalMatches: 0
  });

  const editorConfig = useMemo(
    () => ({
      ...initialConfigTemplate,
      readOnly: readOnly
    }),
    [readOnly]
  );

  // Debounce onChange to avoid excessive re-renders which also interferes with
  // the HistoryPlugin state inside Lexical. A short delay greatly reduces the
  // number of times the whole modal needs to update while typing.

  const debouncedExternalOnChange = useMemo(
    () =>
      debounce((text: string) => {
        // Propagate to parent only after the debounce interval
        if (onChange) {
          onChange(text);
        }
      }, 300),
    [onChange]
  );

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      if (readOnly) {
        return;
      }

      const textContent = editorState.read(() => {
        return $getRoot().getTextContent();
      });

      // Update local statistics every change – this is cheap.
      setCurrentText(textContent);

      // Update the external consumer in a debounced manner to minimise
      // rerenders of the parent component tree.
      debouncedExternalOnChange(textContent);
    },
    [debouncedExternalOnChange, readOnly]
  );

  // Clean-up the debounced function when the component unmounts
  useEffect(() => {
    return () => {
      debouncedExternalOnChange.cancel();
    };
  }, [debouncedExternalOnChange]);

  // Toolbar handlers
  const handleUndo = useCallback(() => {
    undoFnRef.current?.();
  }, []);

  const handleRedo = useCallback(() => {
    redoFnRef.current?.();
  }, []);

  const handleToggleWordWrap = useCallback(() => {
    setWordWrapEnabled((prev) => !prev);
  }, []);

  const handleFormatCodeBlock = useCallback(() => {
    formatCodeBlockFnRef.current?.();
  }, []);

  const handleToggleFind = useCallback(() => {
    setFindReplaceVisible((prev: boolean) => !prev);
  }, []);

  const handleFind = useCallback((searchTerm: string) => {
    const results = findFnRef.current?.(searchTerm);
    if (results) {
      setSearchResults(results);
    }
  }, []);

  const handleReplace = useCallback(
    (searchTerm: string, replaceTerm: string, replaceAll?: boolean) => {
      replaceFnRef.current?.(searchTerm, replaceTerm, replaceAll);
    },
    []
  );

  const handleNavigateNext = useCallback(() => {
    const results = navigateFnRef.current?.("next");
    if (results) setSearchResults(results);
  }, []);

  const handleNavigatePrevious = useCallback(() => {
    const results = navigateFnRef.current?.("previous");
    if (results) setSearchResults(results);
  }, []);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === modalOverlayRef.current) {
      onClose();
    }
  };

  useCombo(["escape"], onClose);

  // Close signal from other properties so only one modal active
  useEffect(() => {
    const handler = () => {
      onClose();
    };
    window.addEventListener("close-text-editor-modal", handler);
    return () => window.removeEventListener("close-text-editor-modal", handler);
  }, [onClose]);

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
        <div
          className="modal-content"
          role="dialog"
          aria-modal="true"
          style={{ height: modalHeight }}
        >
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
              <Tooltip
                enterDelay={TOOLTIP_ENTER_DELAY}
                title="Close Editor | Esc"
              >
                <button className="button button-close" onClick={onClose}>
                  <CloseIcon />
                </button>
              </Tooltip>
            </div>
          </div>
          {showToolbar && (
            <EditorToolbar
              onUndo={handleUndo}
              onRedo={handleRedo}
              onToggleWordWrap={handleToggleWordWrap}
              onToggleFind={handleToggleFind}
              onFormatCodeBlock={handleFormatCodeBlock}
              canUndo={canUndo}
              canRedo={canRedo}
              wordWrapEnabled={wordWrapEnabled}
              isCodeBlock={isCodeBlock}
              readOnly={readOnly}
            />
          )}

          {showFindReplace && findReplaceVisible && (
            <FindReplaceBar
              onFind={handleFind}
              onReplace={handleReplace}
              onClose={handleToggleFind}
              onNext={handleNavigateNext}
              onPrevious={handleNavigatePrevious}
              currentMatch={searchResults.currentMatch}
              totalMatches={searchResults.totalMatches}
              isVisible={showFindReplace && findReplaceVisible}
            />
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
              <>
                <CopyToClipboardButton textToCopy={value || ""} />
                <LexicalComposer initialConfig={editorConfig}>
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column"
                    }}
                  >
                    <EditorController
                      onCanUndoChange={setCanUndo}
                      onCanRedoChange={setCanRedo}
                      onTextChange={setCurrentText}
                      onUndoCommand={(fn) => {
                        undoFnRef.current = fn;
                      }}
                      onRedoCommand={(fn) => {
                        redoFnRef.current = fn;
                      }}
                      onFindCommand={(fn) => {
                        findFnRef.current = fn;
                      }}
                      onReplaceCommand={(fn) => {
                        replaceFnRef.current = fn;
                      }}
                      onNavigateCommand={(fn) => {
                        navigateFnRef.current = fn;
                      }}
                      onFormatCodeCommand={(fn) => {
                        formatCodeBlockFnRef.current = fn;
                      }}
                      onIsCodeBlockChange={setIsCodeBlock}
                      wordWrapEnabled={wordWrapEnabled}
                      initialContent={value}
                    />
                    <LexicalPlugins
                      onChange={handleEditorChange}
                      wordWrapEnabled={wordWrapEnabled}
                    />
                  </div>
                </LexicalComposer>
              </>
            )}
          </div>

          {showStatusBar && (
            <EditorStatusBar text={currentText} readOnly={readOnly} />
          )}
          <div
            className="resize-handle"
            onMouseDown={handleResizeMouseDown}
          ></div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};

export default memo(TextEditorModal, isEqual);
