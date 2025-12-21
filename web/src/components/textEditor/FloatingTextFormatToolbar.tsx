/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW
} from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import CodeIcon from "@mui/icons-material/Code";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button
} from "@mui/material";

const toolbarStyles = css`
  position: fixed;
  display: flex;
  gap: 2px;
  background: rgba(30, 30, 30, 0.95);
  padding: 4px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 9999;
  backdrop-filter: blur(10px);

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: transparent;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.15s ease;

    svg {
      font-size: 16px;
    }

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 1);
    }

    &.active {
      background: rgba(59, 130, 246, 0.3);
      color: #60a5fa;
    }
  }

  .divider {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.2);
    margin: 4px 2px;
  }
`;

function getDOMRangeRect(nativeSelection: Selection, rootElement: HTMLElement) {
  const domRange = nativeSelection.getRangeAt(0);

  let rect;

  if (nativeSelection.anchorNode === rootElement) {
    let inner: Element = rootElement;
    while (inner.firstElementChild != null) {
      inner = inner.firstElementChild;
    }
    rect = inner.getBoundingClientRect();
  } else {
    rect = domRange.getBoundingClientRect();
  }

  return rect;
}

export function FloatingTextFormatToolbar(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const [isText, setIsText] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const popupRef = useRef<HTMLDivElement | null>(null);

  const updatePopup = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      const nativeSelection = window.getSelection();
      const rootElement = editor.getRootElement();

      if (
        !$isRangeSelection(selection) ||
        !rootElement ||
        !nativeSelection ||
        nativeSelection.rangeCount === 0 ||
        rootElement.contains(nativeSelection.anchorNode) === false
      ) {
        setIsText(false);
        return;
      }

      const node = selection.anchor.getNode();

      // Update button states
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsCode(selection.hasFormat("code"));

      // Check if we're in a link
      const parent = node.getParent();
      setIsLink($isLinkNode(parent) || $isLinkNode(node));

      if (!selection.isCollapsed()) {
        const domRange = getDOMRangeRect(nativeSelection, rootElement);
        const popup = popupRef.current;

        if (popup) {
          // Use viewport coordinates since we're portaling to document.body
          const top = domRange.top - popup.offsetHeight - 8;
          const left =
            domRange.left + domRange.width / 2 - popup.offsetWidth / 2;

          popup.style.top = `${top}px`;
          popup.style.left = `${left}px`;
          setIsText(true);
        }
      } else {
        setIsText(false);
      }
    });
  }, [editor]);

  useEffect(() => {
    document.addEventListener("selectionchange", updatePopup);
    return () => {
      document.removeEventListener("selectionchange", updatePopup);
    };
  }, [updatePopup]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updatePopup();
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, updatePopup]);

  const insertLink = useCallback(() => {
    if (!isLink) {
      setLinkUrl("");
      setLinkDialogOpen(true);
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    }
  }, [editor, isLink]);

  const handleLinkSubmit = useCallback(() => {
    if (linkUrl) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, linkUrl);
    }
    setLinkDialogOpen(false);
    setLinkUrl("");
  }, [editor, linkUrl]);

  if (!isText) {
    return null;
  }

  return (
    <>
      {createPortal(
        <div ref={popupRef} css={toolbarStyles}>
          <button
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
            className={isBold ? "active" : ""}
            aria-label="Format Bold"
          >
            <FormatBoldIcon />
          </button>
          <button
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
            className={isItalic ? "active" : ""}
            aria-label="Format Italic"
          >
            <FormatItalicIcon />
          </button>
          <button
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}
            className={isUnderline ? "active" : ""}
            aria-label="Format Underline"
          >
            <FormatUnderlinedIcon />
          </button>
          <button
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
            }
            className={isStrikethrough ? "active" : ""}
            aria-label="Format Strikethrough"
          >
            <StrikethroughSIcon />
          </button>
          <button
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")}
            className={isCode ? "active" : ""}
            aria-label="Format Code"
          >
            <CodeIcon />
          </button>
          <div className="divider" />
          <button
            onClick={insertLink}
            className={isLink ? "active" : ""}
            aria-label={isLink ? "Remove Link" : "Insert Link"}
          >
            {isLink ? <LinkOffIcon /> : <LinkIcon />}
          </button>
        </div>,
        document.body
      )}
      <Dialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Insert Link</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="URL"
            type="url"
            fullWidth
            variant="outlined"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleLinkSubmit();
              }
            }}
            placeholder="https://example.com"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleLinkSubmit} variant="contained">
            Insert
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
