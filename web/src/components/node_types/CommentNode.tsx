/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState } from "react";
import {
  Node,
  NodeProps,
  NodeResizer
} from "@xyflow/react";
import { Box, TextField } from "@mui/material";
import isEqual from "lodash/isEqual";
import { NodeData } from "../../stores/NodeData";
import { hexToRgba } from "../../utils/ColorUtils";
import { useNodeFocusStore } from "../../stores/NodeFocusStore";

const MIN_NODE_WIDTH = 200;
const MIN_NODE_HEIGHT = 80;

const commentNodeStyles = (theme: Theme) =>
  css({
    "&.comment-node": {
      backgroundColor: theme.vars.palette.warning.light,
      backgroundImage: `linear-gradient(135deg, ${hexToRgba(theme.vars.palette.warning.main, 0.1)} 0%, ${hexToRgba(theme.vars.palette.warning.dark, 0.05)} 100%)`,
      border: `1px solid ${hexToRgba(theme.vars.palette.warning.dark, 0.3)}`,
      borderRadius: "var(--rounded-node)",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      fontFamily: "Inter, sans-serif",
      transition: "box-shadow 0.2s ease, transform 0.2s ease",
      "&:hover": {
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.2)"
      },
      "&.selected": {
        boxShadow: `0 0 0 2px ${theme.vars.palette.warning.main}, 0 4px 20px rgba(0, 0, 0, 0.25)`,
        borderColor: theme.vars.palette.warning.main
      },
      "&.focused": {
        outline: `2px dashed ${theme.vars.palette.warning.main}`,
        outlineOffset: "-2px"
      }
    },
    "& .comment-content": {
      padding: theme.spacing(1.5),
      height: "100%",
      display: "flex",
      flexDirection: "column",
      "& .comment-header": {
        display: "flex",
        alignItems: "center",
        gap: theme.spacing(0.5),
        marginBottom: theme.spacing(1),
        "& .comment-icon": {
          fontSize: "1rem",
          color: theme.vars.palette.warning.dark
        },
        "& .comment-title": {
          fontSize: "0.75rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: theme.vars.palette.warning.dark,
          opacity: 0.8
        }
      },
      "& .comment-textarea": {
        flex: 1,
        "& .MuiOutlinedInput-root": {
          backgroundColor: "rgba(255, 255, 255, 0.5)",
          borderRadius: "8px",
          fontSize: "0.875rem",
          lineHeight: 1.5,
          "& fieldset": {
            border: "none"
          },
          "&:hover fieldset": {
            border: `1px solid ${hexToRgba(theme.vars.palette.warning.dark, 0.2)}`
          },
          "&.Mui-focused fieldset": {
            border: `1px solid ${theme.vars.palette.warning.main}`
          },
          "& textarea": {
            resize: "none",
            minHeight: "60px"
          }
        }
      }
    }
  });

interface CommentNodeData extends NodeData {
  comment?: string;
  [key: string]: unknown;
}

type CommentNodeProps = NodeProps<Node<CommentNodeData>>;

const CommentNode: React.FC<CommentNodeProps> = ({ id, data, selected, dragging }) => {
  const theme = useTheme();
  const isFocused = useNodeFocusStore((state) => state.focusedNodeId === id);
  const [localComment, setLocalComment] = useState(data.comment || "");

  const handleCommentChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setLocalComment(newValue);
  }, []);

  const memoizedStyles = useMemo(() => commentNodeStyles(theme), [theme]);

  const nodeClassName = useMemo(() => {
    const classes = ["comment-node"];
    if (selected) {
      classes.push("selected");
    }
    if (isFocused) {
      classes.push("focused");
    }
    return classes.join(" ");
  }, [selected, isFocused]);

  return (
    <Box
      css={memoizedStyles}
      className={nodeClassName}
      sx={{
        width: "100%",
        height: "100%",
        minWidth: MIN_NODE_WIDTH,
        minHeight: MIN_NODE_HEIGHT
      }}
    >
      {selected && (
        <div className="node-resizer">
          <div className="resizer">
            <NodeResizer
              shouldResize={(event, params) => {
                const [dirX, dirY] = params.direction;
                return dirX !== 0 || dirY !== 0;
              }}
              minWidth={MIN_NODE_WIDTH}
              minHeight={MIN_NODE_HEIGHT}
            />
          </div>
        </div>
      )}
      <div className="comment-content">
        <div className="comment-header">
          <span className="comment-icon">📝</span>
          <span className="comment-title">Comment</span>
        </div>
        <TextField
          className="comment-textarea"
          multiline
          fullWidth
          variant="outlined"
          placeholder="Add your comment here..."
          value={localComment}
          onChange={handleCommentChange}
          size="small"
          sx={{
            "& .MuiOutlinedInput-root": {
              minHeight: dragging ? "60px" : "auto"
            }
          }}
        />
      </div>
      {isFocused && (
        <Box
          sx={{
            position: "absolute",
            top: -20,
            left: "50%",
            transform: "translateX(-50%)",
            bgcolor: theme.vars.palette.warning.main,
            color: theme.vars.palette.warning.contrastText,
            px: 1,
            py: 0.25,
            borderRadius: 1,
            fontSize: "0.7rem",
            fontWeight: "bold",
            zIndex: 1000,
            boxShadow: 2
          }}
        >
          FOCUSED
        </Box>
      )}
    </Box>
  );
};

export default memo(CommentNode, (prevProps, nextProps) => {
  const prevFocused = useNodeFocusStore.getState().focusedNodeId === prevProps.id;
  const nextFocused = useNodeFocusStore.getState().focusedNodeId === nextProps.id;
  return (
    prevProps.id === nextProps.id &&
    prevProps.type === nextProps.type &&
    prevProps.selected === nextProps.selected &&
    prevProps.dragging === nextProps.dragging &&
    prevFocused === nextFocused &&
    isEqual(prevProps.data.comment, nextProps.data.comment)
  );
});
