/** @jsxImportSource @emotion/react */

import ReactDOM from "react-dom";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { css } from "@emotion/react";
import CloseIcon from "@mui/icons-material/Close";
import CodeIcon from "@mui/icons-material/Code";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import CloseFullscreenIcon from "@mui/icons-material/CloseFullscreen";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import DownloadIcon from "@mui/icons-material/Download";
import HistoryIcon from "@mui/icons-material/History";
import SearchIcon from "@mui/icons-material/Search";
import WrapTextIcon from "@mui/icons-material/WrapText";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import DataObjectIcon from "@mui/icons-material/DataObject";
import AddIcon from "@mui/icons-material/Add";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import TextDecreaseIcon from "@mui/icons-material/TextDecrease";
import TextIncreaseIcon from "@mui/icons-material/TextIncrease";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ChatBubbleIcon from "@mui/icons-material/ChatBubble";
import { Tooltip, LoadingSpinner, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ListItemNode, ListNode } from "@lexical/list";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { EditorState, $getRoot } from "lexical";
import type { editor as MonacoEditorNS } from "monaco-editor";
import { debounce } from "../../utils/lodashAlternatives";
import isEqual from "fast-deep-equal";

import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useCombo } from "../../stores/KeyPressedStore";

import { CopyButton } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import LexicalPlugins from "../textEditor/LexicalEditor";
import EditorController from "../textEditor/EditorController";
import EditorStatusBar from "../textEditor/EditorStatusBar";
import EditorVariablesPanel from "../textEditor/EditorVariablesPanel";
import AssistantQuickStarts from "../textEditor/AssistantQuickStarts";
import FindReplaceBar from "../textEditor/FindReplaceBar";
import ChatView from "../chat/containers/ChatView";
import { DEFAULT_MODEL } from "../../config/constants";
import { EditorInsertionProvider } from "../../contexts/EditorInsertionContext";
import type { LanguageModel, Message } from "../../stores/ApiTypes";
import { useEditorMode } from "../../hooks/editor/useEditorMode";
import { useFullscreenMode } from "../../hooks/editor/useFullscreenMode";
import { useAssistantVisibility } from "../../hooks/editor/useAssistantVisibility";
import { useModalResize } from "../../hooks/editor/useModalResize";
import { useMonacoEditor } from "../../hooks/editor/useMonacoEditor";
import { useEditorActions } from "../../hooks/editor/useEditorActions";
import { useEditorKeyboardShortcuts } from "../../hooks/editor/useEditorKeyboardShortcuts";
import { useChatIntegration } from "../../hooks/editor/useChatIntegration";
import {
  allowsSingleBraceVariables,
  findTemplateVariables,
  formatVariableToken,
  uniqueTemplateVariables,
  type VariableSyntax
} from "../textEditor/templateVariables";

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

const LANGUAGES = [
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
] as const;

const LANGUAGE_LABELS: Record<string, string> = {
  "": "Plain Text",
  plaintext: "Plain Text",
  text: "Plain Text",
  markdown: "Markdown",
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  json: "JSON",
  lua: "Lua",
  yaml: "YAML",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  bash: "Bash",
  ruby: "Ruby"
};

const TYPE_LABELS: Record<string, string> = {
  str: "string",
  int: "integer",
  float: "float",
  bool: "boolean",
  list: "list",
  dict: "dict",
  any: "any",
  text: "text"
};

const FILE_EXTENSIONS: Record<string, string> = {
  plaintext: "txt",
  text: "txt",
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
  bash: "sh",
  ruby: "rb",
  lua: "lua"
};

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 32;

/** Turn "nodetool.text.TextGeneration" into "Text Generation". */
const humanizeNodeType = (nodeType: string): string => {
  if (!nodeType) {
    return "";
  }
  const last = nodeType.split(".").pop() ?? nodeType;
  return last
    .replace(/[_-]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
};

interface TextEditorModalProps {
  value: string;
  onChange?: (value: string) => void;
  onClose: () => void;
  propertyName: string;
  propertyDescription?: string;
  propertyType?: string;
  language?: string;
  nodeType?: string;
  readOnly?: boolean;
  isLoading?: boolean;
  showToolbar?: boolean;
  showStatusBar?: boolean;
  showFindReplace?: boolean;
}

const styles = (theme: Theme) =>
  css({
    "@keyframes modalSlideIn": {
      "0%": {
        opacity: 0,
        transform: "scale(0.97) translateY(8px)"
      },
      "100%": {
        opacity: 1,
        transform: "scale(1) translateY(0)"
      }
    },
    "@keyframes pulseGlow": {
      "0%, 100%": { opacity: 0.6 },
      "50%": { opacity: 1 }
    },
    ".modal-overlay": {
      position: "fixed",
      top: "72px",
      left: "51px",
      width: "calc(100vw - 51px)",
      height: "fit-content",
      padding: ".5em .5em 0 .5em",
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.6)`,
      backdropFilter: "blur(12px) saturate(150%)",
      WebkitBackdropFilter: "blur(12px) saturate(150%)",
      zIndex: 10000,
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      transition: MOTION.all
    },
    ".modal-overlay.fullscreen": {
      top: 0,
      left: 0,
      width: "100vw",
      height: "100dvh",
      padding: 0,
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.85)`
    },
    ".modal-content": {
      background: `linear-gradient(160deg,
        rgba(${theme.vars.palette.background.paperChannel} / 0.96),
        rgba(${theme.vars.palette.background.defaultChannel} / 0.99))`,
      backdropFilter: "blur(24px) saturate(180%)",
      WebkitBackdropFilter: "blur(24px) saturate(180%)",
      color: theme.vars.palette.text.primary,
      fontSize: "var(--fontSizeBig)",
      width: "100%",
      maxWidth: "2400px",
      height: "100%",
      margin: "auto",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      border: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.1)`,
      borderRadius: theme.vars.rounded.dialog,
      boxShadow: `0 48px 100px -24px rgba(0, 0, 0, 0.65),
        0 24px 48px -12px rgba(0, 0, 0, 0.3),
        0 0 0 1px rgba(255,255,255,0.06) inset,
        0 1px 0 0 rgba(255,255,255,0.08) inset`,
      overflow: "hidden",
      transition: MOTION.all,
      animation: `modalSlideIn ${MOTION.slow} forwards`
    },
    ".modal-content.fullscreen": {
      width: "100%",
      maxWidth: "100%",
      height: "100%",
      borderRadius: 0,
      border: "none",
      background: theme.vars.palette.background.default,
      animation: "none"
    },
    ".modal-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "1em",
      padding: "0.6em 1.1em",
      minHeight: "3.4em",
      position: "relative",
      background: `linear-gradient(90deg,
        rgba(${theme.vars.palette.background.defaultChannel} / 0.5) 0%,
        rgba(${theme.vars.palette.background.defaultChannel} / 0.15) 100%)`,
      zIndex: 5,
      "&::after": {
        content: "''",
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "1px",
        background: `linear-gradient(90deg,
          rgba(${theme.vars.palette.common.whiteChannel} / 0.08),
          rgba(${theme.vars.palette.common.whiteChannel} / 0.02) 60%,
          transparent 100%)`
      }
    },
    ".header-left": {
      display: "flex",
      alignItems: "center",
      gap: "0.8em",
      minWidth: 0,
      flex: 1
    },
    ".editor-icon-badge": {
      flexShrink: 0,
      width: "2.4em",
      height: "2.4em",
      borderRadius: BORDER_RADIUS.lg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.vars.palette.primary.main,
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
      border: `1px solid rgba(${theme.vars.palette.primary.mainChannel} / 0.25)`,
      svg: { fontSize: "var(--fontSizeBig)" }
    },
    ".title-and-description": {
      display: "flex",
      flexDirection: "column",
      gap: "0.1em",
      minWidth: 0,
      overflow: "hidden"
    },
    ".breadcrumb": {
      display: "flex",
      alignItems: "center",
      gap: "0.3em",
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      ".crumb-sep": {
        margin: "0 0.2em",
        opacity: 0.5
      },
      ".crumb-current": {
        color: theme.vars.palette.text.secondary
      }
    },
    ".title-row": {
      display: "flex",
      alignItems: "center",
      gap: "0.6em",
      minWidth: 0,
      h4: {
        cursor: "default",
        fontWeight: 600,
        margin: 0,
        fontSize: "var(--fontSizeBig)",
        letterSpacing: "-0.01em",
        color: theme.vars.palette.text.primary,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    },
    ".type-badge": {
      flexShrink: 0,
      padding: "0.1em 0.6em",
      borderRadius: BORDER_RADIUS.pill,
      fontSize: "var(--fontSizeSmaller)",
      fontFamily: theme.fontFamily2,
      letterSpacing: "0.03em",
      color: theme.vars.palette.text.secondary,
      backgroundColor: `rgba(${theme.vars.palette.common.whiteChannel} / 0.07)`,
      border: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.08)`
    },
    ".actions": {
      display: "flex",
      gap: "0.25em",
      alignItems: "center",
      flexWrap: "nowrap"
    },
    /* ---- unified toolbar ---- */
    ".modal-toolbar": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.5em",
      padding: "0.35em 1.1em",
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.3)`,
      borderBottom: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.04)`,
      flexWrap: "wrap",
      ".toolbar-side": {
        display: "flex",
        alignItems: "center",
        gap: "0.35em"
      },
      ".toolbar-divider": {
        width: "1px",
        height: "1.4em",
        margin: "0 0.25em",
        background: `rgba(${theme.vars.palette.common.whiteChannel} / 0.1)`
      }
    },
    ".lang-select": {
      appearance: "none",
      WebkitAppearance: "none",
      background: `rgba(${theme.vars.palette.background.paperChannel} / 0.5)`,
      color: theme.vars.palette.text.secondary,
      border: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.08)`,
      borderRadius: BORDER_RADIUS.md,
      padding: "0.3em 1.6em 0.3em 0.7em",
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      outline: "none",
      cursor: "pointer",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>\")",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 0.55em center",
      transition: MOTION.all,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        borderColor: `rgba(${theme.vars.palette.common.whiteChannel} / 0.18)`
      }
    },
    ".tool-btn": {
      display: "inline-flex",
      alignItems: "center",
      gap: "0.4em",
      padding: "0.32em 0.6em",
      cursor: "pointer",
      color: theme.vars.palette.text.secondary,
      borderRadius: BORDER_RADIUS.md,
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 500,
      background: "transparent",
      border: "1px solid transparent",
      transition: MOTION.all,
      whiteSpace: "nowrap",
      svg: { fontSize: "var(--fontSizeNormal)" },
      "&:hover": {
        color: theme.vars.palette.text.primary,
        background: `rgba(${theme.vars.palette.common.whiteChannel} / 0.06)`
      },
      "&.active": {
        color: theme.vars.palette.primary.main,
        background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.14)`,
        borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.35)`
      },
      "&.icon-only": {
        padding: "0.32em"
      }
    },
    ".font-controls": {
      display: "flex",
      alignItems: "center",
      gap: "0.15em",
      padding: "0.1em 0.25em",
      borderRadius: BORDER_RADIUS.md,
      border: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.07)`,
      background: `rgba(${theme.vars.palette.background.paperChannel} / 0.35)`,
      ".font-size-value": {
        minWidth: "2.6em",
        textAlign: "center",
        fontSize: "var(--fontSizeSmaller)",
        fontFamily: theme.fontFamily2,
        color: theme.vars.palette.text.secondary
      }
    },
    ".modal-body": {
      position: "relative",
      flex: 1,
      display: "flex",
      flexDirection: "row",
      padding: 0,
      background: "transparent",
      height: "100%",
      overflow: "hidden",
      ".editor": {
        flex: 1,
        width: "100%",
        fontSize: "var(--editor-font-size, var(--fontSizeNormal))",
        lineHeight: "1.7",
        color: theme.vars.palette.text.secondary,
        outline: "none",
        overflow: "auto !important",
        height: "100%",
        padding: "1.5em 2em 1.5em 3em",
        pre: {
          height: "100%",
          overflowWrap: "break-word",
          fontFamily:
            "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'SF Mono', Consolas, monospace",
          fontVariantLigatures: "common-ligatures"
        },
        textarea: {
          overflowWrap: "break-word",
          height: "100% !important",
          width: "100% !important",
          fontFamily: "inherit"
        },
        "&.word-wrap": {
          whiteSpace: "pre-wrap",
          pre: { whiteSpace: "pre-wrap !important" },
          textarea: { whiteSpace: "pre-wrap !important" }
        },
        "&.no-wrap": {
          whiteSpace: "pre",
          pre: { whiteSpace: "pre !important" },
          textarea: { whiteSpace: "pre !important" }
        },
        ...codeHighlightTokenStyles(theme)
      },
      /* highlighted {{ variable }} tokens inside Monaco */
      ".editor-variable-token": {
        color: `${theme.vars.palette.primary.light} !important`,
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
        borderRadius: BORDER_RADIUS.sm,
        fontWeight: 600
      },
      ".editor-pane": {
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.3)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`
      },
      ".assistant-pane": {
        width: "35%",
        minWidth: "320px",
        maxWidth: "500px",
        background: `linear-gradient(180deg,
          rgba(${theme.vars.palette.background.paperChannel} / 0.6) 0%,
          rgba(${theme.vars.palette.background.paperChannel} / 0.4) 100%)`,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        boxShadow: `-1px 0 0 rgba(${theme.vars.palette.common.whiteChannel} / 0.06),
          -12px 0 32px -8px rgba(0,0,0,0.12)`,
        position: "relative",
        ".assistant-header": {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5em",
          padding: "0.7em 0.85em",
          flexShrink: 0,
          borderBottom: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.05)`,
          ".assistant-id": {
            display: "flex",
            alignItems: "center",
            gap: "0.6em",
            minWidth: 0
          },
          ".assistant-avatar": {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "1.9em",
            height: "1.9em",
            borderRadius: BORDER_RADIUS.md,
            color: theme.vars.palette.primary.main,
            background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.14)`,
            svg: { fontSize: "var(--fontSizeNormal)" }
          },
          ".assistant-meta": {
            display: "flex",
            flexDirection: "column",
            lineHeight: 1.2,
            minWidth: 0
          },
          ".assistant-name": {
            fontSize: "var(--fontSizeSmall)",
            fontWeight: 600,
            color: theme.vars.palette.text.primary
          },
          ".assistant-sub": {
            fontSize: "var(--fontSizeSmaller)",
            color: theme.vars.palette.text.disabled,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          },
          ".assistant-head-actions": {
            display: "flex",
            gap: "0.15em",
            flexShrink: 0
          }
        },
        ".chat-view": {
          padding: `0 ${theme.spacing(SPACING.lg)} ${theme.spacing(
            SPACING.lg
          )} ${theme.spacing(SPACING.lg)} !important`,
          minHeight: 0,
          flex: 1
        },
        ".chat-thread-container": {
          paddingBottom: getSpacingPx(SPACING.md)
        },
        ".chat-input-section": {
          width: "100% !important",
          maxWidth: "100% !important",
          margin: "0 !important",
          padding: "0 !important"
        },
        ".chat-composer-wrapper": {
          width: "100% !important"
        }
      }
    },
    ".button": {
      padding: theme.spacing(SPACING.sm),
      minWidth: "32px",
      minHeight: "32px",
      cursor: "pointer",
      color: theme.vars.palette.text.secondary,
      borderRadius: BORDER_RADIUS.lg,
      fontSize: "var(--fontSizeNormal)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "transparent",
      border: "1px solid transparent",
      transition: MOTION.all,
      "&:hover": {
        color: theme.vars.palette.primary.main,
        background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
        boxShadow: `0 0 12px rgba(${theme.vars.palette.primary.mainChannel} / 0.15)`,
        transform: "scale(1.05)"
      },
      "&.active": {
        color: theme.vars.palette.primary.main,
        background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.16)`
      },
      "&:active": {
        transform: "scale(0.97)"
      }
    },
    ".button-close": {
      marginLeft: getSpacingPx(SPACING.xs), // was 3px
      border: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.08)`,
      "&:hover": {
        backgroundColor: theme.vars.palette.error.main,
        borderColor: theme.vars.palette.error.main,
        color: theme.vars.palette.common.white,
        boxShadow: `0 4px 16px rgba(${theme.vars.palette.error.mainChannel} / 0.4)`,
        transform: "scale(1.05)"
      }
    },
    ".button-ghost": {
      padding: getSpacingPx(SPACING.xs),
      cursor: "pointer",
      color: theme.vars.palette.grey[400],
      fontSize: "var(--fontSizeNormal)",
      borderRadius: BORDER_RADIUS.md,
      background: "transparent",
      border: "1px solid transparent",
      minWidth: "28px",
      minHeight: "28px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: MOTION.all,
      svg: { fontSize: "var(--fontSizeNormal)" },
      "&:hover": {
        color: theme.vars.palette.primary.light,
        background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.1)`
      }
    },
    ".resize-handle": {
      position: "relative",
      height: "18px",
      width: "100%",
      cursor: "row-resize",
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.6)`,
      borderTop: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.04)`,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      transition: MOTION.all,
      "&:hover": {
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.05)`
      },
      "&:hover .resize-handle-thumb": {
        backgroundColor: theme.vars.palette.primary.main,
        width: "72px",
        height: "4px",
        boxShadow: `0 0 12px rgba(${theme.vars.palette.primary.mainChannel} / 0.35)`
      }
    },
    ".resize-handle-thumb": {
      position: "absolute",
      width: "40px",
      height: "3px",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: `rgba(${theme.vars.palette.common.whiteChannel} / 0.15)`,
      borderRadius: BORDER_RADIUS.pill,
      transition: MOTION.all
    },
    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100%",
      animation: "pulseGlow 2s ease-in-out infinite"
    },
    "@media (max-width: 1200px)": {
      ".modal-content": { width: "96%" },
      ".assistant-pane": { width: "36%", minWidth: "280px" }
    },
    "@media (max-width: 900px)": {
      ".modal-body": { flexDirection: "column" },
      ".assistant-pane": {
        width: "100% !important",
        minWidth: "unset !important",
        maxWidth: "unset !important",
        borderLeft: "none",
        borderTop: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.06)`,
        height: "40%"
      }
    },
    "@media (max-width: 599.95px)": {
      ".modal-overlay": {
        top: 0,
        left: 0,
        width: "100vw",
        height: "100dvh",
        maxHeight: "100dvh",
        padding: 0,
        alignItems: "stretch"
      },
      ".modal-content, .modal-content.fullscreen": {
        width: "100vw",
        maxWidth: "100vw",
        height: "100dvh !important",
        maxHeight: "100dvh",
        margin: 0,
        borderRadius: 0,
        border: "none",
        animation: "none"
      },
      ".resize-handle": { display: "none" },
      ".breadcrumb": { display: "none" }
    }
  });

const TextEditorModal = ({
  value,
  onChange,
  onClose,
  propertyName,
  propertyDescription,
  propertyType,
  language: defaultLanguage = "",
  nodeType = "",
  readOnly = false,
  isLoading = false,
  showToolbar = true,
  showStatusBar = true,
  showFindReplace = true
}: TextEditorModalProps) => {
  const theme = useTheme();
  const modalOverlayRef = useRef<HTMLDivElement>(null);

  const {
    MonacoEditor,
    monacoLoadError,
    loadMonacoIfNeeded,
    monacoRef,
    monacoOnMount,
    handleMonacoFind,
    handleMonacoFormat
  } = useMonacoEditor();

  const { isCodeEditor, toggleEditorMode } = useEditorMode({
    defaultEnabled: !!defaultLanguage,
    onCodeEnabled: () => {
      void loadMonacoIfNeeded();
    }
  });

  const { isFullscreen, toggleFullscreen } = useFullscreenMode({
    storageKey: "textEditorModal_fullscreen"
  });

  const { assistantVisible, toggleAssistantVisible } = useAssistantVisibility({
    storageKey: "textEditorModal_assistantVisible",
    defaultVisible: true
  });

  const handleToggleEditorMode = useCallback(() => {
    toggleEditorMode();
  }, [toggleEditorMode]);

  useEffect(() => {
    if (isCodeEditor) {
      void loadMonacoIfNeeded();
    }
  }, [isCodeEditor, loadMonacoIfNeeded]);

  const { modalHeight, handleResizeMouseDown } = useModalResize({
    storageKey: "textEditorModal_height"
  });

  // EditorController requires these callbacks; the values themselves are no
  // longer surfaced in the redesigned toolbar (undo/redo stay on the keyboard).
  const [, setCanUndo] = useState(false);
  const [, setCanRedo] = useState(false);
  const [, setIsCodeBlock] = useState(false);
  const [wordWrapEnabled, setWordWrapEnabled] = useState(true);
  const [findReplaceVisible, setFindReplaceVisible] = useState(false);
  const [currentText, setCurrentText] = useState(value || "");
  const [language, setLanguage] = useState(
    defaultLanguage === "text" ? "plaintext" : defaultLanguage || "plaintext"
  );

  // Panels / view chrome
  const [variablesVisible, setVariablesVisible] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [addVarSignal, setAddVarSignal] = useState(0);

  // Per-variable preview values (local, not persisted to the graph).
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {}
  );

  // Font size (shared by both editors), persisted across sessions.
  const [fontSize, setFontSize] = useState<number>(() => {
    const stored = Number(localStorage.getItem("textEditorModal_fontSize"));
    return stored >= FONT_SIZE_MIN && stored <= FONT_SIZE_MAX ? stored : 14;
  });

  // Monaco instance lifecycle / cursor tracking.
  const [editorReady, setEditorReady] = useState(false);
  const [cursor, setCursor] = useState<{ line: number; column: number } | null>(
    null
  );
  const cursorDisposeRef = useRef<{ dispose: () => void } | null>(null);
  const decorationIdsRef = useRef<string[]>([]);

  // The value the modal opened with — used by "Revert".
  const originalValueRef = useRef(value);

  // Editor command function refs.
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

  const {
    status,
    progress,
    statusMessage,
    getCurrentMessagesSync,
    sendMessage,
    selectedModel,
    setSelectedModel,
    stopGeneration,
    createNewThread
  } = useChatIntegration({
    isCodeEditor,
    language,
    nodeType,
    monacoRef,
    getSelectedTextFnRef,
    replaceSelectionFnRef,
    setAllTextFnRef,
    insertTextFnRef,
    setCurrentText,
    currentText
  });

  const [searchResults, setSearchResults] = useState({
    currentMatch: 0,
    totalMatches: 0
  });

  const editorConfig = useMemo(
    () => ({ ...initialConfigTemplate, readOnly }),
    [readOnly]
  );

  const debouncedExternalOnChange = useMemo(
    () =>
      debounce((text: string) => {
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
      const textContent = editorState.read(() => $getRoot().getTextContent());
      setCurrentText(textContent);
      debouncedExternalOnChange(textContent);
    },
    [debouncedExternalOnChange, readOnly]
  );

  // ---- template variables ----
  const includeSingle = allowsSingleBraceVariables(language);
  const parsedVariables = useMemo(
    () => uniqueTemplateVariables(currentText, includeSingle),
    [currentText, includeSingle]
  );

  const handleSetVariableValue = useCallback((name: string, value: string) => {
    setVariableValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleDownload = useCallback(() => {
    const blob = new Blob([currentText || ""], {
      type: "text/plain;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const ext = (FILE_EXTENSIONS[language] || "txt").replace(/^\./, "");
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
        const model = editor.getModel();
        if (model) {
          const range = selection || model.getFullModelRange();
          editor.executeEdits("insert-from-chat", [
            { range, text, forceMoveMarkers: true }
          ]);
          editor.focus();
        }
      } else {
        insertIntoLexical(text);
      }
    },
    [isCodeEditor, insertIntoLexical, monacoRef]
  );

  const insertVariableToken = useCallback(
    (name: string, syntax: VariableSyntax) => {
      insertIntoEditor(formatVariableToken(name, syntax));
    },
    [insertIntoEditor]
  );

  const handleInsertVarClick = useCallback(() => {
    setVariablesVisible(true);
    setFocusMode(false);
    setAddVarSignal((n) => n + 1);
  }, []);

  const toggleVariables = useCallback(() => {
    setVariablesVisible((v) => {
      const next = !v;
      if (next) {
        setFocusMode(false);
      }
      return next;
    });
  }, []);

  const changeFontSize = useCallback((delta: number) => {
    setFontSize((prev) => {
      const next = Math.min(
        FONT_SIZE_MAX,
        Math.max(FONT_SIZE_MIN, Math.round((prev + delta) * 10) / 10)
      );
      localStorage.setItem("textEditorModal_fontSize", String(next));
      return next;
    });
  }, []);

  const handleRevert = useCallback(() => {
    const original = originalValueRef.current;
    setCurrentText(original);
    setAllTextFnRef.current?.(original);
    monacoRef.current?.setValue(original);
    debouncedExternalOnChange(original);
  }, [debouncedExternalOnChange, monacoRef]);

  const handleQuickStart = useCallback(
    (prompt: string) => {
      const message: Message = {
        type: "message",
        role: "user",
        name: "",
        content: [{ type: "text", text: prompt }],
        provider: selectedModel?.provider,
        model: selectedModel?.id
      };
      void sendMessage(message);
    },
    [sendMessage, selectedModel]
  );

  // Find/format dispatch to the active editor.
  const handleFindClick = useCallback(() => {
    if (isCodeEditor) {
      handleMonacoFind();
    } else {
      setFindReplaceVisible((v) => !v);
    }
  }, [isCodeEditor, handleMonacoFind]);

  const handleFormatClick = useCallback(() => {
    if (isCodeEditor) {
      handleMonacoFormat();
    } else {
      formatCodeBlockFnRef.current?.();
    }
  }, [isCodeEditor, handleMonacoFormat]);

  // Monaco mount: track cursor + signal readiness for decorations.
  const handleMonacoMount = useCallback(
    (editor: MonacoEditorNS.IStandaloneCodeEditor) => {
      monacoOnMount(editor);
      decorationIdsRef.current = [];
      cursorDisposeRef.current?.dispose();
      cursorDisposeRef.current = editor.onDidChangeCursorPosition((e) => {
        setCursor({ line: e.position.lineNumber, column: e.position.column });
      });
      const pos = editor.getPosition();
      if (pos) {
        setCursor({ line: pos.lineNumber, column: pos.column });
      }
      setEditorReady(true);
    },
    [monacoOnMount]
  );

  useEffect(() => () => cursorDisposeRef.current?.dispose(), []);

  // Highlight {{ variable }} tokens in Monaco.
  useEffect(() => {
    if (!isCodeEditor || !editorReady) {
      return;
    }
    const editor = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !model) {
      return;
    }
    const decorations = findTemplateVariables(currentText, includeSingle).map(
      (match) => {
        const start = model.getPositionAt(match.start);
        const end = model.getPositionAt(match.end);
        return {
          range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column
          },
          options: { inlineClassName: "editor-variable-token" }
        };
      }
    );
    decorationIdsRef.current = editor.deltaDecorations(
      decorationIdsRef.current,
      decorations
    );
  }, [isCodeEditor, editorReady, currentText, includeSingle, language, monacoRef]);

  useEffect(() => {
    return () => {
      debouncedExternalOnChange.cancel();
    };
  }, [debouncedExternalOnChange]);

  const { handleFind, handleReplace, handleNavigateNext, handleNavigatePrevious } =
    useEditorActions({
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

  const handleToggleWordWrap = useCallback(() => {
    setWordWrapEnabled((v) => !v);
  }, []);

  const handleToggleFind = useCallback(() => {
    setFindReplaceVisible((v) => !v);
  }, []);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === modalOverlayRef.current) {
      onClose();
    }
  };

  useCombo(["escape"], onClose);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  useEditorKeyboardShortcuts({
    onToggleFullscreen: toggleFullscreen,
    onToggleAssistant: toggleAssistantVisible,
    onToggleEditorMode: handleToggleEditorMode
  });

  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener("close-text-editor-modal", handler);
    return () => window.removeEventListener("close-text-editor-modal", handler);
  }, [onClose]);

  const breadcrumbItems = useMemo(() => {
    const nodeLabel = humanizeNodeType(nodeType);
    return [nodeLabel, "inputs", propertyName].filter(Boolean) as string[];
  }, [nodeType, propertyName]);

  const typeLabel = propertyType
    ? TYPE_LABELS[propertyType] ?? propertyType
    : null;
  const languageLabel = LANGUAGE_LABELS[language] ?? language;
  const showVariablesPanel = variablesVisible && !focusMode;
  const showAssistant = assistantVisible && !focusMode;

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
          style={
            {
              height: isFullscreen ? "100vh" : modalHeight,
              "--editor-font-size": `${fontSize}px`
            } as React.CSSProperties
          }
        >
          {/* ---- header ---- */}
          <div className="modal-header">
            <div className="header-left">
              <div className="editor-icon-badge">
                <DataObjectIcon />
              </div>
              <div className="title-and-description">
                <div className="breadcrumb">
                  {breadcrumbItems.map((seg, i) => (
                    <span key={`${seg}-${i}`} className="crumb">
                      {i > 0 && <span className="crumb-sep">/</span>}
                      <span
                        className={
                          i === breadcrumbItems.length - 1
                            ? "crumb-current"
                            : ""
                        }
                      >
                        {seg}
                      </span>
                    </span>
                  ))}
                </div>
                <div className="title-row">
                  {propertyDescription ? (
                    <Tooltip
                      delay={TOOLTIP_ENTER_DELAY}
                      title={propertyDescription}
                    >
                      <h4 className="title">{propertyName}</h4>
                    </Tooltip>
                  ) : (
                    <h4 className="title">{propertyName}</h4>
                  )}
                  {typeLabel && <span className="type-badge">{typeLabel}</span>}
                </div>
              </div>
            </div>
            <div className="actions">
              {!readOnly && (
                <Tooltip delay={TOOLTIP_ENTER_DELAY} title="Revert to original">
                  <button
                    type="button"
                    className="button"
                    onClick={handleRevert}
                    aria-label="Revert to original"
                  >
                    <HistoryIcon />
                  </button>
                </Tooltip>
              )}
              <Tooltip delay={TOOLTIP_ENTER_DELAY} title="Download">
                <button
                  type="button"
                  className="button"
                  onClick={handleDownload}
                  aria-label="Download"
                >
                  <DownloadIcon />
                </button>
              </Tooltip>
              <Tooltip
                delay={TOOLTIP_ENTER_DELAY}
                title={assistantVisible ? "Hide Assistant" : "Show Assistant"}
              >
                <button
                  type="button"
                  className={`button ${assistantVisible ? "active" : ""}`}
                  onClick={toggleAssistantVisible}
                  aria-label={
                    assistantVisible ? "Hide Assistant" : "Show Assistant"
                  }
                >
                  {assistantVisible ? (
                    <ChatBubbleIcon />
                  ) : (
                    <ChatBubbleOutlineIcon />
                  )}
                </button>
              </Tooltip>
              <Tooltip
                delay={TOOLTIP_ENTER_DELAY}
                title={focusMode ? "Exit focus mode" : "Focus mode (hide panels)"}
              >
                <button
                  type="button"
                  className={`button ${focusMode ? "active" : ""}`}
                  onClick={() => setFocusMode((v) => !v)}
                  aria-label={focusMode ? "Exit focus mode" : "Focus mode"}
                >
                  {focusMode ? <OpenInFullIcon /> : <CloseFullscreenIcon />}
                </button>
              </Tooltip>
              <Tooltip
                delay={TOOLTIP_ENTER_DELAY}
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                <button
                  type="button"
                  className="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </button>
              </Tooltip>
              <Tooltip delay={TOOLTIP_ENTER_DELAY} title="Close Editor | Esc">
                <button
                  type="button"
                  className="button button-close"
                  onClick={onClose}
                  aria-label="Close Editor"
                >
                  <CloseIcon />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* ---- toolbar ---- */}
          {showToolbar && (
            <div className="modal-toolbar">
              <div className="toolbar-side">
                {!readOnly && (
                  <Tooltip
                    delay={TOOLTIP_ENTER_DELAY}
                    title={
                      isCodeEditor
                        ? "Switch to Rich Text"
                        : "Switch to Code Editor"
                    }
                  >
                    <button
                      type="button"
                      className="tool-btn icon-only"
                      onClick={handleToggleEditorMode}
                      aria-label={
                        isCodeEditor
                          ? "Switch to Rich Text"
                          : "Switch to Code Editor"
                      }
                    >
                      {isCodeEditor ? <TextFieldsIcon /> : <CodeIcon />}
                    </button>
                  </Tooltip>
                )}
                <select
                  className="lang-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  aria-label="Language"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
                <span className="toolbar-divider" />
                <button
                  type="button"
                  className="tool-btn"
                  onClick={handleFindClick}
                >
                  <SearchIcon />
                  Find
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    className="tool-btn"
                    onClick={handleFormatClick}
                  >
                    <FormatAlignLeftIcon />
                    Format
                  </button>
                )}
                <button
                  type="button"
                  className={`tool-btn ${wordWrapEnabled ? "active" : ""}`}
                  onClick={handleToggleWordWrap}
                >
                  <WrapTextIcon />
                  Wrap
                </button>
                <span className="toolbar-divider" />
                <button
                  type="button"
                  className={`tool-btn ${showVariablesPanel ? "active" : ""}`}
                  onClick={toggleVariables}
                >
                  <DataObjectIcon />
                  Variables
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    className="tool-btn"
                    onClick={handleInsertVarClick}
                  >
                    <AddIcon />
                    Insert var
                  </button>
                )}
              </div>
              <div className="toolbar-side">
                <div className="font-controls">
                  <Tooltip delay={TOOLTIP_ENTER_DELAY} title="Decrease font size">
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => changeFontSize(-1)}
                      aria-label="Decrease font size"
                    >
                      <TextDecreaseIcon />
                    </button>
                  </Tooltip>
                  <span className="font-size-value">{fontSize}</span>
                  <Tooltip delay={TOOLTIP_ENTER_DELAY} title="Increase font size">
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => changeFontSize(1)}
                      aria-label="Increase font size"
                    >
                      <TextIncreaseIcon />
                    </button>
                  </Tooltip>
                </div>
                <CopyButton value={currentText} buttonSize="small" />
              </div>
            </div>
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
              <div className="loading-container">
                <LoadingSpinner />
              </div>
            ) : (
              <EditorInsertionProvider value={insertIntoEditor}>
                <div className="editor-pane">
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
                          onMount={handleMonacoMount}
                          options={{
                            readOnly,
                            fontSize,
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
                          <LoadingSpinner />
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
                            insertTextFnRef.current = fn;
                          }}
                          onReplaceSelectionCommand={(fn) => {
                            replaceSelectionFnRef.current = fn;
                          }}
                          onSetAllTextCommand={(fn) => {
                            setAllTextFnRef.current = fn;
                          }}
                          onGetSelectedTextCommand={(fn) => {
                            getSelectedTextFnRef.current = fn;
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
                {showAssistant && (
                  <div className="assistant-pane">
                    <div className="assistant-header">
                      <div className="assistant-id">
                        <span className="assistant-avatar">
                          <AutoAwesomeIcon />
                        </span>
                        <div className="assistant-meta">
                          <span className="assistant-name">Assistant</span>
                          <span className="assistant-sub">
                            writes &amp; edits this prompt
                          </span>
                        </div>
                      </div>
                      <div className="assistant-head-actions">
                        <Tooltip delay={TOOLTIP_ENTER_DELAY} title="New chat">
                          <button
                            type="button"
                            className="button-ghost"
                            onClick={() => void createNewThread()}
                            aria-label="New chat"
                          >
                            <AddIcon />
                          </button>
                        </Tooltip>
                        <Tooltip
                          delay={TOOLTIP_ENTER_DELAY}
                          title="Hide Assistant"
                        >
                          <button
                            type="button"
                            className="button-ghost"
                            onClick={toggleAssistantVisible}
                            aria-label="Hide Assistant"
                          >
                            <ChevronRightIcon />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                    <ChatView
                      status={status === "stopping" ? "loading" : status}
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
                      onModelChange={setSelectedModel}
                      helpMode={false}
                      workflowAssistant={true}
                      onStop={stopGeneration}
                      onNewChat={() => void createNewThread()}
                      onInsertCode={(text) => insertIntoEditor(text)}
                      composerPlaceholder="Ask the assistant to write or edit…"
                      noMessagesPlaceholder={
                        <AssistantQuickStarts
                          propertyName={propertyName}
                          onQuickStart={handleQuickStart}
                        />
                      }
                    />
                  </div>
                )}
              </EditorInsertionProvider>
            )}
          </div>

          {showVariablesPanel && (
            <EditorVariablesPanel
              variables={parsedVariables}
              values={variableValues}
              onSetValue={handleSetVariableValue}
              onInsert={insertVariableToken}
              addSignal={addVarSignal}
              readOnly={readOnly}
            />
          )}

          {showStatusBar && (
            <EditorStatusBar
              text={currentText}
              readOnly={readOnly}
              varCount={parsedVariables.length}
              languageLabel={languageLabel}
              cursor={isCodeEditor ? cursor : null}
            />
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
