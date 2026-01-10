/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { useNodeTemplatesStore, NodeTemplate } from "../../stores/NodeTemplatesStore";

const tileStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "fit-content",
      padding: "0.5em 1em 0.5em 0.5em",
      boxSizing: "border-box"
    },
    ".tiles-header": {
      marginBottom: "0.5em",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 4px",
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
        gap: "0.5em"
      }
    },
    ".tiles-container": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      gridAutoRows: "1fr",
      gap: "8px",
      alignContent: "start",
      overflowY: "auto",
      padding: "2px",
      "&::-webkit-scrollbar": {
        width: "6px"
      },
      "&::-webkit-scrollbar-track": {
        background: "transparent"
      },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: theme.vars.palette.action.disabledBackground,
        borderRadius: "8px"
      },
      "&::-webkit-scrollbar-thumb:hover": {
        backgroundColor: theme.vars.palette.action.disabled
      }
    },
    ".template-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "12px 8px",
      borderRadius: "12px",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
      minHeight: "80px",
      background: "rgba(255, 255, 255, 0.02)",
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.06), transparent 80%)",
        opacity: 0,
        transition: "opacity 0.3s ease",
        pointerEvents: "none"
      },
      "&:hover": {
        transform: "translateY(-3px)",
        borderColor: "rgba(255, 255, 255, 0.15)",
        background: "rgba(255, 255, 255, 0.05)",
        boxShadow: "0 8px 24px -6px rgba(0, 0, 0, 0.5)",
        "&::before": {
          opacity: 1
        },
        "& .tile-label": {
          opacity: 1
        }
      },
      "&:active": {
        transform: "scale(0.97) translateY(0)",
        transition: "all 0.1s ease"
      }
    },
    ".tile-label": {
      fontSize: "0.7rem",
      fontWeight: 500,
      textAlign: "center",
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      opacity: 0.8,
      transition: "opacity 0.3s ease",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical"
    },
    ".tile-usage": {
      fontSize: "0.6rem",
      color: theme.vars.palette.text.secondary,
      marginTop: "2px"
    },
    ".empty-state": {
      padding: "1em",
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.85rem",
      opacity: 0.6
    },
    ".clear-button": {
      padding: "4px",
      minWidth: 0,
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover
      }
    }
  });

interface TemplatesTilesProps {
  selectedNodeType?: string | null;
}

const TemplatesTiles: React.FC<TemplatesTilesProps> = memo(function TemplatesTiles({ selectedNodeType }) {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);

  const templates = useNodeTemplatesStore((state) =>
    selectedNodeType ? state.getTemplatesForNodeType(selectedNodeType) : []
  );
  const { incrementUsage } = useNodeTemplatesStore((state) => ({
    incrementUsage: state.incrementUsage
  }));

  const { setDragToCreate, setHoveredNode } = useNodeMenuStore((state) => ({
    setDragToCreate: state.setDragToCreate,
    setHoveredNode: state.setHoveredNode
  }));

  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleCreateNode = useCreateNode();

  const handleDragStart = useCallback(
    (template: NodeTemplate) => (event: ReactDragEvent<HTMLDivElement>) => {
      const metadata = getMetadata(template.nodeType);
      if (!metadata) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      setDragToCreate(true);
      serializeDragData(
        { type: "create-node", payload: metadata },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";
      setActiveDrag({
        type: "create-node",
        payload: metadata,
        metadata: { templateProperties: template.properties }
      });
    },
    [getMetadata, setDragToCreate, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    setDragToCreate(false);
    clearDrag();
  }, [setDragToCreate, clearDrag]);

  const onTileClick = useCallback(
    (template: NodeTemplate) => {
      const metadata = getMetadata(template.nodeType);

      if (!metadata) {
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${template.nodeType}.`,
          timeout: 4000
        });
        return;
      }

      handleCreateNode(metadata, template.properties);
      incrementUsage(template.id);

      addNotification({
        type: "success",
        content: `Applied template "${template.name}"`
      });
    },
    [getMetadata, addNotification, handleCreateNode, incrementUsage]
  );

  const onTileMouseEnter = useCallback(
    (template: NodeTemplate) => {
      const metadata = getMetadata(template.nodeType);
      if (metadata) {
        setHoveredNode(metadata);
      }
    },
    [getMetadata, setHoveredNode]
  );

  if (!selectedNodeType || templates.length === 0) {
    return null;
  }

  return (
    <Box css={memoizedStyles}>
      <div className="tiles-header">
        <Typography variant="h5">
          <BookmarkIcon
            fontSize="small"
            sx={{ opacity: 0.8, color: "info.main" }}
          />
          Templates
        </Typography>
      </div>
      <div className="tiles-container">
        {templates.map((template) => (
          <Tooltip
            key={template.id}
            title={
              <div>
                <div>{template.name}</div>
                {template.description && (
                  <div
                    style={{
                      fontSize: "0.7rem",
                      opacity: 0.75,
                      marginTop: "4px"
                    }}
                  >
                    {template.description}
                  </div>
                )}
                <div
                  style={{
                    fontSize: "0.7rem",
                    opacity: 0.75,
                    marginTop: "4px"
                  }}
                >
                  Click to place with template settings · Drag to canvas
                </div>
              </div>
            }
            placement="top"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <div
              className="template-tile"
              draggable
              onDragStart={handleDragStart(template)}
              onDragEnd={handleDragEnd}
              onClick={() => onTileClick(template)}
              onMouseEnter={() => onTileMouseEnter(template)}
              style={
                {
                  background:
                    "linear-gradient(135deg, rgba(33, 150, 243, 0.1), rgba(33, 150, 243, 0.05))"
                } as CSSProperties
              }
            >
              <BookmarkBorderIcon
                fontSize="small"
                sx={{ color: "info.main", mb: 0.5, opacity: 0.8 }}
              />
              <Typography className="tile-label">{template.name}</Typography>
              <Typography className="tile-usage">Used {template.usageCount}x</Typography>
            </div>
          </Tooltip>
        ))}
      </div>
    </Box>
  );
});

export default TemplatesTiles;
