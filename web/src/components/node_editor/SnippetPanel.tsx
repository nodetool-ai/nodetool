/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, useMemo, useContext } from "react";
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Chip,
  Button,
  Menu,
  MenuItem,
  Divider,
  Paper
} from "@mui/material";
import {
  ContentCopy,
  Delete,
  Edit,
  Add,
  MoreVert,
  Search,
  Folder,
  Label
} from "@mui/icons-material";
import { useNodes } from "../../contexts/NodeContext";
import { useSnippetStore, WorkflowSnippet } from "../../stores/SnippetStore";
import { useReactFlow, Node, Edge, XYPosition } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { NodeContext } from "../../contexts/NodeContext";

interface SnippetPanelProps {
  onInsertSnippet?: (snippet: WorkflowSnippet) => void;
  onSaveSnippet?: () => void;
}

const SnippetPanel: React.FC<SnippetPanelProps> = ({
  onInsertSnippet,
  onSaveSnippet
}) => {
  const snippets = useSnippetStore((state) => state.getAllSnippets());
  const deleteSnippet = useSnippetStore((state) => state.deleteSnippet);
  const duplicateSnippet = useSnippetStore((state) => state.duplicateSnippet);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);

  const filteredSnippets = useMemo(() => {
    if (!searchQuery.trim()) {
      return snippets;
    }
    const query = searchQuery.toLowerCase();
    return snippets.filter(
      (snippet) =>
        snippet.name.toLowerCase().includes(query) ||
        snippet.description.toLowerCase().includes(query) ||
        snippet.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [snippets, searchQuery]);

  const handleInsertSnippet = useCallback(
    (snippet: WorkflowSnippet) => {
      if (onInsertSnippet) {
        onInsertSnippet(snippet);
      } else {
        insertSnippetIntoWorkflow(snippet);
      }
    },
    [onInsertSnippet]
  );

  const insertSnippetIntoWorkflow = useCallback(
    (snippet: WorkflowSnippet) => {
      const store = useContext(NodeContext);
      if (!store) {
        throw new Error("NodeContext not available");
      }

      const addNode = store.getState().addNode;
      const addEdge = store.getState().addEdge;
      const reactFlowInstance = useReactFlow();

      const idMapping: Record<string, string> = {};
      let offsetX = 100;
      let offsetY = 100;

      const viewport = reactFlowInstance.getViewport();
      if (viewport) {
        offsetX = -viewport.x / viewport.zoom + 100;
        offsetY = -viewport.y / viewport.zoom + 100;
      }

      const selectedNodes = nodes.filter((n) => n.selected);
      if (selectedNodes.length > 0) {
        const lastSelected = selectedNodes[selectedNodes.length - 1];
        offsetX = lastSelected.position.x + 350;
        offsetY = lastSelected.position.y;
      }

      for (const snippetNode of snippet.nodes) {
        const newId = `${snippetNode.type.split(".").pop()}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        idMapping[snippetNode.id] = newId;

        const newNode: Node<NodeData> = {
          id: newId,
          type: snippetNode.type,
          position: {
            x: snippetNode.position.x + offsetX,
            y: snippetNode.position.y + offsetY
          },
          data: snippetNode.data as NodeData,
          selected: false,
          zIndex: snippetNode.zIndex
        };

        addNode(newNode);
      }

      for (const snippetEdge of snippet.edges) {
        const newSourceId = idMapping[snippetEdge.source];
        const newTargetId = idMapping[snippetEdge.target];

        if (newSourceId && newTargetId) {
          const newEdge: Edge = {
            id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            source: newSourceId,
            target: newTargetId,
            sourceHandle: snippetEdge.sourceHandle ?? null,
            targetHandle: snippetEdge.targetHandle ?? null,
            type: snippetEdge.type
          };

          addEdge(newEdge);
        }
      }
    },
    [nodes]
  );

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, snippetId: string) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedSnippetId(snippetId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedSnippetId(null);
  };

  const handleDelete = () => {
    if (selectedSnippetId) {
      deleteSnippet(selectedSnippetId);
    }
    handleMenuClose();
  };

  const handleDuplicate = () => {
    if (selectedSnippetId) {
      duplicateSnippet(selectedSnippetId);
    }
    handleMenuClose();
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "background.paper"
      }}
    >
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: "divider"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          <Folder color="primary" />
          <Typography variant="h6">Snippets</Typography>
          <Box sx={{ flexGrow: 1 }} />
          {onSaveSnippet && (
            <Tooltip title="Save selected nodes as snippet">
              <IconButton size="small" onClick={onSaveSnippet}>
                <Add />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <TextField
          fullWidth
          size="small"
          placeholder="Search snippets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <Search sx={{ mr: 1, color: "text.secondary" }} />
          }}
        />
      </Box>

      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {filteredSnippets.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              p: 3,
              textAlign: "center"
            }}
          >
            <Folder sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
            <Typography variant="body1" color="text.secondary" gutterBottom>
              {snippets.length === 0
                ? "No snippets yet"
                : "No snippets match your search"}
            </Typography>
            {snippets.length === 0 && onSaveSnippet && (
              <Typography variant="body2" color="text.secondary">
                Select nodes and click + to save them as a reusable snippet
              </Typography>
            )}
          </Box>
        ) : (
          <List disablePadding>
            {filteredSnippets.map((snippet) => (
              <ListItem
                key={snippet.id}
                disablePadding
                secondaryAction={
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={(e) => handleMenuOpen(e, snippet.id)}
                  >
                    <MoreVert />
                  </IconButton>
                }
              >
                <ListItemButton
                  onClick={() => handleInsertSnippet(snippet)}
                  sx={{
                    py: 1.5,
                    "&:hover": {
                      bgcolor: "action.hover"
                    }
                  }}
                >
                  <ListItemText
                    primary={snippet.name}
                    secondary={
                      <Box component="span">
                        {snippet.description && (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              display: "block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {snippet.description}
                          </Typography>
                        )}
                        <Box
                          sx={{
                            display: "flex",
                            gap: 0.5,
                            flexWrap: "wrap",
                            mt: 0.5
                          }}
                        >
                          <Chip
                            label={`${snippet.nodes.length} nodes`}
                            size="small"
                            sx={{ height: 20, fontSize: "0.7rem" }}
                          />
                          {snippet.tags.slice(0, 2).map((tag) => (
                            <Chip
                              key={tag}
                              label={tag}
                              size="small"
                              icon={<Label sx={{ fontSize: 12 }} />}
                              sx={{ height: 20, fontSize: "0.7rem" }}
                            />
                          ))}
                          {snippet.tags.length > 2 && (
                            <Chip
                              label={`+${snippet.tags.length - 2}`}
                              size="small"
                              sx={{ height: 20, fontSize: "0.7rem" }}
                            />
                          )}
                        </Box>
                      </Box>
                    }
                    primaryTypographyProps={{
                      fontWeight: 500,
                      noWrap: true
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem
          onClick={() => {
            if (selectedSnippetId) {
              const snippet = snippets.find((s) => s.id === selectedSnippetId);
              if (snippet) {
                handleInsertSnippet(snippet);
              }
            }
            handleMenuClose();
          }}
        >
          <ListItemIcon>
            <Add fontSize="small" />
          </ListItemIcon>
          Insert
        </MenuItem>
        <MenuItem onClick={handleDuplicate}>
          <ListItemIcon>
            <ContentCopy fontSize="small" />
          </ListItemIcon>
          Duplicate
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleDelete} sx={{ color: "error.main" }}>
          <ListItemIcon>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default SnippetPanel;
