/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent } from "react";
import { Box, Typography, Chip } from "@mui/material";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { useNodeTemplatesStore, type NodeTemplate } from "../../stores/NodeTemplatesStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useNodes } from "../../contexts/NodeContext";
import type { Edge } from "@xyflow/react";

interface TemplatesBrowserProps {
  searchTerm?: string;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      boxSizing: "border-box"
    },
    ".browser-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "& h5": {
        margin: 0,
        fontSize: "0.85rem",
        fontWeight: 600,
        color: theme.vars.palette.text.secondary,
        textTransform: "uppercase",
        letterSpacing: "1px",
        opacity: 0.8,
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }
    },
    ".templates-list": {
      flex: 1,
      overflowY: "auto",
      padding: "8px",
      "&::-webkit-scrollbar": {
        width: "6px"
      },
      "&::-webkit-scrollbar-track": {
        background: "transparent"
      },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: theme.vars.palette.action.disabledBackground,
        borderRadius: "8px"
      }
    },
    ".template-card": {
      display: "flex",
      flexDirection: "column",
      padding: "12px",
      borderRadius: "12px",
      cursor: "pointer",
      position: "relative",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      transition: "all 0.2s ease",
      background: "rgba(255, 255, 255, 0.02)",
      marginBottom: "8px",
      "&:hover": {
        transform: "translateY(-2px)",
        borderColor: "rgba(255, 255, 255, 0.15)",
        background: "rgba(255, 255, 255, 0.05)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)"
      }
    },
    ".template-header": {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "8px",
      marginBottom: "6px"
    },
    ".template-name": {
      fontSize: "0.9rem",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      margin: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".template-meta": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginTop: "4px"
    },
    ".template-count": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      opacity: 0.7
    },
    ".template-description": {
      fontSize: "0.8rem",
      color: theme.vars.palette.text.secondary,
      opacity: 0.8,
      marginTop: "6px",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    },
    ".action-btn": {
      padding: "4px",
      minWidth: "unset",
      width: "28px",
      height: "28px",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: theme.vars.palette.text.secondary,
      opacity: 0.6,
      padding: "2em",
      textAlign: "center"
    },
    ".category-chip": {
      fontSize: "0.7rem",
      height: "20px",
      backgroundColor: theme.vars.palette.action.hoverBackground
    }
  });

const TemplatesBrowser = memo(function TemplatesBrowser({
  searchTerm = ""
}: TemplatesBrowserProps) {
  const theme = useTheme();
  const memoizedStyles = useCallback(() => styles(theme), [theme]);

  const { templates, incrementUsage } = useNodeTemplatesStore((state) => ({
    templates: state.templates,
    incrementUsage: state.incrementUsage
  }));

  const { setDragToCreate } = useNodeMenuStore((state) => ({
    setDragToCreate: state.setDragToCreate
  }));

  const addNotification = useNotificationStore((state) => state.addNotification);
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const { addNode, addEdge: addEdgeToStore } = useNodes((state) => ({
    addNode: state.addNode,
    addEdge: state.addEdge
  }));

  const filteredTemplates = useMemo(() => {
    if (!searchTerm.trim()) {
      return templates;
    }
    const query = searchTerm.toLowerCase().trim();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query)
    );
  }, [templates, searchTerm]);

  const handleDragStart = useCallback(
    (template: NodeTemplate) => (event: ReactDragEvent<HTMLDivElement>) => {
      event.dataTransfer.effectAllowed = "copy";
      setDragToCreate(true);
      serializeDragData(
        { type: "create-template" as const, payload: template },
        event.dataTransfer
      );
      setActiveDrag({ type: "create-template" as const, payload: template });
    },
    [setDragToCreate, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    setDragToCreate(false);
    clearDrag();
  }, [setDragToCreate, clearDrag]);

  const handleTemplateClick = useCallback(
    (template: NodeTemplate) => {
      incrementUsage(template.id);

      const offsetNodes = template.nodes.map((node) => ({
        ...node,
        id: crypto.randomUUID(),
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50
        }
      }));

      const nodeIdMap: Record<string, string> = {};
      offsetNodes.forEach((node) => {
        nodeIdMap[node.id] = node.id;
      });

      const offsetEdges = template.edges.map((edge) => ({
        ...edge,
        id: crypto.randomUUID(),
        source: nodeIdMap[edge.source] ?? edge.source,
        target: nodeIdMap[edge.target] ?? edge.target
      }));

      offsetNodes.forEach((node) => {
        addNode({
          ...node,
          data: { ...node.data }
        });
      });

      offsetEdges.forEach((edge) => {
        const sourceNode = offsetNodes.find((n) => n.id === edge.source);
        const targetNode = offsetNodes.find((n) => n.id === edge.target);
        if (sourceNode && targetNode) {
          addEdgeToStore(edge as Edge);
        }
      });

      addNotification({
        content: `Template "${template.name}" added to canvas`,
        type: "success",
        timeout: 2000
      });
    },
    [incrementUsage, addNode, addEdgeToStore, addNotification]
  );

  if (filteredTemplates.length === 0) {
    return (
      <Box css={memoizedStyles}>
        <div className="empty-state">
          <FolderOpenIcon sx={{ fontSize: "3rem", mb: 1, opacity: 0.5 }} />
          <Typography variant="body1" gutterBottom>
            {searchTerm ? "No matching templates" : "No templates saved yet"}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.7 }}>
            {searchTerm
              ? "Try a different search term"
              : "Select nodes and save them as a template for quick access"}
          </Typography>
        </div>
      </Box>
    );
  }

  return (
    <Box css={memoizedStyles}>
      <div className="templates-list">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="template-card"
            draggable
            onDragStart={handleDragStart(template)}
            onDragEnd={handleDragEnd}
            onClick={() => handleTemplateClick(template)}
            style={
              {
                background:
                  "linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(59, 130, 246, 0.05))"
              } as CSSProperties
            }
          >
            <div className="template-header">
              <Typography className="template-name" variant="body1">
                {template.name}
              </Typography>
            </div>

            <div className="template-meta">
              <Chip
                label={template.category}
                size="small"
                className="category-chip"
              />
              <span className="template-count">
                {template.nodes.length} {template.nodes.length === 1 ? "node" : "nodes"},{" "}
                {template.edges.length} {template.edges.length === 1 ? "connection" : "connections"}
              </span>
            </div>

            {template.description && (
              <Typography className="template-description" variant="body2">
                {template.description}
              </Typography>
            )}
          </div>
        ))}
      </div>
    </Box>
  );
});

export default TemplatesBrowser;
