/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Box, IconButton, TextField, Typography } from "@mui/material";
import { memo, useCallback, useRef, useState } from "react";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import useNodeAnnotationStore from "../../stores/NodeAnnotationStore";
import { useNodes } from "../../contexts/NodeContext";

const annotationContainerStyle = css`
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  z-index: 10;
`;

const annotationBubbleStyle = css`
  background-color: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.7);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  max-width: 100%;
  word-wrap: break-word;
  position: relative;

  &.dark-mode {
    background-color: rgba(40, 40, 40, 0.95);
    border-color: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
  }
`;

const annotationEditStyle = css`
  background-color: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(25, 118, 210, 0.5);
  border-radius: 6px;
  padding: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);

  &.dark-mode {
    background-color: rgba(50, 50, 50, 0.98);
    border-color: rgba(100, 181, 246, 0.5);
  }
`;

const iconButtonStyle = css`
  position: absolute;
  top: -8px;
  right: -8px;
  width: 20px;
  height: 20px;
  min-width: 20px;

  &.edit-btn {
    right: auto;
    left: -8px;
    background-color: rgba(25, 118, 210, 0.9);
    color: white;

    &:hover {
      background-color: rgba(25, 118, 210, 1);
    }
  }

  &.close-btn {
    background-color: rgba(150, 150, 150, 0.9);
    color: white;

    &:hover {
      background-color: rgba(150, 150, 150, 1);
    }
  }

  &.save-btn {
    background-color: rgba(76, 175, 80, 0.9);
    color: white;

    &:hover {
      background-color: rgba(76, 175, 80, 1);
    }
  }

  & .MuiSvgIcon-root {
    font-size: 14px;
  }
`;

interface NodeAnnotationProps {
  nodeId: string;
  annotation: string | undefined;
  isSelected: boolean;
  isDarkMode: boolean;
}

const NodeAnnotation = memo(function NodeAnnotation({
  nodeId,
  annotation,
  isSelected,
  isDarkMode
}: NodeAnnotationProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(annotation || "");
  const inputRef = useRef<HTMLInputElement>(null);

  const { setAnnotationText } = useNodeAnnotationStore();

  const updateNodeData = useNodes((state) => state.updateNodeData);

  const handleSave = useCallback(() => {
    updateNodeData(nodeId, { annotation: editText });
    setAnnotationText(editText);
    setIsEditing(false);
  }, [nodeId, editText, updateNodeData, setAnnotationText]);

  const handleCancel = useCallback(() => {
    setEditText(annotation || "");
    setIsEditing(false);
  }, [annotation]);

  const handleEditClick = useCallback(() => {
    setEditText(annotation || "");
    setIsEditing(true);
  }, [annotation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  if (!isSelected && !annotation) {
    return null;
  }

  return (
    <div css={annotationContainerStyle}>
      {isEditing ? (
        <Box css={[annotationEditStyle, isDarkMode && "dark-mode"]}>
          <TextField
            inputRef={inputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            multiline
            minRows={1}
            maxRows={4}
            fullWidth
            size="small"
            placeholder="Add a note..."
            autoFocus
            sx={{
              "& .MuiOutlinedInput-root": {
                fontSize: "12px",
                padding: "4px 8px"
              }
            }}
          />
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 0.5,
              mt: 0.5
            }}
          >
            <IconButton
              css={[iconButtonStyle, "save-btn"]}
              onClick={handleSave}
              size="small"
            >
              <CheckIcon />
            </IconButton>
            <IconButton
              css={[iconButtonStyle, "close-btn"]}
              onClick={handleCancel}
              size="small"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      ) : (
        <Box css={[annotationBubbleStyle, isDarkMode && "dark-mode"]}>
          <Typography
            variant="body2"
            sx={{
              fontSize: "11px",
              lineHeight: 1.4,
              fontStyle: annotation?.startsWith("NOTE:") ? "italic" : "normal"
            }}
          >
            {annotation}
          </Typography>
          {isSelected && (
            <IconButton
              css={[iconButtonStyle, "edit-btn"]}
              onClick={handleEditClick}
              size="small"
              title="Edit annotation"
            >
              <EditIcon />
            </IconButton>
          )}
        </Box>
      )}
    </div>
  );
});

export default NodeAnnotation;
