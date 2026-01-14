/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Dialog,
  DialogContent,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Typography,
  Box,
  Button,
  Tooltip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import HistoryIcon from "@mui/icons-material/History";
import { useCallback, useMemo, useState } from "react";
import useClipboardHistoryStore, {
  ClipboardItem
} from "../../stores/ClipboardHistoryStore";
import { useNodes } from "../../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import { getMousePosition } from "../../utils/MousePosition";
import { uuidv4 } from "../../stores/uuidv4";
import { NodeData } from "../../stores/NodeData";
import { Edge, Node } from "@xyflow/react";

interface ClipboardHistoryPanelProps {
  open: boolean;
  onClose: () => void;
}

const styles = {
  dialog: css({
    ".MuiDialog-paper": {
      maxWidth: "500px",
      width: "90vw",
      maxHeight: "80vh"
    }
  }),
  header: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.12)"
  }),
  listItem: css({
    padding: "0 8px",
    "&:hover": {
      backgroundColor: "rgba(255, 255, 255, 0.04)"
    }
  }),
  previewContainer: css({
    display: "flex",
    gap: "4px",
    marginTop: "4px",
    flexWrap: "wrap"
  }),
  previewNode: css({
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    borderRadius: "4px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    fontSize: "12px"
  }),
  timestamp: css({
    fontSize: "11px",
    color: "rgba(255, 255, 255, 0.5)"
  })
};

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) {
    return "Just now";
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else {
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
};

const ClipboardHistoryPanel: React.FC<ClipboardHistoryPanelProps> = ({
  open,
  onClose
}) => {
  const history = useClipboardHistoryStore((state) => state.history);
  const clearHistory = useClipboardHistoryStore((state) => state.clearHistory);
  const removeItem = useClipboardHistoryStore((state) => state.removeItem);

  const { setNodes, setEdges, nodes, edges, workflowId } = useNodes((state) => ({
    setNodes: state.setNodes,
    setEdges: state.setEdges,
    nodes: state.nodes,
    edges: state.edges,
    workflowId: state.workflow.id
  }));

  const reactFlow = useReactFlow();
  const [pasting, setPasting] = useState<string | null>(null);

  const handlePasteFromHistory = useCallback(
    async (item: ClipboardItem) => {
      setPasting(item.id);

      try {
        let parsedData: { nodes: Node<NodeData>[]; edges: Edge[] };
        try {
          parsedData = JSON.parse(item.data);
        } catch {
          return;
        }

        const { nodes: copiedNodes, edges: copiedEdges } = parsedData;
        const oldToNewIds = new Map<string, string>();
        const newNodes: Node<NodeData>[] = [];
        const newEdges: Edge[] = [];

        const newIds = copiedNodes.map(() => uuidv4());
        copiedNodes.forEach((node, index) => {
          oldToNewIds.set(node.id, newIds[index]);
        });

        const mousePosition = getMousePosition();
        if (!mousePosition) {
          return;
        }

        const firstNodePosition = reactFlow.screenToFlowPosition({
          x: mousePosition.x,
          y: mousePosition.y
        });

        if (!firstNodePosition) {
          return;
        }

        const offset = {
          x: firstNodePosition.x - copiedNodes[0].position.x,
          y: firstNodePosition.y - copiedNodes[0].position.y
        };

        for (const node of copiedNodes) {
          const newId = oldToNewIds.get(node.id)!;
          let newParentId: string | undefined;

          if (node.parentId && oldToNewIds.has(node.parentId)) {
            newParentId = oldToNewIds.get(node.parentId);
          }

          const positionAbsolute = node.data?.positionAbsolute;

          const newNode: Node<NodeData> = {
            ...node,
            id: newId,
            parentId: newParentId,
            data: {
              ...node.data,
              workflow_id: workflowId,
              positionAbsolute: positionAbsolute
                ? {
                    x: positionAbsolute.x + offset.x,
                    y: positionAbsolute.y + offset.y
                  }
                : undefined
            },
            position: {
              x: node.position.x + (newParentId ? 0 : offset.x),
              y: node.position.y + (newParentId ? 0 : offset.y)
            },
            selected: false
          };

          newNodes.push(newNode);
        }

        copiedEdges.forEach((edge) => {
          const newSource = oldToNewIds.get(edge.source);
          const newTarget = oldToNewIds.get(edge.target);

          if (newSource && newTarget) {
            newEdges.push({
              ...edge,
              id: uuidv4(),
              source: newSource,
              target: newTarget
            });
          }
        });

        setNodes([...nodes, ...newNodes]);
        setEdges([...edges, ...newEdges]);
        onClose();
      } finally {
        setPasting(null);
      }
    },
    [reactFlow, setNodes, setEdges, nodes, edges, onClose, workflowId]
  );

  const handleClearHistory = useCallback(() => {
    clearHistory();
  }, [clearHistory]);

  const handleRemoveItem = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      removeItem(id);
    },
    [removeItem]
  );

  const isEmpty = useMemo(() => history.length === 0, [history]);

  return (
    <Dialog open={open} onClose={onClose} css={styles.dialog}>
      <Box css={styles.header}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <HistoryIcon fontSize="small" />
          <Typography variant="h6">Clipboard History</Typography>
        </Box>
        <Box>
          {!isEmpty && (
            <Button
              size="small"
              color="inherit"
              startIcon={<DeleteOutlineIcon />}
              onClick={handleClearHistory}
              sx={{ mr: 1 }}
            >
              Clear All
            </Button>
          )}
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      <DialogContent sx={{ padding: 0 }}>
        {isEmpty ? (
          <Box
            sx={{
              padding: 4,
              textAlign: "center",
              color: "text.secondary"
            }}
          >
            <Typography variant="body2">
              No clipboard history yet
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Copy nodes (Ctrl+C) to start building your history
            </Typography>
          </Box>
        ) : (
          <List dense>
            {history.map((item) => (
              <ListItem
                key={item.id}
                css={styles.listItem}
                secondaryAction={
                  <Tooltip title="Remove from history">
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={(e) => handleRemoveItem(e, item.id)}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
                disablePadding
              >
                <ListItemButton
                  onClick={() => handlePasteFromHistory(item)}
                  disabled={pasting === item.id}
                  sx={{ borderRadius: 1, margin: "4px 8px" }}
                >
                  <ListItemText
                    primary={
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <Typography variant="body2">
                          {item.nodeCount} node{item.nodeCount !== 1 ? "s" : ""}
                          {item.edgeCount > 0 &&
                            `, ${item.edgeCount} edge${
                              item.edgeCount !== 1 ? "s" : ""
                            }`}
                        </Typography>
                        <Typography
                          variant="caption"
                          css={styles.timestamp}
                        >
                          {formatTimestamp(item.timestamp)}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Box css={styles.previewContainer}>
                        {item.previewNodes.map((node) => (
                          <Box key={node.id} css={styles.previewNode}>
                            <Tooltip title={node.type}>
                              <Typography
                                variant="caption"
                                sx={{
                                  maxWidth: "80px",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap"
                                }}
                              >
                                {node.label}
                              </Typography>
                            </Tooltip>
                          </Box>
                        ))}
                        {item.nodeCount > 3 && (
                          <Box css={styles.previewNode}>
                            <Typography variant="caption">
                              +{item.nodeCount - 3} more
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ClipboardHistoryPanel;
