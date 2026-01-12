/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState, useContext } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { Box, TextField, IconButton, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { NodeData } from "../../stores/NodeData";
import { NodeContext } from "../../contexts/NodeContext";
import { NodeStore } from "../../stores/NodeStore";

interface AnnotationNodeData extends Node<NodeData> {
  data: NodeData & {
    workflow_id?: string;
    annotation?: string;
    color?: string;
  };
}

const ANNOTATION_COLORS = [
  { name: "Yellow", bg: "rgba(255, 253, 208, 0.95)", border: "#d4a373" },
  { name: "Blue", bg: "rgba(219, 234, 254, 0.95)", border: "#60a5fa" },
  { name: "Green", bg: "rgba(220, 252, 231, 0.95)", border: "#4ade80" },
  { name: "Pink", bg: "rgba(252, 231, 243, 0.95)", border: "#f472b6" },
  { name: "Gray", bg: "rgba(243, 244, 246, 0.95)", border: "#9ca3af" }
];

const DEFAULT_COLOR_INDEX = 0;

const styles = (theme: Theme, colorIndex: number) =>
  css({
    "&": {
      minWidth: "200px",
      minHeight: "100px",
      borderRadius: "8px",
      border: `2px solid ${ANNOTATION_COLORS[colorIndex].border}`,
      backgroundColor: ANNOTATION_COLORS[colorIndex].bg,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
      transition: "box-shadow 0.2s ease"
    },
    "&:hover": {
      boxShadow: "0 6px 16px rgba(0, 0, 0, 0.15)"
    },
    "&.selected": {
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}, 0 6px 16px rgba(0, 0, 0, 0.15)`
    }
  });

const AnnotationNode = (props: NodeProps<AnnotationNodeData>) => {
  const theme = useTheme();
  const { id, selected, data } = props;
  const store = useContext(NodeContext) as NodeStore | null;

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(data.annotation || "");

  const colorIndex = useMemo(() => {
    const colorName = data.color?.toLowerCase();
    const index = ANNOTATION_COLORS.findIndex(
      (c) => c.name.toLowerCase() === colorName
    );
    return index >= 0 ? index : DEFAULT_COLOR_INDEX;
  }, [data.color]);

  const handleEditStart = useCallback(() => {
    setEditText(data.annotation || "");
    setIsEditing(true);
  }, [data.annotation]);

  const handleEditCancel = useCallback(() => {
    setEditText(data.annotation || "");
    setIsEditing(false);
  }, [data.annotation]);

  const handleEditSave = useCallback(() => {
    if (!store) {return;}
    const newAnnotation = editText.trim();
    const nodes = store.getState().nodes;
    const updatedNodes = nodes.map((node) => {
      if (node.id === id) {
        return {
          ...node,
          data: { ...node.data, annotation: newAnnotation }
        };
      }
      return node;
    });
    store.setState({ nodes: updatedNodes });
    setIsEditing(false);
  }, [id, editText, store]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleEditSave();
      } else if (event.key === "Escape") {
        handleEditCancel();
      }
    },
    [handleEditSave, handleEditCancel]
  );

  const nodeStyles = useMemo(() => styles(theme, colorIndex), [theme, colorIndex]);

  return (
    <Box
      css={nodeStyles}
      className={selected ? "selected" : ""}
      sx={{
        p: 1.5,
        display: "flex",
        flexDirection: "column",
        position: "relative"
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: "0.5px"
          }}
        >
          Note
        </Typography>
        {!isEditing && (
          <IconButton
            size="small"
            onClick={handleEditStart}
            sx={{
              opacity: selected ? 1 : 0,
              transition: "opacity 0.2s",
              "&:hover": { bgcolor: "action.hover" }
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {isEditing ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <TextField
            multiline
            minRows={3}
            maxRows={8}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add your annotation here..."
            variant="outlined"
            size="small"
            autoFocus
            sx={{
              "& .MuiOutlinedInput-root": {
                bgcolor: "background.paper",
                fontSize: "0.875rem"
              }
            }}
          />
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <IconButton
              size="small"
              onClick={handleEditCancel}
              color="inherit"
              sx={{ "&:hover": { bgcolor: "action.hover" } }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleEditSave}
              color="primary"
              sx={{ "&:hover": { bgcolor: "action.hover" } }}
            >
              <CheckIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      ) : (
        <Typography
          variant="body2"
          sx={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "text.primary",
            minHeight: "60px"
          }}
        >
          {data.annotation || (
            <Typography
              variant="body2"
              sx={{ color: "text.disabled", fontStyle: "italic" }}
            >
              Click to add a note...
            </Typography>
          )}
        </Typography>
      )}
    </Box>
  );
};

export default memo(AnnotationNode, (prevProps, nextProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.selected === nextProps.selected &&
    prevProps.data.annotation === nextProps.data.annotation &&
    prevProps.data.color === nextProps.data.color
  );
});
