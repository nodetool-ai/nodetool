/** @jsxImportSource @emotion/react */
import { useCallback, useState, useMemo } from "react";
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  IconButton,
  TextField,
  InputAdornment,
  Tooltip,
  Divider
} from "@mui/material";
import {
  Bookmark,
  BookmarkBorder,
  ContentCopy,
  Delete,
  Search,
  ExpandMore,
  ExpandLess
} from "@mui/icons-material";
import useSnippetStore, { Snippet } from "../../stores/SnippetStore";
import { useNodes } from "../../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import { uuidv4 } from "../../stores/uuidv4";

interface SnippetBrowserProps {
  onInsertSnippet?: (snippet: Snippet) => void;
}

const containerStyle = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden"
};

const searchStyle = {
  p: 1,
  borderBottom: 1,
  borderColor: "divider"
};

const listStyle = {
  flex: 1,
  overflow: "auto",
  py: 0
};

const emptyStateStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  p: 3,
  textAlign: "center"
};

const snippetItemStyle = (isExpanded: boolean) => ({
  bgcolor: isExpanded ? "action.selected" : "transparent",
  "&:hover": {
    bgcolor: "action.hover"
  }
});

const snippetContentStyle = {
  display: "flex",
  flexDirection: "column",
  overflow: "hidden"
};

const snippetMetaStyle = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  color: "text.secondary",
  fontSize: "0.75rem"
};

const actionButtonsStyle = {
  display: "flex",
  gap: 0.5
};

export const SnippetBrowser: React.FC<SnippetBrowserProps> = ({
  onInsertSnippet
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSnippets, setExpandedSnippets] = useState<Set<string>>(
    new Set()
  );

  const snippets = useSnippetStore((state) => state.getAllSnippets());
  const deleteSnippet = useSnippetStore((state) => state.deleteSnippet);

  const generateNodeIds = useNodes((state) => state.generateNodeIds);
  const setNodes = useNodes((state) => state.setNodes);
  const setEdges = useNodes((state) => state.setEdges);
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);
  const reactFlow = useReactFlow();

  const filteredSnippets = useMemo(() => {
    if (!searchTerm.trim()) {
      return snippets;
    }
    const term = searchTerm.toLowerCase();
    return snippets.filter(
      (snippet) =>
        snippet.name.toLowerCase().includes(term) ||
        snippet.description.toLowerCase().includes(term)
    );
  }, [snippets, searchTerm]);

  const toggleExpanded = useCallback((snippetId: string) => {
    setExpandedSnippets((prev) => {
      const next = new Set(prev);
      if (next.has(snippetId)) {
        next.delete(snippetId);
      } else {
        next.add(snippetId);
      }
      return next;
    });
  }, []);

  const handleInsertSnippet = useCallback(
    (snippet: Snippet) => {
      const oldToNewIds = new Map<string, string>();
      const newNodeIds = generateNodeIds(snippet.nodes.length);

      snippet.nodes.forEach((node, index) => {
        oldToNewIds.set(node.id, newNodeIds[index]);
      });

      const centerX = reactFlow.getViewport().x / reactFlow.getZoom();
      const centerY = reactFlow.getViewport().y / reactFlow.getZoom();

      const snippetBounds = {
        minX: Math.min(...snippet.nodes.map((n) => n.position.x)),
        minY: Math.min(...snippet.nodes.map((n) => n.position.y))
      };

      const offset = {
        x: centerX - snippetBounds.minX,
        y: centerY - snippetBounds.minY
      };

      const newNodes = snippet.nodes.map((node, index) => {
        const newId = newNodeIds[index];
        let newParentId: string | undefined;

        if (node.parentId && oldToNewIds.has(node.parentId)) {
          newParentId = oldToNewIds.get(node.parentId);
        }

        const newNode = {
          ...node,
          id: newId,
          parentId: newParentId,
          data: {
            ...node.data,
            workflow_id: "",
            positionAbsolute: node.data.positionAbsolute
              ? {
                  x: node.data.positionAbsolute.x + offset.x,
                  y: node.data.positionAbsolute.y + offset.y
                }
              : undefined
          },
          position: {
            x: node.position.x + (newParentId ? 0 : offset.x),
            y: node.position.y + (newParentId ? 0 : offset.y)
          },
          selected: false
        };

        return newNode;
      });

      const newEdges = snippet.edges
        .filter(
          (edge) =>
            oldToNewIds.has(edge.source) && oldToNewIds.has(edge.target)
        )
        .map((edge) => ({
          ...edge,
          id: uuidv4(),
          source: oldToNewIds.get(edge.source)!,
          target: oldToNewIds.get(edge.target)!
        }));

      setNodes([...nodes, ...newNodes]);
      setEdges([...edges, ...newEdges]);

      onInsertSnippet?.(snippet);
    },
    [
      generateNodeIds,
      reactFlow,
      nodes,
      edges,
      setNodes,
      setEdges,
      onInsertSnippet
    ]
  );

  const handleDeleteSnippet = useCallback(
    (snippetId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      deleteSnippet(snippetId);
    },
    [deleteSnippet]
  );

  const formatDate = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }, []);

  if (snippets.length === 0) {
    return (
      <Box sx={emptyStateStyle}>
        <BookmarkBorder sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          No snippets yet
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.5 }}
        >
          Select nodes and save them as a snippet for reuse
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={containerStyle}>
      <Box sx={searchStyle}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search snippets..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            )
          }}
        />
      </Box>

      <List sx={listStyle} dense>
        {filteredSnippets.map((snippet, index) => {
          const isExpanded = expandedSnippets.has(snippet.id);
          const nodeCount = snippet.nodes.length;
          const edgeCount = snippet.edges.length;

          return (
            <Box key={snippet.id}>
              {index > 0 && <Divider component="li" />}
              <ListItemButton
                onClick={() => toggleExpanded(snippet.id)}
                sx={snippetItemStyle(isExpanded)}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Bookmark fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={snippet.name}
                  secondary={
                    <Box sx={snippetContentStyle}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {snippet.description || "No description"}
                      </Typography>
                      <Box sx={snippetMetaStyle}>
                        <span>{nodeCount} node{nodeCount !== 1 ? "s" : ""}</span>
                        {edgeCount > 0 && (
                          <>
                            <span>•</span>
                            <span>
                              {edgeCount} connection{edgeCount !== 1 ? "s" : ""}
                            </span>
                          </>
                        )}
                      </Box>
                    </Box>
                  }
                  primaryTypographyProps={{
                    noWrap: true,
                    fontWeight: isExpanded ? 600 : 400
                  }}
                />
                {isExpanded ? (
                  <ExpandLess fontSize="small" />
                ) : (
                  <ExpandMore fontSize="small" />
                )}
              </ListItemButton>

              {isExpanded && (
                <Box sx={{ pl: 4, pr: 1, pb: 1 }}>
                  <Box sx={actionButtonsStyle}>
                    <Tooltip title="Insert Snippet">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInsertSnippet(snippet);
                        }}
                      >
                        <ContentCopy fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Snippet">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => handleDeleteSnippet(snippet.id, e)}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  {snippet.description && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 1, display: "block" }}
                    >
                      {snippet.description}
                    </Typography>
                  )}
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{ mt: 0.5, display: "block" }}
                  >
                    Created {formatDate(snippet.createdAt)}
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })}
      </List>
    </Box>
  );
};

export default SnippetBrowser;
