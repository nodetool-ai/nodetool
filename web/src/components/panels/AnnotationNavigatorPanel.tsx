/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useState, useMemo, useCallback } from "react";
import {
  Box,
  TextField,
  List,
  ListItem,
  ListItemButton,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  InputAdornment
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import EditNoteIcon from "@mui/icons-material/EditNote";
import { useNodes } from "../../contexts/NodeContext";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";
import isEqual from "lodash/isEqual";

const COMMENT_NODE_TYPE = "nodetool.workflows.base_node.Comment";

interface Annotation {
  id: string;
  title: string;
  preview: string;
  color: string;
  position: { x: number; y: number };
}

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    overflow: "hidden",
    ".annotation-header": {
      padding: theme.spacing(1.5, 2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexShrink: 0
    },
    ".annotation-count": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      marginLeft: theme.spacing(1)
    },
    ".annotation-search": {
      padding: theme.spacing(1, 2),
      flexShrink: 0
    },
    ".annotation-search .MuiOutlinedInput-root": {
      fontSize: "0.875rem"
    },
    ".annotation-list": {
      flex: 1,
      overflow: "auto",
      padding: 0
    },
    ".annotation-item": {
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:last-child": {
        borderBottom: "none"
      },
      "&.selected": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },
    ".annotation-item-button": {
      padding: theme.spacing(1.5, 2),
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".annotation-preview": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      marginTop: theme.spacing(0.5),
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".annotation-color-dot": {
      width: "12px",
      height: "12px",
      borderRadius: "50%",
      flexShrink: 0,
      marginRight: theme.spacing(1.5)
    },
    ".annotation-empty": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      padding: theme.spacing(4),
      textAlign: "center",
      color: theme.vars.palette.text.secondary
    },
    ".annotation-empty-icon": {
      fontSize: "3rem",
      marginBottom: theme.spacing(2),
      opacity: 0.5
    }
  });

const extractAnnotationContent = (node: Node<NodeData>): string => {
  const comment = node.data.properties?.comment;
  if (typeof comment === "string") {
    return comment;
  }
  if (comment && typeof comment === "object") {
    const root = comment.root;
    if (root && root.children) {
      const extractText = (children: any[]): string => {
        return children
          .map((child) => {
            if (child.text) {
              return child.text;
            }
            if (child.children) {
              return extractText(child.children);
            }
            return "";
          })
          .join(" ");
      };
      return extractText(root.children);
    }
  }
  return "";
};

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength).trim() + "...";
};

const AnnotationNavigatorPanel: React.FC = () => {
  const theme = useTheme();
  const nodes = useNodes((state) => state.nodes);
  const setNodes = useNodes((state) => state.setNodes);
  const viewport = useNodes((state) => state.viewport);

  const [searchQuery, setSearchQuery] = useState("");

  const annotations = useMemo((): Annotation[] => {
    return nodes
      .filter((node): node is Node<NodeData> & { type: typeof COMMENT_NODE_TYPE } => {
        return node.type === COMMENT_NODE_TYPE;
      })
      .map((node) => {
        const content = extractAnnotationContent(node);
        const color =
          node.data.properties?.comment_color ||
          theme.vars.palette.c_bg_comment ||
          "#ffffff";
        const title = node.data.properties?.title || node.data.properties?.name || "Untitled Note";

        return {
          id: node.id,
          title: truncateText(title, 30),
          preview: truncateText(content, 60),
          color: color,
          position: node.position
        };
      });
  }, [nodes, theme]);

  const filteredAnnotations = useMemo(() => {
    if (!searchQuery.trim()) {
      return annotations;
    }
    const query = searchQuery.toLowerCase();
    return annotations.filter(
      (annotation) =>
        annotation.title.toLowerCase().includes(query) ||
        annotation.preview.toLowerCase().includes(query)
    );
  }, [annotations, searchQuery]);

  const handleNavigateToAnnotation = useCallback(
    (annotation: Annotation) => {
      const viewportZoom = viewport?.zoom ?? 1;

      setNodes((currentNodes) => {
        return currentNodes.map((node) => ({
          ...node,
          selected: node.id === annotation.id
        }));
      });

      const reactFlowElement = document.querySelector(".react-flow") as HTMLElement;
      if (reactFlowElement) {
        const flowElement = reactFlowElement.querySelector(".react-flow__viewport") as HTMLElement;
        if (flowElement) {
          const targetX = -(annotation.position.x * viewportZoom) + (window.innerWidth / 2 - 300);
          const targetY = -(annotation.position.y * viewportZoom) + (window.innerHeight / 2);
          flowElement.style.transform = `translate(${targetX}px, ${targetY}px) scale(${viewportZoom})`;
        }
      }
    },
    [viewport, setNodes]
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  return (
    <Box css={styles(theme)} className="annotation-navigator">
      <Box className="annotation-header">
        <Box display="flex" alignItems="center">
          <EditNoteIcon sx={{ fontSize: 20, marginRight: 1, color: "primary.main" }} />
          <Typography variant="subtitle2" fontWeight={600}>
            Annotations
          </Typography>
          <Chip
            label={filteredAnnotations.length}
            size="small"
            sx={{
              height: 20,
              fontSize: "0.7rem",
              marginLeft: 1,
              backgroundColor: "action.hover"
            }}
          />
        </Box>
        <Tooltip title="Clear search">
          <IconButton size="small" onClick={handleClearSearch} disabled={!searchQuery}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box className="annotation-search">
        <TextField
          fullWidth
          size="small"
          placeholder="Search annotations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            )
          }}
        />
      </Box>

      {filteredAnnotations.length === 0 ? (
        <Box className="annotation-empty">
          <EditNoteIcon className="annotation-empty-icon" />
          <Typography variant="body2" gutterBottom>
            {searchQuery ? "No annotations match your search" : "No annotations in this workflow"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Press C on the canvas to add a comment
          </Typography>
        </Box>
      ) : (
        <List className="annotation-list" disablePadding>
          {filteredAnnotations.map((annotation) => (
            <ListItem
              key={annotation.id}
              disablePadding
              className="annotation-item"
            >
              <ListItemButton
                className="annotation-item-button"
                onClick={() => handleNavigateToAnnotation(annotation)}
                selected={false}
              >
                <Box display="flex" alignItems="flex-start" width="100%">
                  <Box
                    className="annotation-color-dot"
                    style={{ backgroundColor: annotation.color }}
                  />
                  <Box flex={1} minWidth={0}>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Typography variant="body2" fontWeight={500} noWrap>
                        {annotation.title}
                      </Typography>
                      <Tooltip title="Go to annotation">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNavigateToAnnotation(annotation);
                          }}
                          sx={{ marginLeft: 1 }}
                        >
                          <LocationOnIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    {annotation.preview && (
                      <Typography variant="caption" className="annotation-preview">
                        {annotation.preview}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
};

export default memo(AnnotationNavigatorPanel, isEqual);
