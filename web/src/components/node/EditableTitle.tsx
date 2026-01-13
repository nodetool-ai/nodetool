/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

interface EditableTitleProps {
  nodeId: string;
  title: string;
}

// Subtle pulse animation for the connector
const pulseGlow = keyframes`
  0%, 100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
`;

// Fade in animation for the container
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

const EditableTitle = memo(function EditableTitle({
  nodeId,
  title
}: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const theme = useTheme();

  const styles = css({
    position: "absolute",
    top: "calc(100% + 12px)",
    left: "8px",
    right: "8px",
    width: "auto",
    minHeight: "2.5em",
    borderRadius: "12px",
    // Glass-morphism background with theme color
    background: theme.vars.palette.c_bg_comment,
    backdropFilter: theme.vars.palette.glass.blur,
    WebkitBackdropFilter: theme.vars.palette.glass.blur,
    display: "flex",
    flexDirection: "column",
    padding: "12px 16px",
    gap: 0,
    // Elegant border with theme divider
    border: `1px solid ${theme.vars.palette.divider}`,
    boxShadow: `
      0 4px 24px ${theme.vars.palette.c_black}66,
      0 1px 2px ${theme.vars.palette.c_black}33,
      inset 0 1px 0 ${theme.vars.palette.divider}
    `,
    zIndex: 10,
    animation: `${fadeSlideIn} 0.25s ease-out`,
    transition: "all 0.2s ease",
    cursor: "text",

    "&:hover": {
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      boxShadow: `
        0 8px 32px ${theme.vars.palette.c_black}80,
        0 2px 4px ${theme.vars.palette.c_black}4D,
        inset 0 1px 0 ${theme.vars.palette.divider}
      `,
      transform: "translateY(-1px)"
    },

    // Connector arrow pointing to the node
    "&::before": {
      content: '""',
      position: "absolute",
      top: "-8px",
      left: "24px",
      width: "16px",
      height: "16px",
      background: theme.vars.palette.c_bg_comment,
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      transform: "rotate(45deg)",
      borderRadius: "2px 0 0 0"
    },

    // Decorative accent line on left
    "&::after": {
      content: '""',
      position: "absolute",
      left: "0",
      top: "12px",
      bottom: "12px",
      width: "3px",
      background: `linear-gradient(
        180deg,
        ${theme.vars.palette.primary.main} 0%,
        ${theme.vars.palette.secondary.main} 100%
      )`,
      borderRadius: "0 3px 3px 0",
      opacity: 0.7,
      transition: "opacity 0.2s ease"
    },

    // Textarea styling
    "& textarea": {
      width: "100%",
      minHeight: "1.4em",
      border: "none",
      outline: "none",
      resize: "none",
      fontSize: "13px",
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

    // Header with icon
    ".comment-header": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      marginBottom: "6px",
      opacity: 0.5,
      fontSize: "10px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: theme.vars.palette.primary.light,
      transition: "opacity 0.2s ease",
      ".icon": {
        fontSize: "12px"
      }
    },

    "&:hover .comment-header": {
      opacity: 0.8
    },

    // Remove button styling
    ".remove-title": {
      position: "absolute",
      right: "8px",
      top: "8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "22px",
      height: "22px",
      color: theme.vars.palette.grey[500],
      backgroundColor: "transparent",
      border: "1px solid transparent",
      borderRadius: "6px",
      cursor: "pointer",
      padding: 0,
      margin: 0,
      opacity: 0,
      transform: "scale(0.9)",
      transition: "all 0.15s ease",
      ".icon": {
        fontSize: "14px"
      },
      "&:hover": {
        color: theme.vars.palette.error.main,
        backgroundColor: `${theme.vars.palette.error.main}1A`,
        border: `1px solid ${theme.vars.palette.error.main}4D`,
        transform: "scale(1)"
      }
    },

    "&:hover .remove-title": {
      opacity: 1,
      transform: "scale(1)"
    },

    // Title text styling
    ".title": {
      pointerEvents: "none",
      width: "100%",
      color: theme.vars.palette.text.secondary,
      fontSize: "13px",
      lineHeight: "1.5",
      fontWeight: 400,
      letterSpacing: "0.01em",
      wordBreak: "break-word",
      whiteSpace: "pre-wrap"
    },

    // Connector dot/indicator
    ".connector-dot": {
      position: "absolute",
      top: "-15px",
      left: "30px",
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      background: theme.vars.palette.primary.main,
      boxShadow: `0 0 8px ${theme.vars.palette.primary.main}`,
      animation: `${pulseGlow} 2s ease-in-out infinite`,
      opacity: 0.8
    }
  });

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      e.currentTarget.style.height = "auto";
      e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;

      if (e.key === "Enter" && !e.shiftKey) {
        updateNodeData(nodeId, { title: e.currentTarget.value });
        setIsEditing(false);
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    [nodeId, updateNodeData]
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    e.currentTarget.style.height = "auto";
    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
  }, []);

  const handleRemoveTitle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeData(nodeId, { title: "" });
  }, [nodeId, updateNodeData]);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      updateNodeData(nodeId, { title: e.currentTarget.value });
      setIsEditing(false);
    },
    [nodeId, updateNodeData]
  );

  return (
    <div
      className="title-container"
      css={styles}
      onDoubleClick={handleDoubleClick}
    >
      <div className="connector-dot" />
      <div className="comment-header">
        <ChatBubbleOutlineIcon className="icon" />
        <span>Comment</span>
      </div>
      {isEditing ? (
        <textarea
          defaultValue={title}
          autoFocus
          placeholder="Add a comment to document this node..."
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onBlur={handleBlur}
          style={{ overflow: "hidden", resize: "none" }}
        />
      ) : (
        <>
          <div className="title">{title}</div>
          <button
            className="remove-title"
            onClick={handleRemoveTitle}
            title="Remove comment"
          >
            <CloseIcon className="icon" />
          </button>
        </>
      )}
    </div>
  );
});

export default EditableTitle;
