/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useRef, useState, useEffect } from "react";
import { Box, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import {
  ANNOTATION_COLORS,
  Annotation,
  AnnotationColor,
  AnnotationColorInfo
} from "../../stores/AnnotationStore";

interface AnnotationNodeProps {
  annotation: Annotation;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Annotation>) => void;
  zoom: number;
}

const styles = (theme: Theme, isSelected: boolean, colorInfo: AnnotationColorInfo) =>
  css({
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    backgroundColor: colorInfo.bgColor,
    border: `2px solid ${isSelected ? theme.palette.primary.main : colorInfo.borderColor}`,
    borderRadius: "8px",
    boxShadow: isSelected
      ? `0 0 0 2px ${theme.palette.primary.main}, 0 4px 12px rgba(0, 0, 0, 0.15)`
      : "0 2px 8px rgba(0, 0, 0, 0.1)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    transition: "box-shadow 0.15s ease, border-color 0.15s ease",
    cursor: "grab",
    "&:active": {
      cursor: "grabbing"
    }
  });

const headerStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "4px 8px",
  backgroundColor: "rgba(0, 0, 0, 0.04)",
  borderBottom: "1px solid rgba(0, 0, 0, 0.08)"
});

const contentStyles = css({
  flex: 1,
  padding: "8px",
  overflow: "auto",
  display: "flex",
  flexDirection: "column"
});

const footerStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "4px 8px",
  backgroundColor: "rgba(0, 0, 0, 0.02)",
  borderTop: "1px solid rgba(0, 0, 0, 0.05)"
});

const AnnotationNode: React.FC<AnnotationNodeProps> = ({
  annotation,
  isSelected,
  onSelect,
  onDelete,
  onUpdate,
  zoom
}) => {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(annotation.text);
  const [isDragging, setIsDragging] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const colorInfo = ANNOTATION_COLORS.find((c) => c.id === annotation.color) || ANNOTATION_COLORS[0];

  useEffect(() => {
    if (!isEditing) {
      setEditText(annotation.text);
    }
  }, [annotation.text, isEditing]);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (isEditing) {
        return;
      }
      if (event.button === 0) {
        event.stopPropagation();
        onSelect();
        setIsDragging(true);
        const clientX = event.clientX;
        const clientY = event.clientY;
        dragStartRef.current = {
          x: clientX,
          y: clientY,
          startX: annotation.position.x,
          startY: annotation.position.y
        };
      }
    },
    [annotation.position.x, annotation.position.y, isEditing, onSelect]
  );

  useEffect(() => {
    if (!isDragging || !dragStartRef.current) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = (event.clientX - dragStartRef.current!.x) / zoom;
      const deltaY = (event.clientY - dragStartRef.current!.y) / zoom;
      onUpdate(annotation.id, {
        position: {
          x: dragStartRef.current!.startX + deltaX,
          y: dragStartRef.current!.startY + deltaY
        }
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, annotation.id, zoom, onUpdate]);

  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setEditText(event.target.value);
  }, []);

  const handleSaveText = useCallback(() => {
    onUpdate(annotation.id, { text: editText });
    setIsEditing(false);
  }, [annotation.id, editText, onUpdate]);

  const handleCancelEdit = useCallback(() => {
    setEditText(annotation.text);
    setIsEditing(false);
  }, [annotation.text]);

  const handleColorChange = useCallback(
    (color: AnnotationColor) => {
      onUpdate(annotation.id, { color });
    },
    [annotation.id, onUpdate]
  );

  const handleDelete = useCallback(() => {
    onDelete(annotation.id);
  }, [annotation.id, onDelete]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSaveText();
      } else if (event.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSaveText, handleCancelEdit]
  );

  return (
    <Box
      ref={nodeRef}
      onMouseDown={handleMouseDown}
      sx={{
        position: "absolute",
        left: annotation.position.x,
        top: annotation.position.y,
        width: annotation.width,
        height: annotation.height,
        transform: isDragging ? "scale(1.02)" : "scale(1)",
        transformOrigin: "top left",
        zIndex: isSelected ? 100 : 10
      }}
      css={styles(theme, isSelected, colorInfo)}
    >
      <Box css={headerStyles}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <DragIndicatorIcon sx={{ fontSize: "0.8rem", color: "text.secondary" }} />
          <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>
            {colorInfo.label} Note
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 0.25 }}>
          {ANNOTATION_COLORS.map((color) => (
            <Tooltip key={color.id} title={color.label} placement="top" arrow>
              <Box
                onClick={(e) => {
                  e.stopPropagation();
                  handleColorChange(color.id);
                }}
                sx={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  backgroundColor: color.bgColor,
                  border: `1px solid ${color.borderColor}`,
                  cursor: "pointer",
                  opacity: annotation.color === color.id ? 1 : 0.5,
                  transition: "opacity 0.15s ease",
                  "&:hover": {
                    opacity: 1
                  }
                }}
              />
            </Tooltip>
          ))}
        </Box>
      </Box>

      <Box css={contentStyles}>
        {isEditing ? (
          <TextField
            multiline
            fullWidth
            variant="standard"
            value={editText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder="Add your note..."
            sx={{
              flex: 1,
              "& .MuiInput-input": {
                fontSize: "0.875rem",
                lineHeight: 1.5
              }
            }}
          />
        ) : (
          <Typography
            variant="body2"
            sx={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "text.primary",
              fontSize: "0.875rem"
            }}
          >
            {annotation.text || (
              <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic" }}>
                Click to add a note...
              </Typography>
            )}
          </Typography>
        )}
      </Box>

      <Box css={footerStyles}>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title={isEditing ? "Save (Enter)" : "Edit"} placement="top" arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                if (isEditing) {
                  handleSaveText();
                } else {
                  setIsEditing(true);
                }
              }}
              sx={{ padding: "4px" }}
            >
              {isEditing ? <CheckIcon sx={{ fontSize: "1rem" }} /> : <EditIcon sx={{ fontSize: "1rem" }} />}
            </IconButton>
          </Tooltip>
          {isEditing && (
            <Tooltip title="Cancel (Esc)" placement="top" arrow>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancelEdit();
                }}
                sx={{ padding: "4px" }}
              >
                <CloseIcon sx={{ fontSize: "1rem" }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <Tooltip title="Delete" placement="top" arrow>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            sx={{ padding: "4px", color: "error.main" }}
          >
            <DeleteIcon sx={{ fontSize: "1rem" }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default memo(AnnotationNode);
