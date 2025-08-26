/** @jsxImportSource @emotion/react */

import ReactDOM from "react-dom";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { css } from "@emotion/react";
import CloseIcon from "@mui/icons-material/Close";
import CodeIcon from "@mui/icons-material/Code";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
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
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import LexicalPlugins from "../textEditor/LexicalEditor";
import EditorController from "../textEditor/EditorController";
import EditorStatusBar from "../textEditor/EditorStatusBar";
import EditorToolbar from "../textEditor/EditorToolbar";
import FindReplaceBar from "../textEditor/FindReplaceBar";
import ChatView from "../chat/containers/ChatView";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { DEFAULT_MODEL } from "../../config/constants";
import { EditorInsertionProvider } from "../../contexts/EditorInsertionContext";
import type { MessageContent, LanguageModel } from "../../stores/ApiTypes";

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
  language?: string;
  readOnly?: boolean;
  isLoading?: boolean;
  showToolbar?: boolean;
  showStatusBar?: boolean;
  showFindReplace?: boolean;
}

const styles = (theme: Theme) =>
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
      backgroundColor: theme.vars.palette.grey[800],
      color: theme.vars.palette.grey[100],
      fontSize: "var(--fontSizeBigger)",
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
      padding: ".5em 3.5em .5em 1em",
      minHeight: "2em",
      backgroundColor: theme.vars.palette.grey[800],
      h4: {
        cursor: "default",
        fontWeight: "600",
        margin: "0",
        fontSize: "var(--fontSizeBig)",
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
      fontSize: "var(--fontSizeSmaller)",
      p: {
        color: theme.vars.palette.grey[200],
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
      flexDirection: "row",
      padding: "1em 2em 1em 1em",
      backgroundColor: theme.vars.palette.background.default,
      height: "100%",
      overflow: "hidden",
      ".editor": {
        flex: 1,
        width: "100%",
        fontSize: "var(--fontSizeSmall)",
        lineHeight: "1.2",
        color: theme.vars.palette.grey[0],
        // backgroundColor: theme.vars.palette.grey[600],
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
      },
      ".editor-pane": {
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden"
      },
      ".assistant-pane": {
        width: "40%",
        minWidth: "320px",
        maxWidth: "560px",
        borderLeft: `1px solid ${theme.vars.palette.grey[700]}`,
        marginLeft: "1em",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden"
      }
    },
    ".actions": {
      display: "flex",
      gap: "1em",
      alignItems: "flex-start",
      marginTop: "0",
      marginRight: "0"
    },
    ".copy-to-clipboard-button": {
      position: "absolute",
      right: ".3em",
      top: "1em",
      zIndex: 10,
      padding: "8px !important",
      backgroundColor: "transparent",
      color: `${theme.vars.palette.grey[0]} !important`,
      borderRadius: "4px !important",
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: "500",
      transition: "all 0.2s ease",
      minWidth: "32px",
      minHeight: "32px",
      "&:hover": {
        backgroundColor: `${theme.vars.palette.grey[600]} `
      }
    },
    ".button": {
      padding: "10px 14px",
      cursor: "pointer",
      backgroundColor: theme.vars.palette.grey[600],
      color: theme.vars.palette.grey[0],
      textTransform: "uppercase",
      border: "none",
      borderRadius: "4px",
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: "500",
      transition: "all 0.2s ease",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "44px",
      minHeight: "44px",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[500]
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
        backgroundColor: theme.vars.palette.grey[600]
      }
    },
    ".resize-handle": {
      position: "relative",
      height: "10px",
      width: "100%",
      cursor: "row-resize",
      // borderRadius: "4px",
      backgroundColor: theme.vars.palette.grey[600],
      "&:hover": {
        // backgroundColor: theme.vars.palette.grey[800]
      },
      "&:hover .resize-handle-thumb": {
        backgroundColor: theme.vars.palette.grey[100]
      }
    },
    ".resize-handle-thumb": {
      position: "absolute",
      width: "100px",
      height: "4px",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: theme.vars.palette.grey[400],
      borderRadius: "4px"
    }
  });

const TextEditorModal = ({
  value,
  onChange,
  onClose,
  propertyName,
  propertyDescription,
  language = "python",
  readOnly = false,
  isLoading = false,
  showToolbar = true,
  showStatusBar = true,
  showFindReplace = true
}: TextEditorModalProps) => {
  const theme = useTheme();
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const { writeClipboard } = useClipboard();
  const {
    connect,
    status,
    sendMessage,
    progress,
    statusMessage,
    getCurrentMessagesSync,
    selectedModel,
    setSelectedModel,
    selectedTools,
    selectedCollections,
    currentPlanningUpdate,
    currentTaskUpdate,
    stopGeneration,
    createNewThread
  } = useGlobalChatStore();

  // Editor mode toggle
  const CODE_EDITOR_TOGGLE_KEY = "textEditorModal_useCodeEditor";
  const getInitialIsCodeEditor = useCallback(() => {
    try {
      const saved = localStorage.getItem(CODE_EDITOR_TOGGLE_KEY);
      if (saved === "true" || saved === "false") {
        return saved === "true";
      }
    } catch {
      /* empty */
    }
    return false;
  }, []);
  const [isCodeEditor, setIsCodeEditor] = useState<boolean>(
    getInitialIsCodeEditor
  );
  useEffect(() => {
    try {
      localStorage.setItem(
        CODE_EDITOR_TOGGLE_KEY,
        isCodeEditor ? "true" : "false"
      );
    } catch {
      /* empty */
    }
  }, [isCodeEditor]);

  // Monaco dynamic import (loaded on demand)
  const [MonacoEditor, setMonacoEditor] = useState<
    | ((props: {
        value: string;
        onChange?: (val?: string) => void;
        language?: string;
        theme?: string;
        options?: Record<string, unknown>;
        width?: string | number;
        height?: string | number;
        onMount?: (editor: unknown, monaco: unknown) => void;
      }) => JSX.Element)
    | null
  >(null);
  const [monacoLoadError, setMonacoLoadError] = useState<string | null>(null);
  const loadMonacoIfNeeded = useCallback(async () => {
    if (MonacoEditor || monacoLoadError) return;
    try {
      const mod = await import("@monaco-editor/react");
      // default export is Editor component
      setMonacoEditor(() => mod.default as unknown as typeof MonacoEditor);
    } catch (err) {
      setMonacoLoadError("Failed to load code editor");
    }
  }, [MonacoEditor, monacoLoadError]);

  const handleToggleEditorMode = useCallback(() => {
    setIsCodeEditor((prev) => {
      const next = !prev;
      if (next) {
        // switching to code editor - lazy load Monaco
        // fire and forget
        void loadMonacoIfNeeded();
      }
      return next;
    });
  }, [loadMonacoIfNeeded]);

  // If we start in code mode, ensure Monaco loads immediately
  useEffect(() => {
    if (isCodeEditor) {
      void loadMonacoIfNeeded();
    }
  }, [isCodeEditor, loadMonacoIfNeeded]);

  // Ensure chat is connected for assistant pane
  useEffect(() => {
    connect().catch(() => undefined);
  }, [connect]);

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
  const insertTextFnRef = useRef<((text: string) => void) | null>(null);
  const replaceSelectionFnRef = useRef<((text: string) => void) | null>(null);
  const setAllTextFnRef = useRef<((text: string) => void) | null>(null);
  const getSelectedTextFnRef = useRef<(() => string) | null>(null);

  const improvePendingRef = useRef<{
    active: boolean;
    baseCount: number;
    hadSelection: boolean;
    isCodeEditor: boolean;
    monacoRange: any | null;
  }>({
    active: false,
    baseCount: 0,
    hadSelection: false,
    isCodeEditor: false,
    monacoRange: null
  });

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
  // Insertion handlers for both editors
  const monacoRef = useRef<any>(null);
  const monacoOnMount = useCallback((editor: any) => {
    monacoRef.current = editor;
  }, []);

  const insertIntoLexical = useCallback(
    (text: string) => {
      if (insertTextFnRef.current) {
        insertTextFnRef.current(text);
      } else {
        setCurrentText((prev) => (prev ? prev + "\n" + text : text));
        debouncedExternalOnChange(text);
      }
    },
    [debouncedExternalOnChange]
  );

  const insertIntoEditor = useCallback(
    (text: string) => {
      if (isCodeEditor && monacoRef.current) {
        const editor = monacoRef.current;
        const selection = editor.getSelection();
        const range = selection || editor.getModel().getFullModelRange();
        editor.executeEdits("insert-from-chat", [
          { range, text, forceMoveMarkers: true }
        ]);
        editor.focus();
      } else {
        insertIntoLexical(text);
      }
    },
    [isCodeEditor, insertIntoLexical]
  );

  const handleImproveSelection = useCallback(async () => {
    // Get selected text from the active editor
    let selected = "";
    let hadSelection = false;
    let monacoRange: any | null = null;
    if (isCodeEditor && monacoRef.current) {
      try {
        const editor = monacoRef.current;
        const selection = editor.getSelection();
        if (selection) {
          selected = editor.getModel().getValueInRange(selection) || "";
          hadSelection = !!selected && selected.trim().length > 0;
          monacoRange = selection;
        }
      } catch {
        /* empty */
      }
    } else if (getSelectedTextFnRef.current) {
      try {
        selected = getSelectedTextFnRef.current() || "";
        hadSelection = !!selected && selected.trim().length > 0;
      } catch {
        /* empty */
      }
    }

    const textToImprove =
      selected && selected.trim().length > 0 ? selected : currentText;

    if (!textToImprove || textToImprove.trim().length === 0) {
      return;
    }

    const instruction =
      "Improve the following text for clarity, grammar, and style. Return only the improved text without commentary:\n\n";

    const composed = `${instruction}${textToImprove}`;

    const content: MessageContent[] = [
      { type: "text", text: composed } as MessageContent
    ];

    try {
      const baseCount = getCurrentMessagesSync().length || 0;
      improvePendingRef.current = {
        active: true,
        baseCount,
        hadSelection,
        isCodeEditor,
        monacoRange
      };
      await sendMessage({
        type: "message",
        name: "",
        role: "user",
        provider: (selectedModel as any)?.provider,
        model: (selectedModel as any)?.id,
        content,
        tools: selectedTools.length > 0 ? selectedTools : undefined,
        collections:
          selectedCollections.length > 0 ? selectedCollections : undefined,
        agent_mode: false,
        help_mode: true,
        workflow_assistant: true
      } as any);
    } catch (err) {
      // Surface no error UI; rely on existing error handling in chat view/store
    }
  }, [
    isCodeEditor,
    monacoRef,
    getSelectedTextFnRef,
    currentText,
    sendMessage,
    selectedModel,
    selectedTools,
    selectedCollections,
    getCurrentMessagesSync
  ]);

  useEffect(() => {
    const unsubscribe = useGlobalChatStore.subscribe((state, prevState) => {
      const pending = improvePendingRef.current;
      if (!pending.active) return;

      const threadId = state.currentThreadId;
      if (!threadId) return;

      const messages = state.messageCache?.[threadId] || [];
      if (messages.length <= pending.baseCount) return;

      if (state.status === "streaming") return;

      const last = messages[messages.length - 1];
      if (!last || last.role !== "assistant") return;

      let responseText = "";
      const content = last.content as any;
      if (typeof content === "string") {
        responseText = content;
      } else if (Array.isArray(content)) {
        const textItem = content.find((c: any) => c?.type === "text");
        responseText = textItem?.text || "";
      }

      if (!responseText) return;

      if (pending.isCodeEditor && monacoRef.current) {
        const editor = monacoRef.current;
        try {
          if (pending.hadSelection && pending.monacoRange) {
            editor.executeEdits("improve-replace", [
              {
                range: pending.monacoRange,
                text: responseText,
                forceMoveMarkers: true
              }
            ]);
          } else {
            editor.setValue(responseText);
          }
          editor.focus();
        } catch {
          /* empty */
        }
      } else {
        if (pending.hadSelection && replaceSelectionFnRef.current) {
          replaceSelectionFnRef.current(responseText);
        } else if (setAllTextFnRef.current) {
          setAllTextFnRef.current(responseText);
        } else {
          setCurrentText(responseText);
        }
      }

      improvePendingRef.current.active = false;
    });
    return () => {
      try {
        unsubscribe?.();
      } catch {
        /* empty */
      }
    };
  }, [monacoRef]);

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
                      ? theme.vars.palette.warning.main
                      : theme.vars.palette.grey[0]
                  }}
                >
                  <Markdown>{propertyDescription}</Markdown>
                </div>
              )}
            </div>
            <div className="actions">
              {!readOnly && (
                <Tooltip
                  enterDelay={TOOLTIP_ENTER_DELAY}
                  title={
                    isCodeEditor
                      ? "Switch to Rich Text"
                      : "Switch to Code Editor"
                  }
                >
                  <button className="button" onClick={handleToggleEditorMode}>
                    {isCodeEditor ? <TextFieldsIcon /> : <CodeIcon />}
                  </button>
                </Tooltip>
              )}
              {!readOnly && (
                <Tooltip
                  enterDelay={TOOLTIP_ENTER_DELAY}
                  title="Improve Selection"
                >
                  <button className="button" onClick={handleImproveSelection}>
                    <AutoFixHighIcon />
                  </button>
                </Tooltip>
              )}
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
          {showToolbar && !isCodeEditor && (
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

          {showFindReplace && !isCodeEditor && findReplaceVisible && (
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
              <EditorInsertionProvider value={insertIntoEditor}>
                <div className="editor-pane">
                  <CopyToClipboardButton textToCopy={value || ""} />
                  {isCodeEditor ? (
                    <div style={{ height: "100%" }}>
                      {MonacoEditor ? (
                        <MonacoEditor
                          value={currentText}
                          onChange={(v) => {
                            const next = v ?? "";
                            setCurrentText(next);
                            debouncedExternalOnChange(next);
                          }}
                          language={language}
                          theme={"vs-dark"}
                          width="100%"
                          height="100%"
                          onMount={monacoOnMount}
                          options={{
                            readOnly,
                            wordWrap: wordWrapEnabled ? "on" : "off",
                            minimap: { enabled: false },
                            automaticLayout: true,
                            renderWhitespace: "selection",
                            scrollBeyondLastLine: false
                          }}
                        />
                      ) : monacoLoadError ? (
                        <div
                          style={{
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: theme.vars.palette.warning.main
                          }}
                        >
                          {monacoLoadError}
                        </div>
                      ) : (
                        <div
                          style={{
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          <CircularProgress />
                        </div>
                      )}
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
                          initialContent={value}
                          onInsertTextCommand={(fn) => {
                            // Save the inserter for Lexical
                            (insertTextFnRef as any).current = fn;
                          }}
                          onReplaceSelectionCommand={(fn) => {
                            (replaceSelectionFnRef as any).current = fn;
                          }}
                          onSetAllTextCommand={(fn) => {
                            (setAllTextFnRef as any).current = fn;
                          }}
                          onGetSelectedTextCommand={(fn) => {
                            (getSelectedTextFnRef as any).current = fn;
                          }}
                        />
                        <LexicalPlugins
                          onChange={handleEditorChange}
                          wordWrapEnabled={wordWrapEnabled}
                        />
                      </div>
                    </LexicalComposer>
                  )}
                </div>
                <div className="assistant-pane">
                  <ChatView
                    status={status === "stopping" ? "loading" : (status as any)}
                    progress={progress.current}
                    total={progress.total}
                    messages={getCurrentMessagesSync()}
                    sendMessage={sendMessage}
                    progressMessage={statusMessage}
                    model={
                      (selectedModel as LanguageModel) || {
                        type: "language_model",
                        provider: "empty",
                        id: DEFAULT_MODEL,
                        name: DEFAULT_MODEL
                      }
                    }
                    selectedTools={selectedTools}
                    selectedCollections={selectedCollections}
                    onModelChange={setSelectedModel}
                    helpMode={true}
                    workflowAssistant={true}
                    onStop={stopGeneration}
                    onNewChat={createNewThread}
                    onInsertCode={(text) => insertIntoEditor(text)}
                  />
                </div>
              </EditorInsertionProvider>
            )}
          </div>

          {showStatusBar && (
            <EditorStatusBar text={currentText} readOnly={readOnly} />
          )}
          <div className="resize-handle" onMouseDown={handleResizeMouseDown}>
            <span className="resize-handle-thumb"></span>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};

export default memo(TextEditorModal, isEqual);
