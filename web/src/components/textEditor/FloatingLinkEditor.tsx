/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
  KEY_ESCAPE_COMMAND,
  COMMAND_PRIORITY_HIGH
} from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteIcon from "@mui/icons-material/Delete";

const linkEditorStyles = css`
  position: fixed;
  display: flex;
  gap: 4px;
  align-items: center;
  background: rgba(30, 30, 30, 0.95);
  padding: 8px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 9999;
  backdrop-filter: blur(10px);
  max-width: 400px;

  input {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    padding: 4px 8px;
    color: white;
    font-size: 13px;
    outline: none;
    min-width: 200px;

    &:focus {
      border-color: rgba(59, 130, 246, 0.5);
      background: rgba(255, 255, 255, 0.15);
    }
  }

  a {
    color: #60a5fa;
    text-decoration: none;
    font-size: 13px;
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover {
      text-decoration: underline;
    }
  }

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
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

    &.delete {
      color: rgba(239, 68, 68, 0.8);
      &:hover {
        background: rgba(239, 68, 68, 0.1);
        color: rgba(239, 68, 68, 1);
      }
    }
  }
`;

export function FloatingLinkEditor(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [editedLinkUrl, setEditedLinkUrl] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [lastSelection, setLastSelection] = useState<any>(null);

  const updateLinkEditor = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const node = selection.anchor.getNode();
      const linkNode = $findMatchingParent(node, $isLinkNode);

      if (linkNode) {
        setLinkUrl(linkNode.getURL());
        setEditedLinkUrl(linkNode.getURL());
      } else {
        setLinkUrl("");
      }

      const nativeSelection = window.getSelection();
      const rootElement = editor.getRootElement();

      if (
        nativeSelection !== null &&
        rootElement !== null &&
        rootElement.contains(nativeSelection.anchorNode) &&
        linkNode
      ) {
        const domRange = nativeSelection.getRangeAt(0);
        const rect = domRange.getBoundingClientRect();
        const editorElement = editorRef.current;

        if (editorElement) {
          // Use viewport coordinates since we're portaling to document.body
          const top = rect.bottom + 8;
          const left = rect.left;

          editorElement.style.top = `${top}px`;
          editorElement.style.left = `${left}px`;
          editorElement.style.opacity = "1";
        }
      } else if (editorRef.current) {
        editorRef.current.style.opacity = "0";
        setIsEditMode(false);
      }
    }

    setLastSelection(selection);
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateLinkEditor();
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, updateLinkEditor]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        if (isEditMode) {
          setIsEditMode(false);
          setEditedLinkUrl(linkUrl);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor, isEditMode, linkUrl]);

  useEffect(() => {
    editor.getEditorState().read(() => {
      updateLinkEditor();
    });
  }, [editor, updateLinkEditor]);

  useEffect(() => {
    if (isEditMode && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditMode]);

  const handleLinkSubmit = useCallback(() => {
    if (lastSelection !== null) {
      if (editedLinkUrl !== "") {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, editedLinkUrl);
      }
      setIsEditMode(false);
    }
  }, [lastSelection, editedLinkUrl, editor]);

  const handleLinkDelete = useCallback(() => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    setIsEditMode(false);
  }, [editor]);

  const handleCancelEdit = useCallback(() => {
    setIsEditMode(false);
    setEditedLinkUrl(linkUrl);
  }, [linkUrl]);

  const handleEditMode = useCallback(() => {
    setIsEditMode(true);
  }, []);

  const handleOpenLink = useCallback(() => {
    window.open(linkUrl, "_blank", "noopener,noreferrer");
  }, [linkUrl]);

  if (!linkUrl) {
    return null;
  }

  return createPortal(
    <div ref={editorRef} css={linkEditorStyles}>
      {isEditMode ? (
        <>
          <input
            ref={inputRef}
            type="text"
            value={editedLinkUrl}
            onChange={(e) => setEditedLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleLinkSubmit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                handleCancelEdit();
              }
            }}
          />
          <button onClick={handleLinkSubmit} aria-label="Confirm">
            <CheckIcon />
          </button>
          <button
            onClick={handleCancelEdit}
            aria-label="Cancel"
          >
            <CloseIcon />
          </button>
        </>
      ) : (
        <>
          <a href={linkUrl} target="_blank" rel="noopener noreferrer">
            {linkUrl}
          </a>
          <button onClick={handleEditMode} aria-label="Edit Link">
            <EditIcon />
          </button>
          <button
            onClick={handleOpenLink}
            aria-label="Open Link"
          >
            <OpenInNewIcon />
          </button>
          <button
            onClick={handleLinkDelete}
            className="delete"
            aria-label="Remove Link"
          >
            <DeleteIcon />
          </button>
        </>
      )}
    </div>,
    document.body
  );
}
