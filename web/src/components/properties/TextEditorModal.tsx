/** @jsxImportSource @emotion/react */
import { css, useTheme } from "@emotion/react";

import ReactDOM from "react-dom";
import { useEffect, useRef } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { useHotkeys } from "react-hotkeys-hook";
import { useClipboard } from "../../hooks/browser/useClipboard";
import CloseIcon from "@mui/icons-material/Close";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import { Tooltip } from "@mui/material";
import ThemeNodes from "../themes/ThemeNodes";
import CircularProgress from "@mui/material/CircularProgress";

interface TextEditorModalProps {
  value: string;
  onChange?: (value: string) => void;
  onClose: () => void;
  propertyName: string;
  propertyDescription?: string;
  readOnly?: boolean;
  isLoading?: boolean;
}

const modalStyles = (theme: any) =>
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
      backgroundColor: theme.palette.c_gray1
    },
    ".modal-body textarea": {
      flex: 1,
      width: "100%",
      resize: "none",
      padding: ".5em",
      border: "none",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      lineHeight: "1.2",
      color: theme.palette.c_white,
      backgroundColor: theme.palette.c_gray2,
      paddingBottom: "4em",
      outline: "none"
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

export default function TextEditorModal({
  value,
  onChange,
  onClose,
  propertyName,
  propertyDescription,
  readOnly = false,
  isLoading = false
}: TextEditorModalProps) {
  const theme = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const { writeClipboard } = useClipboard();

  // Focus the textarea when the modal opens, but only if not loading
  useEffect(() => {
    if (textareaRef.current && !isLoading) {
      textareaRef.current.focus();
    }
  }, [isLoading]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === modalOverlayRef.current) {
      onClose();
    }
  };

  useHotkeys(
    "Escape",
    (event) => {
      event.preventDefault();
      onClose();
    },
    {
      enableOnFormTags: true
    }
  );

  const content = (
    <div css={modalStyles(theme)} className={readOnly ? "read-only" : ""}>
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
              <TextareaAutosize
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange && onChange(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                style={{ flex: 1, width: "100%" }}
                readOnly={readOnly}
              />
            )}
          </div>
          <div className="modal-footer"></div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}
