/** @jsxImportSource @emotion/react */
import { memo, useCallback, useState, useRef, useEffect } from "react";
import {
  Handle,
  Position,
  NodeResizer,
  XYPosition,
} from "@xyflow/react";
import { Box, TextField, IconButton, Tooltip } from "@mui/material";
import { Delete, Edit, Check, Close } from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { NoteData } from "../../stores/NotesStore";
import { useNotesActions } from "../../stores/NotesStore";

export interface NoteNodeData extends NoteData {
  id: string;
  position: XYPosition;
}

type NoteNodeProps = {
  id: string;
  data: NoteNodeData;
  selected: boolean;
  type: string;
};

const NoteNode: React.FC<NoteNodeProps> = (props) => {
  const theme = useTheme();
  const { id, data, selected } = props;
  const { content, width, height, color } = data;

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [showButtons, setShowButtons] = useState(false);
  const textFieldRef = useRef<HTMLDivElement>(null);

  const { updateNote, deleteNote, selectNote } = useNotesActions();

  useEffect(() => {
    if (isEditing && textFieldRef.current) {
      const input = textFieldRef.current.querySelector("textarea");
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    if (editContent.trim() !== content.trim()) {
      updateNote(id, { content: editContent.trim() });
    }
    setIsEditing(false);
  }, [id, content, editContent, updateNote]);

  const handleCancel = useCallback(() => {
    setEditContent(content);
    setIsEditing(false);
  }, [content]);

  const handleDelete = useCallback(() => {
    deleteNote(id);
  }, [id, deleteNote]);

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSave();
      } else if (event.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  const handleSelect = useCallback(() => {
    selectNote(id);
  }, [id, selectNote]);

  const displayContent = content || "Double-click to add note...";

  return (
    <Box
      className={`note-node ${selected ? "selected" : ""}`}
      onMouseEnter={() => setShowButtons(true)}
      onMouseLeave={() => setShowButtons(false)}
      onClick={handleSelect}
      sx={{
        width,
        minHeight: height,
        backgroundColor: color,
        borderRadius: 1,
        boxShadow: selected
          ? `0 0 0 2px ${theme.vars.palette.primary.main}, 0 2px 8px rgba(0,0,0,0.3)`
          : "0 2px 4px rgba(0,0,0,0.15)",
        border: selected ? `1px solid ${theme.vars.palette.primary.main}` : "1px solid transparent",
        position: "relative",
        overflow: "hidden",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        "&:hover": {
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        },
      }}
    >
      {selected && (
        <NodeResizer
          minWidth={100}
          minHeight={60}
          isVisible={true}
          handleStyle={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: theme.vars.palette.primary.main,
            border: `1px solid ${theme.vars.palette.background.paper}`,
          }}
        />
      )}

      <Box
        sx={{
          padding: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {isEditing ? (
          <Box ref={textFieldRef} sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <TextField
              multiline
              fullWidth
              variant="standard"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your note..."
              sx={{
                flex: 1,
                "& .MuiInput-root": {
                  fontFamily: "Inter, sans-serif",
                  fontSize: "0.875rem",
                  lineHeight: 1.5,
                },
                "& .MuiInput-underline:before": {
                  borderBottom: "none",
                },
                "& .MuiInput-underline:after": {
                  borderBottom: "none",
                },
                "& .MuiInput-input": {
                  padding: 0,
                },
              }}
            />
            <Box
              sx={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 0.5,
                mt: 1,
              }}
            >
              <Tooltip title="Cancel (Esc)">
                <IconButton size="small" onClick={handleCancel}>
                  <Close fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Save (Enter)">
                <IconButton size="small" onClick={handleSave} color="primary">
                  <Check fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        ) : (
          <>
            <Box
              onDoubleClick={handleDoubleClick}
              sx={{
                flex: 1,
                fontFamily: "Inter, sans-serif",
                fontSize: "0.875rem",
                lineHeight: 1.5,
                color: theme.palette.mode === "dark" ? "rgba(0,0,0,0.87)" : "rgba(0,0,0,0.87)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                overflow: "auto",
                cursor: isEditing ? "text" : "grab",
                "&:empty:before": {
                  content: '""',
                  display: "inline-block",
                },
              }}
            >
              {displayContent}
            </Box>

            {selected && showButtons && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 0.5,
                  mt: 0.5,
                  pt: 0.5,
                  borderTop: `1px solid ${theme.palette.mode === "dark" ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.1)"}`,
                }}
              >
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => setIsEditing(true)}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton size="small" onClick={handleDelete} color="error">
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </>
        )}
      </Box>

      <Handle
        type="source"
        position={Position.Right}
        style={{ opacity: 0 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0 }}
      />
    </Box>
  );
};

export default memo(NoteNode, (prevProps, nextProps) => {
  const prevData = prevProps.data as NoteNodeData;
  const nextData = nextProps.data as NoteNodeData;
  return (
    prevProps.id === nextProps.id &&
    prevData.content === nextData.content &&
    prevData.width === nextData.width &&
    prevData.height === nextData.height &&
    prevData.color === nextData.color &&
    prevProps.selected === nextProps.selected
  );
});
