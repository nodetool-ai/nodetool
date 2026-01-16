/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import NotesIcon from "@mui/icons-material/Notes";

interface EditableNotesProps {
  nodeId: string;
  notes: string;
}

const fadeSlideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const EditableNotes = memo(function EditableNotes({
  nodeId,
  notes
}: EditableNotesProps) {
  const [isEditing, setIsEditing] = useState(false);
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const theme = useTheme();

  const styles = css({
    position: "absolute",
    top: "calc(100% + 8px)",
    left: "8px",
    right: "8px",
    width: "auto",
    minHeight: "2.5em",
    borderRadius: "8px",
    background: theme.vars.palette.c_bg_comment,
    backdropFilter: theme.vars.palette.glass.blur,
    WebkitBackdropFilter: theme.vars.palette.glass.blur,
    display: "flex",
    flexDirection: "column",
    padding: "10px 12px",
    gap: 0,
    border: `1px solid ${theme.vars.palette.divider}`,
    boxShadow: `
      0 4px 16px ${theme.vars.palette.c_black}40,
      0 1px 2px ${theme.vars.palette.c_black}20
    `,
    zIndex: 10,
    animation: `${fadeSlideIn} 0.2s ease-out`,
    cursor: "text",

    "&:hover": {
      border: `1px solid ${theme.vars.palette.grey[600]}`
    },

    "&::before": {
      content: '""',
      position: "absolute",
      top: "-6px",
      left: "20px",
      width: "12px",
      height: "12px",
      background: theme.vars.palette.c_bg_comment,
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      transform: "rotate(45deg)",
      borderRadius: "2px 0 0 0"
    },

    "&::after": {
      content: '""',
      position: "absolute",
      left: "0",
      top: "10px",
      bottom: "10px",
      width: "2px",
      background: theme.vars.palette.warning.main,
      borderRadius: "0 2px 2px 0",
      opacity: 0.6
    },

    "& textarea": {
      width: "100%",
      minHeight: "1.4em",
      border: "none",
      outline: "none",
      resize: "none",
      fontSize: "12px",
      lineHeight: "1.5",
      fontWeight: 400,
      letterSpacing: "0.01em",
      color: theme.vars.palette.text.primary,
      backgroundColor: "transparent",
      fontFamily: "inherit",
      padding: "0",
      "&::placeholder": {
        color: theme.vars.palette.text.disabled,
        fontStyle: "italic"
      }
    },

    ".notes-header": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      marginBottom: "4px",
      opacity: 0.6,
      fontSize: "9px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: theme.vars.palette.warning.light,
      ".icon": {
        fontSize: "12px"
      }
    },

    "&:hover .notes-header": {
      opacity: 0.8
    },

    ".remove-notes": {
      position: "absolute",
      right: "6px",
      top: "6px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "18px",
      height: "18px",
      color: theme.vars.palette.grey[500],
      backgroundColor: "transparent",
      border: "1px solid transparent",
      borderRadius: "4px",
      cursor: "pointer",
      padding: 0,
      margin: 0,
      opacity: 0,
      transform: "scale(0.9)",
      transition: "all 0.15s ease",
      ".icon": {
        fontSize: "12px"
      },
      "&:hover": {
        color: theme.vars.palette.error.main,
        backgroundColor: `${theme.vars.palette.error.main}1A`,
        border: `1px solid ${theme.vars.palette.error.main}4D`,
        transform: "scale(1)"
      }
    },

    "&:hover .remove-notes": {
      opacity: 1,
      transform: "scale(1)"
    },

    ".notes-content": {
      pointerEvents: "none",
      width: "100%",
      color: theme.vars.palette.text.secondary,
      fontSize: "12px",
      lineHeight: "1.5",
      fontWeight: 400,
      letterSpacing: "0.01em",
      wordBreak: "break-word",
      whiteSpace: "pre-wrap"
    }
  });

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      e.currentTarget.style.height = "auto";
      e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;

      if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    []
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    e.currentTarget.style.height = "auto";
    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
  }, []);

  const handleRemoveNotes = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      updateNodeData(nodeId, { notes: "" });
    },
    [nodeId, updateNodeData]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      const value = e.currentTarget.value.trim();
      if (value) {
        updateNodeData(nodeId, { notes: value });
      } else {
        updateNodeData(nodeId, { notes: "" });
      }
      setIsEditing(false);
    },
    [nodeId, updateNodeData]
  );

  return (
    <div
      className="notes-container"
      css={styles}
      onDoubleClick={handleDoubleClick}
    >
      <div className="notes-header">
        <NotesIcon className="icon" />
        <span>Notes</span>
      </div>
      {isEditing ? (
        <textarea
          defaultValue={notes}
          autoFocus
          placeholder="Add your notes..."
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onBlur={handleBlur}
          style={{ overflow: "hidden", resize: "none" }}
        />
      ) : (
        <>
          <div className="notes-content">
            {notes || "Double-click to add notes..."}
          </div>
          {notes && (
            <button
              className="remove-notes"
              onClick={handleRemoveNotes}
              title="Remove notes"
            >
              <CloseIcon className="icon" />
            </button>
          )}
        </>
      )}
    </div>
  );
});

export default EditableNotes;
