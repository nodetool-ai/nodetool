import React, { useCallback, useMemo, useEffect, useState } from "react";
import { Box, IconButton, Tooltip, Toolbar, Divider } from "@mui/material";
import {
  ContentCopy,
  Delete,
  Comment,
  CommentOutlined,
  CallSplit,
  Add
} from "@mui/icons-material";
import { useReactFlow } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useNodes } from "../../contexts/NodeContext";
import { getShortcutTooltip } from "../../config/shortcuts";
import { Node } from "@xyflow/react";

interface HoverToolbarProps {
  nodeId: string | null;
}

interface ScreenPosition {
  x: number;
  y: number;
}

const HoverToolbar: React.FC<HoverToolbarProps> = ({ nodeId }) => {
  const { getNode, getViewport } = useReactFlow();
  const { updateNodeData, deleteNode, setSelectedNodes, toggleBypass, setNodes } = useNodes(
    (state) => ({
      updateNodeData: state.updateNodeData,
      deleteNode: state.deleteNode,
      setSelectedNodes: state.setSelectedNodes,
      toggleBypass: state.toggleBypass,
      setNodes: state.setNodes
    })
  );

  const [screenPosition, setScreenPosition] = useState<ScreenPosition | null>(null);
  const [nodeWidth, setNodeWidth] = useState(280);

  const node = nodeId !== null ? getNode(nodeId) : null;

  const isExcludedType = node && (
    node.type === "comment" ||
    node.type === "group" ||
    node.type === "input" ||
    node.type === "output"
  );

  useEffect(() => {
    if (!node || isExcludedType) {
      setScreenPosition(null);
      return;
    }

    const updatePosition = () => {
      const viewport = getViewport();
      const screenX = node.position.x * viewport.zoom + viewport.x;
      const screenY = node.position.y * viewport.zoom + viewport.y;

      setScreenPosition({ x: screenX, y: screenY });
      setNodeWidth(node.measured?.width || 280);
    };

    updatePosition();

    const intervalId = setInterval(updatePosition, 100);

    return () => clearInterval(intervalId);
  }, [node, getViewport, isExcludedType]);

  const nodeData = node?.data as NodeData | undefined;
  const hasComment = Boolean(nodeData?.title?.toString().trim());
  const centerX = screenPosition ? screenPosition.x + nodeWidth / 2 : 0;

  const handleDuplicate = useCallback(() => {
    if (!node || !nodeId || !nodeData) {
      return;
    }

    const offset = 50;
    const newId = `${node.id}_copy_${Date.now()}`;

    const newNodeData: NodeData = {
      ...nodeData,
      properties: nodeData.properties || {}
    };

    const newNode: Node<NodeData> = {
      ...node,
      id: newId,
      position: {
        x: node.position.x + offset,
        y: node.position.y + offset
      },
      selected: true,
      data: newNodeData
    };

    setSelectedNodes([newNode]);

    setNodes((currentNodes) => {
      const updatedNodes = currentNodes
        .filter((n) => n.id !== nodeId)
        .map((n) => (n.selected && n.id !== newId ? { ...n, selected: false } : n));
      return [...updatedNodes, newNode];
    });
  }, [node, nodeId, nodeData, setSelectedNodes, setNodes]);

  const handleDelete = useCallback(() => {
    if (nodeId) {
      deleteNode(nodeId);
    }
  }, [nodeId, deleteNode]);

  const handleToggleComment = useCallback(() => {
    if (!nodeId || !nodeData) {
      return;
    }

    updateNodeData(nodeId, {
      ...nodeData,
      title: hasComment ? "" : "comment"
    });
  }, [nodeId, nodeData, hasComment, updateNodeData]);

  const handleBypass = useCallback(() => {
    if (nodeId) {
      toggleBypass(nodeId);
    }
  }, [nodeId, toggleBypass]);

  const handleAddNode = useCallback(() => {
    if (!node || !nodeData) {
      return;
    }

    const nodeForSelect: Node<NodeData> = { ...node, data: nodeData };
    setSelectedNodes([nodeForSelect]);
  }, [node, nodeData, setSelectedNodes]);

  const buttons = useMemo(() => {
    return [
      {
        icon: hasComment ? <Comment fontSize="small" /> : <CommentOutlined fontSize="small" />,
        label: hasComment ? "Remove Comment" : "Add Comment",
        slug: "toggleComment",
        action: handleToggleComment
      },
      {
        icon: <ContentCopy fontSize="small" />,
        label: "Duplicate",
        slug: "duplicate",
        action: handleDuplicate
      },
      {
        icon: <CallSplit fontSize="small" />,
        label: "Bypass",
        slug: "bypassNode",
        action: handleBypass
      },
      {
        icon: <Add fontSize="small" />,
        label: "Add Node",
        slug: "add-node",
        action: handleAddNode
      },
      { divider: true },
      {
        icon: <Delete fontSize="small" />,
        label: "Delete",
        slug: "deleteNode",
        action: handleDelete
      }
    ];
  }, [hasComment, handleToggleComment, handleDuplicate, handleBypass, handleAddNode, handleDelete]);

  if (!node || !screenPosition || isExcludedType) {
    return null;
  }

  return (
    <Box
      className="hover-toolbar"
      role="region"
      aria-label="Node Quick Actions"
      sx={{
        position: "absolute",
        left: centerX,
        top: screenPosition.y - 40,
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        padding: "4px 8px",
        bgcolor: "background.paper",
        borderRadius: 2,
        boxShadow: 2,
        border: 1,
        borderColor: "divider"
      }}
    >
      <Toolbar
        variant="dense"
        sx={{ backgroundColor: "transparent", minHeight: "unset", padding: 0 }}
      >
        {buttons.map((button, index) => {
          if ((button as any).divider) {
            return <Divider key={`divider-${index}`} orientation="vertical" flexItem sx={{ mx: 0.5 }} />;
          }

          const actionButton = button as {
            icon: React.ReactNode;
            label: string;
            slug: string;
            action: () => void;
          };

          return (
            <Tooltip
              key={`${actionButton.slug}-${index}`}
              title={getShortcutTooltip(actionButton.slug, "both", "full", true)}
              arrow
              placement="top"
            >
              <span>
                <IconButton
                  size="small"
                  aria-label={actionButton.label}
                  onClick={actionButton.action}
                  sx={{
                    width: 28,
                    height: 28,
                    "&:hover": {
                      bgcolor: "action.hover"
                    }
                  }}
                >
                  {actionButton.icon}
                </IconButton>
              </span>
            </Tooltip>
          );
        })}
      </Toolbar>
    </Box>
  );
};

export default HoverToolbar;
