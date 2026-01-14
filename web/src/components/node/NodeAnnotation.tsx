/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { memo, useCallback, useState, useRef, useEffect } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionIcon from "@mui/icons-material/Description";
import { Box, IconButton, Tooltip } from "@mui/material";

interface NodeAnnotationProps {
  nodeId: string;
  annotation?: string;
}

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const styles = (theme: Theme, isExpanded: boolean) =>
  css({
    width: "100%",
    backgroundColor: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: "0 0 8px 8px",
    marginTop: "-1px",
    overflow: "hidden",
    animation: `${fadeIn} 0.2s ease-out`,
    transition: "max-height 0.3s ease-in-out",
    maxHeight: isExpanded ? "300px" : "36px",

    ".annotation-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 10px",
      minHeight: "36px",
      backgroundColor: theme.vars.palette.action.hover,
      cursor: "pointer",
      userSelect: "none",

      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },

    ".annotation-title": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: theme.vars.palette.text.secondary,

      ".icon": {
        fontSize: "14px",
        color: theme.vars.palette.text.disabled
      }
    },

    ".annotation-actions": {
      display: "flex",
      alignItems: "center",
      gap: "2px"
    },

    ".annotation-content": {
      padding: "10px 12px",
      maxHeight: "250px",
      overflow: "auto",
      fontSize: "13px",
      lineHeight: "1.5",
      color: theme.vars.palette.text.primary,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },

    ".annotation-editor": {
      padding: "10px 12px",

      textarea: {
        width: "100%",
        minHeight: "60px",
        maxHeight: "200px",
        padding: "8px",
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: "4px",
        fontSize: "13px",
        lineHeight: "1.5",
        fontFamily: "inherit",
        resize: "vertical",
        outline: "none",
        backgroundColor: theme.vars.palette.background.default,
        color: theme.vars.palette.text.primary,

        "&:focus": {
          borderColor: theme.vars.palette.primary.main
        }
      }
    },

    ".annotation-editor-actions": {
      display: "flex",
      justifyContent: "flex-end",
      gap: "8px",
      marginTop: "8px",

      button: {
        fontSize: "12px",
        padding: "4px 12px",
        minHeight: "28px"
      }
    },

    ".empty-annotation": {
      color: theme.vars.palette.text.disabled,
      fontStyle: "italic",
      fontSize: "12px"
    }
  });

const NodeAnnotation: React.FC<NodeAnnotationProps> = ({
  nodeId,
  annotation
}) => {
  if (annotation === undefined) {
    return null;
  }

  const theme = useTheme();
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(annotation || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(annotation || "");
  }, [annotation]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
    if (isEditing) {
      setIsEditing(false);
      setEditValue(annotation || "");
    }
  }, [isEditing, annotation]);

  const handleStartEditing = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(true);
    setIsEditing(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(annotation || "");
  }, [annotation]);

  const handleSaveAnnotation = useCallback(() => {
    if (nodeId) {
      updateNodeData(nodeId, { annotation: editValue.trim() });
    }
    setIsEditing(false);
  }, [nodeId, editValue, updateNodeData]);

  const handleRemoveAnnotation = useCallback(() => {
    if (nodeId) {
      updateNodeData(nodeId, { annotation: undefined });
    }
    setIsExpanded(false);
    setIsEditing(false);
  }, [nodeId, updateNodeData]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSaveAnnotation();
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSaveAnnotation, handleCancelEdit]
  );

  const hasAnnotation = annotation && annotation.trim().length > 0;

  return (
    <Box css={styles(theme, isExpanded)}>
      <div className="annotation-header" onClick={handleToggleExpand}>
        <div className="annotation-title">
          <DescriptionIcon className="icon" />
          <span>Annotation</span>
        </div>
        <div className="annotation-actions">
          {hasAnnotation && !isEditing && (
            <Tooltip title={isExpanded ? "Collapse" : "Expand"}>
              <span onClick={(e) => e.stopPropagation()}>
                <IconButton size="small" sx={{ width: 20, height: 20 }}>
                  {isExpanded ? (
                    <ExpandLessIcon sx={{ fontSize: 14 }} />
                  ) : (
                    <ExpandMoreIcon sx={{ fontSize: 14 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}
          {hasAnnotation && !isEditing && (
            <Tooltip title="Edit annotation">
              <span onClick={handleStartEditing}>
                <IconButton size="small" sx={{ width: 20, height: 20 }}>
                  <EditIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </span>
            </Tooltip>
          )}
          {hasAnnotation && !isEditing && (
            <Tooltip title="Remove annotation">
              <span onClick={(e) => { e.stopPropagation(); handleRemoveAnnotation(); }}>
                <IconButton size="small" sx={{ width: 20, height: 20, color: "error.main" }}>
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </div>
      </div>

      {isExpanded && (
        <>
          {isEditing ? (
            <div className="annotation-editor">
              <textarea
                ref={textareaRef}
                value={editValue}
                onChange={(e) => setEditValue(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add your annotation..."
              />
              <div className="annotation-editor-actions">
                <button
                  className="cancel-btn"
                  onClick={handleCancelEdit}
                  style={{
                    backgroundColor: "transparent",
                    border: `1px solid ${theme.vars.palette.divider}`,
                    borderRadius: "4px",
                    cursor: "pointer",
                    color: theme.vars.palette.text.secondary
                  }}
                >
                  Cancel
                </button>
                <button
                  className="save-btn"
                  onClick={handleSaveAnnotation}
                  style={{
                    backgroundColor: theme.vars.palette.primary.main,
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    color: theme.vars.palette.primary.contrastText
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : hasAnnotation ? (
            <div className="annotation-content" data-testid="annotation-content">{annotation}</div>
          ) : (
            <div className="annotation-content">
              <span className="empty-annotation">No annotation - click edit to add one</span>
            </div>
          )}
        </>
      )}
    </Box>
  );
};

export default memo(NodeAnnotation);
