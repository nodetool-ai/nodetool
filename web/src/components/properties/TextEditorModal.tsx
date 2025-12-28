/** @jsxImportSource @emotion/react */

import ReactDOM from "react-dom";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { css } from "@emotion/react";
import CloseIcon from "@mui/icons-material/Close";
import CodeIcon from "@mui/icons-material/Code";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import SummarizeIcon from "@mui/icons-material/Summarize";
import TranslateIcon from "@mui/icons-material/Translate";
import ShortTextIcon from "@mui/icons-material/ShortText";
import SpellcheckIcon from "@mui/icons-material/Spellcheck";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import DownloadIcon from "@mui/icons-material/Download";
import FindInPageIcon from "@mui/icons-material/FindInPage";
import WrapTextIcon from "@mui/icons-material/WrapText";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ChatBubbleIcon from "@mui/icons-material/ChatBubble";
import { CircularProgress, Tooltip } from "@mui/material";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ListItemNode, ListNode } from "@lexical/list";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { EditorState, $getRoot } from "lexical";
import debounce from "lodash/debounce";
import isEqual from "lodash/isEqual";
import Markdown from "react-markdown";

import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
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
import { DEFAULT_MODEL } from "../../config/constants";
import { EditorInsertionProvider } from "../../contexts/EditorInsertionContext";
import type { LanguageModel } from "../../stores/ApiTypes";
import { useEditorMode } from "../../hooks/editor/useEditorMode";
import { useFullscreenMode } from "../../hooks/editor/useFullscreenMode";
import { useAssistantVisibility } from "../../hooks/editor/useAssistantVisibility";
import { useModalResize } from "../../hooks/editor/useModalResize";
import { useMonacoEditor } from "../../hooks/editor/useMonacoEditor";
import { useEditorActions } from "../../hooks/editor/useEditorActions";
import { useEditorKeyboardShortcuts } from "../../hooks/editor/useEditorKeyboardShortcuts";
import { useChatIntegration } from "../../hooks/editor/useChatIntegration";

/* code-highlight */
import { codeHighlightTheme } from "../textEditor/codeHighlightTheme";
import { codeHighlightTokenStyles } from "../textEditor/codeHighlightStyles";
import { NewChatButton } from "../chat";

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
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.5)`,
      backdropFilter: "blur(4px)",
      zIndex: 10000,
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      transition: "all 0.2s ease-in-out"
    },
    ".modal-overlay.fullscreen": {
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      padding: 0,
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.4)`
    },
    ".modal-content": {
      background: theme.vars.palette.glass.backgroundDialogContent, // More opaque for better readability
      backdropFilter: "blur(16px)", // Stronger blur
      WebkitBackdropFilter: "blur(16px)",
      color: theme.vars.palette.grey[100],
      fontSize: "var(--fontSizeBigger)",
      width: "92%",
      maxWidth: "1600px",
      height: "100%",
      margin: "auto",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      borderRadius: theme.vars.rounded.dialog,
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", // Custom XL shadow for glassmorphism
      overflow: "hidden" // Ensure border-radius clips content
    },
    ".modal-content.fullscreen": {
      width: "100%",
      maxWidth: "100%",
      height: "100%",
      borderRadius: 0,
      borderLeft: 0,
      borderRight: 0,
      borderTop: 0,
      borderBottom: 0
    },
    ".modal-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center", // Center aligned items
      padding: "0.75em 1.5em",
      minHeight: "3.5em",
      background: `linear-gradient(180deg, ${theme.vars.palette.action.hover} 0%, transparent 100%)`,
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
      position: "relative", // Changed from sticky to avoid layout issues if not needed, or keep sticky if content scrolls
      zIndex: 5,
      h4: {
        cursor: "default",
        fontWeight: "600",
        margin: "0",
        fontSize: "var(--fontSizeBig)",
        letterSpacing: "0.02em",
        color: theme.vars.palette.text.primary,
        textShadow: "0 1px 2px rgba(0,0,0,0.2)"
      }
    },
    ".title-and-description": {
      flex: 1,
      display: "flex",
      flexDirection: "row",
      alignItems: "baseline",
      gap: "1em",
      overflow: "hidden"
    },
    ".toolbar-group": {
      display: "flex",
      alignItems: "center",
      gap: ".5em",
      "& + .toolbar-group": {
        borderLeft: `1px solid ${theme.vars.palette.grey[700]}`,
        marginLeft: ".5em",
        paddingLeft: ".5em"
      }
    },
    ".code-tools": {
      display: "flex",
      alignItems: "center",
      gap: ".35em",
      marginRight: "0.5em"
    },
    ".language-select": {
      background: "rgba(0,0,0,0.2)",
      color: theme.vars.palette.grey[100],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: "6px",
      padding: "4px 8px",
      fontSize: "var(--fontSizeSmaller)",
      outline: "none",
      transition: "all 0.2s ease",
      cursor: "pointer",
      "&:hover": {
        borderColor: theme.vars.palette.grey[500],
        background: "action.selected"
      },
      "&:focus": {
        borderColor: theme.vars.palette.primary.main
      }
    },
    ".description": {
      width: "100%",
      maxWidth: "600px",
      maxHeight: "1.5em",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      padding: "0",
      margin: "0",
      fontSize: "var(--fontSizeSmaller)",
      opacity: 0.7,
      p: {
        margin: 0,
        display: "inline"
      }
    },
    ".modal-body": {
      position: "relative",
      flex: 1,
      display: "flex",
      flexDirection: "row",
      padding: "0",
      background: "transparent",
      height: "100%",
      overflow: "hidden",
      ".editor": {
        flex: 1,
        width: "100%",
        fontSize: "var(--fontSizeSmall)",
        lineHeight: "1.5",
        color: theme.vars.palette.grey[100],
        outline: "none",
        overflow: "auto !important",
        height: "100%",
        padding: "1em 1.5em",
        pre: {
          height: "100%",
          overflowWrap: "break-word",
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
        },
        textarea: {
          overflowWrap: "break-word",
          height: "100% !important",
          width: "100% !important",
          fontFamily: "inherit"
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
        overflow: "hidden",
        position: "relative"
      },
      ".assistant-pane": {
        width: "35%",
        minWidth: "300px",
        maxWidth: "500px",
        borderLeft: `1px solid ${theme.vars.palette.grey[800]}`,
        background: "action.disabledBackground", // Subtle transform
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden"
      }
    },
    ".actions": {
      display: "flex",
      gap: ".6em",
      alignItems: "center",
      flexWrap: "nowrap"
    },
    ".copy-to-clipboard-button": {
      position: "absolute",
      right: "1.5em",
      top: "1em"
    },
    ".button": {
      padding: "6px 10px",
      cursor: "pointer",
      color: theme.vars.palette.text.primary,
      textTransform: "none",
      borderRadius: "6px",
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: "600",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "32px",
      minHeight: "32px",
      background: `linear-gradient(180deg, ${theme.vars.palette.action.hover} 0%, ${theme.vars.palette.action.hover} 100%)`,
      border: "none",
      boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
      "&:hover": {
        background: `linear-gradient(180deg, ${theme.vars.palette.action.focus} 0%, ${theme.vars.palette.action.selected} 100%)`,
        boxShadow: "0 4px 8px rgba(0,0,0,0.2)"
      },
      "&:active": {
        background: "action.disabledBackground",
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)"
      }
    },
    ".button-close": {
      marginLeft: "0.5em",
      padding: "6px",
      minWidth: "32px",
      minHeight: "32px",
      borderRadius: "6px",
      color: theme.vars.palette.grey[400],
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: `rgba(${theme.vars.palette.error.mainChannel} / 0.2)`, // Subtle red hover
        color: "error.main"
      }
    },
    ".button-ghost": {
      padding: "6px",
      cursor: "pointer",
      color: theme.vars.palette.grey[300],
      fontSize: "var(--fontSizeSmaller)",
      borderRadius: "6px",
      background: "transparent",
      border: "1px solid transparent",
      minWidth: "32px",
      minHeight: "32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: "action.selected",
        color: theme.vars.palette.text.primary,
        borderColor: "action.selected"
      }
    },
    ".resize-handle": {
      position: "relative",
      height: "12px",
      width: "100%",
      cursor: "row-resize",
      backgroundColor: "transparent",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: "action.hover"
      },
      "&:hover .resize-handle-thumb": {
        backgroundColor: theme.vars.palette.primary.main,
        transform: "translate(-50%, -50%) scaleX(1.1)"
      }
    },
    ".resize-handle-thumb": {
      position: "absolute",
      width: "60px",
      height: "4px",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: theme.vars.palette.grey[700],
      borderRadius: "10px",
      transition: "all 0.2s ease"
    },
    "@media (max-width: 1200px)": {
      ".modal-content": {
        width: "96%"
      },
      ".assistant-pane": {
        width: "36%",
        minWidth: "280px"
      }
    },
    "@media (max-width: 900px)": {
      ".title-and-description": {
        flexDirection: "column",
        alignItems: "flex-start",
        gap: ".25em"
      },
      ".description": {
        display: "none"
      },
      ".modal-body": {
        flexDirection: "column"
      },
      ".assistant-pane": {
        width: "100%",
        minWidth: "unset",
        maxWidth: "unset",
        marginLeft: 0,
        marginTop: "0",
        borderLeft: "none",
        borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
        height: "40%"
      },
      ".button": {
        minWidth: "36px",
        minHeight: "36px"
      }
    }
  });

const TextEditorModal = ({
  value,
  onChange,
  onClose,
  propertyName,
  propertyDescription,
  language: defaultLanguage = "",
  readOnly = false,
  isLoading = false,
  showToolbar = true,
  showStatusBar = true,
  showFindReplace = true
}: TextEditorModalProps) => {
  const theme = useTheme();
  const modalOverlayRef = useRef<HTMLDivElement>(null);

  // Monaco dynamic import and actions (hook)
  const {
    MonacoEditor,
    monacoLoadError,
    loadMonacoIfNeeded,
    monacoRef,
    monacoOnMount,
    handleMonacoFind,
    handleMonacoFormat
  } = useMonacoEditor();

  // Editor mode toggle (extracted hook)
  const { isCodeEditor, setIsCodeEditor, toggleEditorMode } = useEditorMode({
    storageKey: "textEditorModal_useCodeEditor",
    onCodeEnabled: () => {
      void loadMonacoIfNeeded();
    }
  });

  // Fullscreen toggle (hook)
  const { isFullscreen, toggleFullscreen } = useFullscreenMode({
    storageKey: "textEditorModal_fullscreen"
  });

  // Assistant pane visibility (hook)
  const { assistantVisible, toggleAssistantVisible } = useAssistantVisibility({
    storageKey: "textEditorModal_assistantVisible",
    defaultVisible: true
  });

  const handleToggleEditorMode = useCallback(() => {
    toggleEditorMode();
  }, [toggleEditorMode]);

  // If we start in code mode, ensure Monaco loads immediately
  useEffect(() => {
    if (isCodeEditor) {
      void loadMonacoIfNeeded();
    }
  }, [isCodeEditor, loadMonacoIfNeeded]);

  // Resizable modal height state (hook)
  const { modalHeight, handleResizeMouseDown } = useModalResize({
    storageKey: "textEditorModal_height"
  });

  // Editor state management
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [wordWrapEnabled, setWordWrapEnabled] = useState(true);
  const [isCodeBlock, setIsCodeBlock] = useState(false);
  const [findReplaceVisible, setFindReplaceVisible] = useState(false);
  const [currentText, setCurrentText] = useState(value || "");
  const [language, setLanguage] = useState(defaultLanguage || "");

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

  // Chat integration
  const {
    handleAITransform,
    status,
    progress,
    statusMessage,
    getCurrentMessagesSync,
    sendMessage,
    selectedModel,
    setSelectedModel,
    selectedTools,
    selectedCollections,
    stopGeneration,
    createNewThread
  } = useChatIntegration({
    isCodeEditor,
    monacoRef,
    getSelectedTextFnRef,
    replaceSelectionFnRef,
    setAllTextFnRef,
    setCurrentText,
    currentText
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

  const handleDownload = useCallback(() => {
    const blob = new Blob([currentText || ""], {
      type: "text/plain;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const extMap: Record<string, string> = {
      plaintext: "txt",
      markdown: "md",
      javascript: "js",
      typescript: "ts",
      python: "py",
      json: "json",
      yaml: "yml",
      html: "html",
      css: "css",
      sql: "sql",
      shell: "sh",
      bash: "sh"
    };
    const ext = (extMap[language] || "txt").replace(/^\./, "");
    const safeName = (propertyName || "document")
      .toString()
      .replace(/[^a-z0-9-_]+/gi, "_");
    link.href = url;
    link.download = `${safeName}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [currentText, language, propertyName]);

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
    [isCodeEditor, insertIntoLexical, monacoRef]
  );

  const handleImproveSelection = useCallback(async () => {
    await handleAITransform(
      "Improve the following text for clarity, grammar, and style. Return only the improved text without commentary:"
    );
  }, [handleAITransform]);

  const handleSummarizeSelection = useCallback(async () => {
    await handleAITransform(
      "Summarize the following text in 3-5 bullet points. Return only the summary:",
      { shouldReplace: false }
    );
  }, [handleAITransform]);

  const handleExplainSelection = useCallback(async () => {
    await handleAITransform(
      "Explain the following text simply and clearly. Return only the explanation:",
      { shouldReplace: false }
    );
  }, [handleAITransform]);

  const handleShortenSelection = useCallback(async () => {
    await handleAITransform(
      "Rewrite the following text to be more concise while preserving meaning. Return only the shortened text:"
    );
  }, [handleAITransform]);

  const handleFixGrammarSelection = useCallback(async () => {
    await handleAITransform(
      "Fix grammar, spelling, and punctuation in the following text without changing its meaning. Return only the corrected text:"
    );
  }, [handleAITransform]);

  const handleTranslateSelection = useCallback(async () => {
    await handleAITransform(
      "Translate the following text to English. Return only the translation:"
    );
  }, [handleAITransform]);

  // Clean-up the debounced function when the component unmounts
  useEffect(() => {
    return () => {
      debouncedExternalOnChange.cancel();
    };
  }, [debouncedExternalOnChange]);

  // Toolbar handlers (hook)
  const {
    handleUndo,
    handleRedo,
    handleToggleWordWrap,
    handleFormatCodeBlock,
    handleToggleFind,
    handleFind,
    handleReplace,
    handleNavigateNext,
    handleNavigatePrevious
  } = useEditorActions({
    setWordWrapEnabled,
    setFindReplaceVisible,
    setSearchResults,
    undoFnRef,
    redoFnRef,
    formatCodeBlockFnRef,
    findFnRef,
    replaceFnRef,
    navigateFnRef
  });

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === modalOverlayRef.current) {
      onClose();
    }
  };

  useCombo(["escape"], onClose);

  // Shortcuts: fullscreen, assistant pane, editor mode (hook)
  useEditorKeyboardShortcuts({
    onToggleFullscreen: toggleFullscreen,
    onToggleAssistant: toggleAssistantVisible,
    onToggleEditorMode: handleToggleEditorMode
  });

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
        className={`modal-overlay ${isFullscreen ? "fullscreen" : ""}`}
        role="presentation"
        onClick={handleOverlayClick}
        ref={modalOverlayRef}
      >
        <div
          className={`modal-content ${isFullscreen ? "fullscreen" : ""}`}
          role="dialog"
          aria-modal="true"
          style={{ height: isFullscreen ? "100vh" : modalHeight }}
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
              {isCodeEditor && (
                <div className="toolbar-group code-tools">
                  <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Find">
                    <button className="button-ghost" onClick={handleMonacoFind}>
                      <FindInPageIcon />
                    </button>
                  </Tooltip>
                  {!readOnly && (
                    <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Format">
                      <button
                        className="button-ghost"
                        onClick={handleMonacoFormat}
                      >
                        <FormatAlignLeftIcon />
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip
                    enterDelay={TOOLTIP_ENTER_DELAY}
                    title={wordWrapEnabled ? "Disable wrap" : "Enable wrap"}
                  >
                    <button
                      className="button-ghost"
                      onClick={handleToggleWordWrap}
                    >
                      <WrapTextIcon />
                    </button>
                  </Tooltip>
                  <select
                    className="language-select"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    {[
                      "plaintext",
                      "markdown",
                      "javascript",
                      "typescript",
                      "python",
                      "json",
                      "lua",
                      "yaml",
                      "html",
                      "css",
                      "sql",
                      "bash",
                      "ruby"
                    ].map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="toolbar-group">
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
                  <>
                    <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Improve">
                      <button
                        className="button"
                        onClick={handleImproveSelection}
                      >
                        <AutoFixHighIcon />
                      </button>
                    </Tooltip>
                    <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Summarize">
                      <button
                        className="button"
                        onClick={handleSummarizeSelection}
                      >
                        <SummarizeIcon />
                      </button>
                    </Tooltip>
                    <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Explain">
                      <button
                        className="button"
                        onClick={handleExplainSelection}
                      >
                        <HelpOutlineIcon />
                      </button>
                    </Tooltip>
                    <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Shorten">
                      <button
                        className="button"
                        onClick={handleShortenSelection}
                      >
                        <ShortTextIcon />
                      </button>
                    </Tooltip>
                    <Tooltip
                      enterDelay={TOOLTIP_ENTER_DELAY}
                      title="Fix Grammar"
                    >
                      <button
                        className="button"
                        onClick={handleFixGrammarSelection}
                      >
                        <SpellcheckIcon />
                      </button>
                    </Tooltip>
                    <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Translate">
                      <button
                        className="button"
                        onClick={handleTranslateSelection}
                      >
                        <TranslateIcon />
                      </button>
                    </Tooltip>
                  </>
                )}
              </div>
              <div className="toolbar-group">
                <Tooltip
                  enterDelay={TOOLTIP_ENTER_DELAY}
                  title={assistantVisible ? "Hide Assistant" : "Show Assistant"}
                >
                  <button className="button" onClick={toggleAssistantVisible}>
                    {assistantVisible ? (
                      <ChatBubbleIcon />
                    ) : (
                      <ChatBubbleOutlineIcon />
                    )}
                  </button>
                </Tooltip>
                <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Download">
                  <button className="button" onClick={handleDownload}>
                    <DownloadIcon />
                  </button>
                </Tooltip>
                <Tooltip
                  enterDelay={TOOLTIP_ENTER_DELAY}
                  title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  <button className="button" onClick={toggleFullscreen}>
                    {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                  </button>
                </Tooltip>
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
                  <CopyToClipboardButton copyValue={value} />
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
                {assistantVisible && (
                  <div className="assistant-pane">
                    <NewChatButton onNewThread={createNewThread} />
                    <ChatView
                      status={
                        status === "stopping" ? "loading" : (status as any)
                      }
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
                      helpMode={false}
                      workflowAssistant={true}
                      onStop={stopGeneration}
                      onNewChat={createNewThread}
                      onInsertCode={(text) => insertIntoEditor(text)}
                    />
                  </div>
                )}
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
