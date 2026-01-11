/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useMemo } from "react";
import {
  Box,
  TextField,
  Typography,
  IconButton,
  Tooltip,
  Paper
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import AddCommentIcon from "@mui/icons-material/AddComment";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useReactFlow, getViewportForBounds, getNodesBounds } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";
import { useCommentsStore, CommentItem } from "../../stores/CommentsStore";
import { useNodeMenuStore } from "../../stores/NodeMenuStore";
import { hexToRgba } from "../../utils/ColorUtils";

const containerStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    padding: "8px 10px 10px 10px",
    boxSizing: "border-box",
    gap: 8,
    ".search-container": {
      display: "flex",
      alignItems: "center",
      gap: 4
    },
    ".search-input": {
      flex: 1,
      "& .MuiOutlinedInput-root": {
        backgroundColor: theme.vars.palette.background.paper,
        fontSize: theme.fontSizeSmall
      },
      "& .MuiOutlinedInput-input": {
        padding: "8px 12px"
      }
    },
    ".header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 8,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".header-title": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontWeight: 600,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.secondary
    },
    ".comment-count": {
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      borderRadius: 12,
      padding: "2px 8px",
      fontSize: "11px",
      fontWeight: 600
    },
    ".add-button": {
      padding: 4,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".comments-list": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden",
      display: "flex",
      flexDirection: "column",
      gap: 8
    },
    ".comment-item": {
      display: "flex",
      flexDirection: "column",
      padding: 8,
      borderRadius: 6,
      cursor: "pointer",
      transition: "all 0.2s ease",
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        borderColor: theme.vars.palette.primary.main
      },
      "&.selected": {
        borderColor: theme.vars.palette.primary.main,
        backgroundColor: `${theme.vars.palette.primary.main}11`
      }
    },
    ".comment-header": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 4
    },
    ".comment-color": {
      width: 12,
      height: 12,
      borderRadius: 3,
      flexShrink: 0
    },
    ".comment-preview": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.4,
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 3,
      WebkitBoxOrient: "vertical"
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: theme.vars.palette.text.secondary,
      textAlign: "center",
      padding: 4
    },
    ".empty-icon": {
      fontSize: 48,
      marginBottom: 16,
      opacity: 0.5
    },
    ".empty-text": {
      fontSize: theme.fontSizeSmall,
      maxWidth: 200
    }
  });

const CommentsPanel: React.FC = () => {
  const theme = useTheme();
  const { getNodes, getViewport } = useReactFlow();
  const nodes = useNodes((state) => state.nodes);
  const { searchTerm, setSearchTerm, filterComments, buildCommentList } = useCommentsStore();
  const { openNodeMenu } = useNodeMenuStore();

  const comments = useMemo(() => buildCommentList(nodes), [nodes, buildCommentList]);
  const filteredComments = useMemo(
    () => filterComments(comments, searchTerm),
    [comments, searchTerm, filterComments]
  );

  const handleAddComment = useCallback(() => {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    openNodeMenu({
      x: centerX,
      y: centerY,
      searchTerm: "comment",
      centerOnScreen: true
    });
  }, [openNodeMenu]);

  const handleNavigateToComment = useCallback(
    (comment: CommentItem) => {
      const nodesToCenter = [comment.node];
      const nodesBounds = getNodesBounds(nodesToCenter);
      const viewport = getViewportForBounds(
        nodesBounds,
        window.innerWidth,
        window.innerHeight,
        0.5,
        0.5,
        2
      );

      const currentViewport = getViewport();
      const newViewport = {
        x: viewport.x,
        y: viewport.y,
        zoom: Math.min(viewport.zoom, currentViewport.zoom)
      };

      const { setViewport, fitView } = getNodes() as unknown as {
        setViewport: (v: { x: number; y: number; zoom: number }) => void;
        fitView: (options?: { nodes?: unknown[]; duration?: number }) => boolean;
      };

      setViewport(newViewport);

      setTimeout(() => {
        fitView({ nodes: [comment.node], duration: 200 });
      }, 50);
    },
    [getNodes, getViewport]
  );

  return (
    <Box css={containerStyles(theme)}>
      <Box className="header">
        <Box className="header-title">
          <span>Comments</span>
          {comments.length > 0 && (
            <span className="comment-count">{comments.length}</span>
          )}
        </Box>
        <Tooltip title="Add Comment">
          <IconButton
            className="add-button"
            size="small"
            onClick={handleAddComment}
            aria-label="Add comment"
          >
            <AddCommentIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box className="search-container">
        <TextField
          className="search-input"
          size="small"
          placeholder="Search comments..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: "text.secondary", mr: 1 }} />,
            endAdornment: searchTerm && (
              <IconButton size="small" onClick={() => setSearchTerm("")} aria-label="Clear search">
                <CloseIcon fontSize="small" />
              </IconButton>
            )
          }}
        />
      </Box>

      {filteredComments.length === 0 ? (
        <Box className="empty-state">
          {comments.length === 0 ? (
            <>
              <AddCommentIcon className="empty-icon" />
              <Typography className="empty-text">
                No comments yet. Add comments to annotate your workflow.
              </Typography>
              <IconButton
                onClick={handleAddComment}
                sx={{ mt: 2 }}
                aria-label="Add first comment"
              >
                <AddCommentIcon />
              </IconButton>
            </>
          ) : (
            <Typography className="empty-text">
              No comments match your search.
            </Typography>
          )}
        </Box>
      ) : (
        <Box className="comments-list">
          {filteredComments.map((comment) => (
            <Paper
              key={comment.id}
              className="comment-item"
              onClick={() => handleNavigateToComment(comment)}
              elevation={0}
            >
              <Box className="comment-header">
                <Box
                  className="comment-color"
                  sx={{ backgroundColor: hexToRgba(comment.color, 0.5) }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    fontWeight: 500
                  }}
                >
                  Comment
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Navigate to comment">
                  <IconButton size="small" sx={{ p: 0.5 }}>
                    <OpenInNewIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </Box>
              <Typography className="comment-preview">
                {comment.preview || "(Empty comment)"}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default CommentsPanel;
