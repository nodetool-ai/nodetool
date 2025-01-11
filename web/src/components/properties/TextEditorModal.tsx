/** @jsxImportSource @emotion/react */
import { css, useTheme } from "@emotion/react";

import ReactDOM from "react-dom";
import { memo, useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { useClipboard } from "../../hooks/browser/useClipboard";
import CloseIcon from "@mui/icons-material/Close";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { Tooltip } from "@mui/material";
import ThemeNodes from "../themes/ThemeNodes";
import CircularProgress from "@mui/material/CircularProgress";
import { useCombo } from "../../stores/KeyPressedStore";
import { isEqual } from "lodash";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import Editor from "react-simple-code-editor";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-css";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-bash";

const autodetectLanguage = (value: string) => {
  // Check for common language patterns
  if (!value) return "text";

  const lowerValue = value.toLowerCase();

  // Python indicators
  if (
    lowerValue.includes("def ") ||
    lowerValue.includes("import ") ||
    lowerValue.includes("class ") ||
    lowerValue.includes("print(") ||
    lowerValue.includes("self.") ||
    lowerValue.includes("__init__")
  ) {
    return "python";
  }

  // JSON indicators
  if (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
    try {
      JSON.parse(value);
      return "json";
    } catch (e) {
      // Not valid JSON, continue checking other formats
    }
  }

  // YAML indicators
  if (
    lowerValue.includes(": ") &&
    (lowerValue.includes("- ") || lowerValue.includes("---"))
  ) {
    return "yaml";
  }

  // Markdown indicators
  if (
    lowerValue.includes("# ") ||
    lowerValue.includes("## ") ||
    lowerValue.includes("**") ||
    lowerValue.includes("```")
  ) {
    return "markdown";
  }

  // CSS indicators
  if (
    lowerValue.includes("{") &&
    lowerValue.includes("}") &&
    (lowerValue.includes("px") ||
      lowerValue.includes("em") ||
      lowerValue.includes("rgb") ||
      lowerValue.includes("#"))
  ) {
    return "css";
  }

  // Bash/Shell indicators
  if (
    lowerValue.includes("#!/") ||
    lowerValue.includes("sudo ") ||
    lowerValue.includes("apt ") ||
    lowerValue.includes("chmod ")
  ) {
    return "bash";
  }

  // Default to JavaScript
  return "javascript";
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

const modalStyles = (
  theme: any,
  textareaHeight: number,
  textareaWidth: number
) =>
  css({
    ".modal-overlay": {
      position: "fixed",
      top: "50px",
      left: 0,
      width: "40vw",
      height: "calc(100vh - 50px)",
      backgroundColor: "rgba(0, 0, 0, 0.1)",
      zIndex: 10000,
      display: "flex",
      justifyContent: "flex-start",
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
      borderTop: ".7em solid " + theme.palette.c_black,
      borderRight: ".7em solid " + theme.palette.c_black,
      borderLeft: ".7em solid " + theme.palette.c_black
      // boxShadow: "2px 0 6px 0 rgba(0, 0, 0, 0.4)"
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
      whiteSpace: "pre",
      height: "100vh",
      "& pre": {
        height: "100vh",
        whiteSpace: "pre !important",
        wordWrap: "normal !important"
      },
      "& textarea": {
        whiteSpace: "pre !important",
        wordWrap: "normal !important",
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const { writeClipboard } = useClipboard();

  const [textareaHeight, setTextareaHeight] = useState(window.innerHeight);
  const [textareaWidth, setTextareaWidth] = useState(window.innerWidth * 0.4);

  useEffect(() => {
    if (textareaRef.current && !isLoading) {
      textareaRef.current.focus();
    }
  }, [isLoading]);

  useEffect(() => {
    const editor = document.querySelector(".simple-editor");
    if (editor) {
      const editorHeight = editor.scrollHeight;
      const editorWidth = editor.scrollWidth;
      setTextareaHeight(editorHeight);
      setTextareaWidth(editorWidth);
    }
  }, [value]);

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
              {propertyDescription}
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
              <Editor
                value={value}
                onValueChange={(code) => onChange && onChange(code)}
                highlight={(code) => {
                  const language = autodetectLanguage(code);
                  if (language === "text") {
                    return code;
                  }
                  return Prism.highlight(
                    code,
                    Prism.languages[language],
                    language
                  );
                }}
                textareaClassName="textarea"
                padding={10}
                className="editor simple-editor"
                readOnly={readOnly}
                style={{
                  fontFamily: "monospace",
                  minHeight: "100%"
                }}
              />
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
