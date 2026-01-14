/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useMemo, useState } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { Box, TextField, Typography, IconButton } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { useNodes } from "../../contexts/NodeContext";

export type AnnotationColor = 
  | "yellow" 
  | "green" 
  | "blue" 
  | "pink" 
  | "purple";

const ANNOTATION_COLORS: Record<AnnotationColor, { bg: string; border: string; text: string }> = {
  yellow: { bg: "#fff9c4", border: "#fbc02d", text: "#5d4037" },
  green: { bg: "#dcedc8", border: "#7cb342", text: "#33691e" },
  blue: { bg: "#e3f2fd", border: "#1e88e5", text: "#0d47a1" },
  pink: { bg: "#fce4ec", border: "#ec407a", text: "#880e4f" },
  purple: { bg: "#ede7f6", border: "#7e57c2", text: "#4a148c" },
};

const styles = (colors: { bg: string; border: string; text: string }, isSelected: boolean, isEditing: boolean) =>
  css({
    "&": {
      minWidth: "200px",
      minHeight: "120px",
      backgroundColor: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: "8px",
      boxShadow: isSelected 
        ? `0 4px 12px rgba(0,0,0,0.2), 0 0 0 2px ${colors.border}`
        : isEditing
          ? `0 4px 12px rgba(0,0,0,0.15)`
          : "0 2px 8px rgba(0,0,0,0.1)",
      transition: "box-shadow 0.2s ease",
      overflow: "hidden"
    },
    "&:hover": {
      boxShadow: `0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px ${colors.border}`
    },
    ".annotation-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "4px 8px",
      backgroundColor: `${colors.border}20`,
      borderBottom: `1px solid ${colors.border}40`,
      cursor: "grab"
    },
    ".annotation-header:active": {
      cursor: "grabbing"
    },
    ".drag-handle": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: colors.border,
      opacity: 0.7,
      transition: "opacity 0.2s",
      "&:hover": {
        opacity: 1
      }
    },
    ".annotation-actions": {
      display: "flex",
      gap: "2px"
    },
    ".action-button": {
      width: "20px",
      height: "20px",
      minWidth: "20px",
      padding: "2px",
      color: colors.border,
      "&:hover": {
        backgroundColor: `${colors.border}20`
      }
    },
    ".annotation-content": {
      padding: "12px",
      color: colors.text,
      minHeight: "60px"
    },
    ".annotation-text": {
      fontSize: "0.9rem",
      lineHeight: "1.4",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },
    ".edit-textfield": {
      "& .MuiOutlinedInput-root": {
        backgroundColor: "rgba(255,255,255,0.5)",
        fontSize: "0.9rem",
        lineHeight: "1.4",
        "& fieldset": {
          borderColor: `${colors.border}60`
        },
        "&:hover fieldset": {
          borderColor: colors.border
        },
        "&.Mui-focused fieldset": {
          borderColor: colors.border,
          borderWidth: "1px"
        }
      },
      "& .MuiInputBase-input": {
        padding: "8px"
      }
    }
  });

const AnnotationNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const { id, data, selected } = props;
  const annotationText = data.properties.annotation_text as string || "";
  const annotationColor = (data.properties.annotation_color as AnnotationColor) || "yellow";
  const isEditing = (data.properties.is_editing as boolean) === true;
  
  const updateNodeProperties = useNodes((state) => state.updateNodeProperties);
  const deleteNode = useNodes((state) => state.deleteNode);
  
  const [editText, setEditText] = useState(annotationText);
  
  const colors = useMemo(() => ANNOTATION_COLORS[annotationColor] || ANNOTATION_COLORS.yellow, [annotationColor]);
  
  const cssStyles = useMemo(() => styles(colors, selected, isEditing), [colors, selected, isEditing]);
  
  const handleStartEdit = useCallback(() => {
    setEditText(annotationText);
    updateNodeProperties(id, { is_editing: true });
  }, [id, annotationText, updateNodeProperties]);
  
  const handleSaveEdit = useCallback(() => {
    updateNodeProperties(id, { annotation_text: editText, is_editing: false });
  }, [id, editText, updateNodeProperties]);
  
  const handleCancelEdit = useCallback(() => {
    setEditText(annotationText);
    updateNodeProperties(id, { is_editing: false });
  }, [id, annotationText, updateNodeProperties]);
  
  const handleDelete = useCallback(() => {
    deleteNode(id);
  }, [id, deleteNode]);
  
  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setEditText(event.target.value);
  }, []);
  
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSaveEdit();
    } else if (event.key === "Escape") {
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);
  
  return (
    <Box css={cssStyles} className="annotation-node" data-testid="annotation-node">
      <Box className="annotation-header" data-testid="annotation-header">
        <Box className="drag-handle" data-testid="drag-handle">
          <DragIndicatorIcon sx={{ fontSize: 16 }} />
        </Box>
        <Box className="annotation-actions" data-testid="annotation-actions">
          {isEditing ? (
            <>
              <IconButton
                className="action-button"
                onClick={handleSaveEdit}
                size="small"
                data-testid="save-button"
              >
                <CheckIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton
                className="action-button"
                onClick={handleCancelEdit}
                size="small"
                data-testid="cancel-button"
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </>
          ) : (
            <>
              <IconButton
                className="action-button"
                onClick={handleStartEdit}
                size="small"
                data-testid="edit-button"
              >
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton
                className="action-button"
                onClick={handleDelete}
                size="small"
                data-testid="delete-button"
              >
                <DeleteIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </>
          )}
        </Box>
      </Box>
      <Box className="annotation-content" data-testid="annotation-content">
        {isEditing ? (
          <TextField
            className="edit-textfield"
            multiline
            fullWidth
            minRows={2}
            maxRows={6}
            value={editText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Add your annotation..."
            variant="outlined"
            size="small"
            autoFocus
            data-testid="annotation-textfield"
          />
        ) : (
          <Typography className="annotation-text" data-testid="annotation-text">
            {annotationText || <Typography component="span" sx={{ fontStyle: "italic", opacity: 0.6 }}>
              Click edit to add annotation...
            </Typography>}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default memo(AnnotationNode, (prevProps, nextProps) => {
  const prevData = prevProps.data;
  const nextData = nextProps.data;
  const prevAnnotationText = prevData.properties.annotation_text as string || "";
  const nextAnnotationText = nextData.properties.annotation_text as string || "";
  const prevAnnotationColor = (prevData.properties.annotation_color as AnnotationColor) || "yellow";
  const nextAnnotationColor = (nextData.properties.annotation_color as AnnotationColor) || "yellow";
  const prevIsEditing = (prevData.properties.is_editing as boolean) === true;
  const nextIsEditing = (nextData.properties.is_editing as boolean) === true;
  
  return (
    prevProps.id === nextProps.id &&
    prevProps.selected === nextProps.selected &&
    prevAnnotationText === nextAnnotationText &&
    prevAnnotationColor === nextAnnotationColor &&
    prevIsEditing === nextIsEditing &&
    prevData.properties.workflow_id === nextData.properties.workflow_id
  );
});
