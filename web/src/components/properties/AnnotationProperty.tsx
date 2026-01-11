/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useState, useRef, useEffect, useMemo } from "react";
import { Box, TextField, IconButton, Tooltip } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import isEqual from "lodash/isEqual";

interface AnnotationPropertyProps {
  nodeId: string;
  annotation?: string;
  onAnnotationChange: (annotation: string) => void;
}

const styles = (theme: Theme) =>
  css({
    ".annotation-property": {
      width: "100%",
      padding: "8px 12px",
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "0 0 8px 8px"
    },
    ".annotation-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "8px"
    },
    ".annotation-title": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },
    ".annotation-indicator": {
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.primary.main
    },
    ".annotation-textarea": {
      width: "100%",
      "& .MuiInputBase-root": {
        backgroundColor: theme.vars.palette.background.default,
        borderRadius: "6px",
        fontSize: "var(--fontSizeSmall)",
        lineHeight: "1.4",
        "&:hover": {
          backgroundColor: theme.vars.palette.background.paper
        },
        "&.Mui-focused": {
          backgroundColor: theme.vars.palette.background.paper
        }
      },
      "& .MuiInputBase-input": {
        padding: "8px 12px",
        minHeight: "60px",
        resize: "vertical"
      }
    },
    ".annotation-actions": {
      display: "flex",
      gap: "4px",
      marginTop: "8px",
      justifyContent: "flex-end"
    },
    ".annotation-empty": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.disabled,
      fontStyle: "italic",
      padding: "8px 0"
    }
  });

const AnnotationProperty: React.FC<AnnotationPropertyProps> = ({
  nodeId: _nodeId,
  annotation = "",
  onAnnotationChange
}) => {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(annotation);
  const textareaRef = useRef<HTMLDivElement>(null);
  const memoizedStyles = useMemo(() => styles(theme), [theme]);

  useEffect(() => {
    setEditValue(annotation);
  }, [annotation]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current.querySelector("textarea");
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    onAnnotationChange(editValue);
    setIsEditing(false);
  }, [editValue, onAnnotationChange]);

  const handleCancel = useCallback(() => {
    setEditValue(annotation);
    setIsEditing(false);
  }, [annotation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  const hasAnnotation = annotation.trim().length > 0;

  return (
    <Box className="annotation-property" css={memoizedStyles}>
      <Box className="annotation-header">
        <Box className="annotation-title">
          <Box
            className="annotation-indicator"
            sx={{
              opacity: hasAnnotation ? 1 : 0.3,
              backgroundColor: hasAnnotation
                ? "primary.main"
                : "text.secondary"
            }}
          />
          Annotation
        </Box>
        {!isEditing && (
          <Tooltip title={hasAnnotation ? "Edit annotation" : "Add annotation"}>
            <IconButton
              size="small"
              onClick={() => setIsEditing(true)}
              sx={{ opacity: 0.7, "&:hover": { opacity: 1 } }}
            >
              {hasAnnotation ? (
                <EditIcon fontSize="small" />
              ) : (
                <EditIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {isEditing ? (
        <>
          <TextField
            ref={textareaRef}
            className="annotation-textarea"
            multiline
            minRows={2}
            maxRows={6}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a note to this node..."
            variant="outlined"
            size="small"
            fullWidth
          />
          <Box className="annotation-actions">
            <IconButton size="small" onClick={handleCancel} title="Cancel">
              <CloseIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleSave}
              title="Save (Ctrl+Enter)"
              sx={{
                color: "primary.main",
                "&:hover": {
                  backgroundColor: "action.selected"
                }
              }}
            >
              <CheckIcon fontSize="small" />
            </IconButton>
          </Box>
        </>
      ) : hasAnnotation ? (
        <Box
          sx={{
            fontSize: "var(--fontSizeSmall)",
            color: "text.primary",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}
        >
          {annotation}
        </Box>
      ) : (
        <Box className="annotation-empty">
          Click to add a note to this node...
        </Box>
      )}
    </Box>
  );
};

export default memo(AnnotationProperty, isEqual);
