/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState, useRef, useEffect } from "react";
import { Box, IconButton, TextField, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import DoneIcon from "@mui/icons-material/Done";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

interface NodeCommentProps {
  comment: string | undefined;
  onChange: (comment: string) => void;
  onRemove: () => void;
}

const styles = (theme: Theme) =>
  css({
    width: "100%",
    backgroundColor: theme.vars.palette.background.paper,
    borderRadius: "0 0 var(--rounded-node) var(--rounded-node)",
    borderTop: `1px solid ${theme.vars.palette.divider}`,
    padding: "8px 12px",
    marginTop: "-1px",
    "& .comment-container": {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      width: "100%"
    },
    "& .comment-view": {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "8px",
      "& .comment-text": {
        flex: 1,
        fontSize: "var(--fontSizeSmall)",
        color: theme.vars.palette.text.secondary,
        lineHeight: 1.4,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word"
      },
      "& .comment-actions": {
        display: "flex",
        gap: "4px",
        opacity: 0,
        transition: "opacity 0.2s ease",
        "&.visible": {
          opacity: 1
        }
      },
      "&:hover .comment-actions": {
        opacity: 1
      }
    },
    "& .comment-edit": {
      width: "100%",
      "& .MuiOutlinedInput-root": {
        fontSize: "var(--fontSizeSmall)",
        backgroundColor: theme.vars.palette.action.hover
      }
    }
  });

const NodeComment: React.FC<NodeCommentProps> = memo(function NodeComment({
  comment,
  onChange,
  onRemove
}) {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment || "");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(comment || "");
  }, [comment]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditValue(comment || "");
    setIsEditing(false);
  }, [comment]);

  const handleSaveEdit = useCallback(() => {
    onChange(editValue.trim());
    setIsEditing(false);
  }, [editValue, onChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSaveEdit();
      }
      if (event.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit]
  );

  const handleRemove = useCallback(() => {
    setIsEditing(false);
    onRemove();
  }, [onRemove]);

  const displayText = comment || "";

  return (
    <Box ref={containerRef} css={styles(theme)} className="node-comment">
      {isEditing ? (
        <div className="comment-container">
          <TextField
            inputRef={inputRef}
            className="comment-edit"
            multiline
            minRows={1}
            maxRows={4}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            variant="outlined"
            size="small"
            placeholder="Add a note to this node..."
            fullWidth
          />
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Tooltip title="Cancel (Esc)">
              <IconButton size="small" onClick={handleCancelEdit}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Save (Enter)">
              <IconButton size="small" onClick={handleSaveEdit} color="primary">
                <DoneIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </div>
      ) : (
        <div className="comment-view">
          <div className="comment-text">
            {displayText || (
              <Box
                component="span"
                sx={{ color: "text.disabled", fontStyle: "italic" }}
              >
                Add a note...
              </Box>
            )}
          </div>
          <div className={`comment-actions ${displayText ? "visible" : ""}`}>
            {displayText ? (
              <Tooltip title="Edit comment">
                <IconButton size="small" onClick={handleStartEditing}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title="Add comment">
                <IconButton size="small" onClick={handleStartEditing}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Remove comment">
              <IconButton size="small" onClick={handleRemove}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        </div>
      )}
    </Box>
  );
});

export default NodeComment;
