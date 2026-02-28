/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo, useState, memo } from "react";
import {
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemButton,
  TextField,
  Typography
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import useContextMenuStore from "../../stores/ContextMenuStore";
import type { Node } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";
import NorthEastIcon from "@mui/icons-material/NorthEast";
import PanelHeadline from "../ui/PanelHeadline";
import { areNodesEqualIgnoringPosition } from "../../utils/nodeEquality";

type ExplorerEntry = {
  node: Node<NodeData>;
  title: string;
  subtitle: string;
  searchableText: string;
  accentColor: string;
};

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "0.75em",
    height: "100%",
    ".explorer-header": {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: "0.5em",
      userSelect: "none"
    },
    ".explorer-header h5": {
      margin: ".5em 0 .5em 0"
    },
    ".explorer-count": {
      fontSize: theme.fontSizeTiny,
      fontWeight: 500,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase"
    },
    ".filter-input": {
      width: "100%"
    },
    ".node-list": {
      flex: 1,
      overflowY: "auto",
      borderRadius: theme.shape.borderRadius,
      backgroundColor: theme.vars.palette.background.default,
      padding: 0
    },
    ".node-item": {
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      display: "flex",
      alignItems: "stretch",
      "&:last-of-type": {
        borderBottom: "none"
      }
    },
    ".node-body": {
      flex: 1,
      padding: "0.3em .25em",
      display: "flex",
      alignItems: "center",
      gap: "0.75em",
      transition: "background-color 0.2s ease, transform 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700]
      },
      ".node-text": {
        display: "flex",
        flexDirection: "column",
        gap: "0.2em",
        overflow: "hidden"
      },
      ".node-title": {
        fontWeight: 300,
        color: theme.vars.palette.text.primary,
        fontSize: theme.fontSizeSmall,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      },
      ".node-subtitle": {
        color: theme.vars.palette.text.secondary,
        fontWeight: 300,
        fontSize: theme.fontSizeTiny,
        textTransform: "uppercase",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    },
    ".node-edit-button": {
      margin: "auto 0",
      marginRight: "0.75em",
      height: "32px",
      minWidth: "32px",
      padding: "0.25em",
      outline: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".empty-state": {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.vars.palette.text.secondary,
      textAlign: "center",
      padding: "1em"
    }
  });

const NodeExplorer: React.FC = () => {
  const theme = useTheme();
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const nodes = useNodes((state) => state.nodes, areNodesEqualIgnoringPosition);
  const setSelectedNodes = useNodes((state) => state.setSelectedNodes);
  const setActiveView = useRightPanelStore((state) => state.setActiveView);
  const setPanelVisible = useRightPanelStore((state) => state.setVisibility);
  const [filter, setFilter] = useState("");

  const entries = useMemo<ExplorerEntry[]>(() => {
    const normalizedFilter = filter.trim().toLowerCase();

    const toEntry = (node: Node<NodeData>): ExplorerEntry => {
      const metadata = node.type ? getMetadata(node.type as string) : null;
      const title =
        node.data?.title?.trim() ||
        (metadata?.title ?? "") ||
        (node.data?.properties?.name as string | undefined) ||
        node.id;

      const subtitleParts = [
        metadata?.namespace || node.type || "",
        metadata?.title && metadata?.title !== title ? metadata.title : ""
      ].filter(Boolean);

      const searchableText = [
        title,
        node.id,
        node.type,
        metadata?.namespace,
        metadata?.title,
        node.id
      ]
        .filter((s): s is string => Boolean(s))
        .join(" ")
        .toLowerCase();

      const metadataBadgeColor = (metadata as any)?.badge_color;
      const accentColor =
        node.data?.color ||
        metadataBadgeColor ||
        theme.vars.palette.primary.main;

      return {
        node,
        title,
        subtitle: subtitleParts.join(" • "),
        searchableText,
        accentColor
      };
    };

    const allEntries = nodes.map(toEntry);

    const filteredEntries =
      normalizedFilter.length === 0
        ? allEntries
        : allEntries.filter((entry) =>
            entry.searchableText.includes(normalizedFilter)
          );

    return filteredEntries.sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
  }, [nodes, getMetadata, filter, theme]);

  const findNode = useNodes((state) => state.findNode);

  const handleNodeFocus = useCallback(
    (nodeId: string) => {
      // Use findNode from store instead of depending on entire nodes array
      const node = findNode(nodeId);
      if (!node) {
        console.warn("[NodeExplorer] node not found", { nodeId });
        return;
      }

      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent("nodetool:fit-node", {
            detail: { nodeId, node }
          })
        );
      });
    },
    [findNode]
  );

  const handleNodeEdit = useCallback(
    (nodeId: string) => {
      // Use findNode from store instead of depending on entire nodes array
      const node = findNode(nodeId);
      if (!node) {
        return;
      }
      setSelectedNodes([node]);
      setActiveView("inspector");
      setPanelVisible(true);
    },
    [findNode, setSelectedNodes, setActiveView, setPanelVisible]
  );

  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, nodeId: string) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "node-context-menu",
        nodeId,
        event.clientX,
        event.clientY,
        "node-list"
      );
    },
    [openContextMenu]
  );

  const handleFilterChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(event.target.value);
  }, []);

  const handleNodeClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const nodeId = event.currentTarget.dataset.nodeId;
      if (nodeId) {
        handleNodeFocus(nodeId);
      }
    },
    [handleNodeFocus]
  );

  const handleEditButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const nodeId = event.currentTarget.dataset.nodeId;
      if (nodeId) {
        handleNodeEdit(nodeId);
      }
    },
    [handleNodeEdit]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const nodeId = event.currentTarget.dataset.nodeId;
      if (nodeId) {
        handleNodeContextMenu(event, nodeId);
      }
    },
    [handleNodeContextMenu]
  );

  return (
    <Box className="node-explorer" css={styles(theme)}>
      <PanelHeadline
        title="Node Explorer"
        actions={
          <Chip
            size="small"
            label={
              filter.trim().length === 0
                ? `${nodes.length}`
                : `${entries.length} / ${nodes.length}`
            }
          />
        }
      />
      <TextField
        className="filter-input"
        size="medium"
        placeholder="Filter by name, type, or node id"
        label=""
        value={filter}
        onChange={handleFilterChange}
        variant="outlined"
        sx={{
          "& .MuiInputBase-root": {
            height: "32px",
            fontSize: theme.fontSizeSmall,
            fontWeight: 300,
            padding: "1em !important"
          }
        }}
      />
      {entries.length === 0 ? (
        <Box className="empty-state">
          <Typography variant="body2">
            {nodes.length === 0
              ? "No nodes in this workflow yet."
              : "No nodes match your filter."}
          </Typography>
        </Box>
      ) : (
        <List className="node-list" dense disablePadding>
          {entries.map((entry) => (
            <ListItem key={entry.node.id} className="node-item" disablePadding>
              <ListItemButton
                className="node-body"
                data-node-id={entry.node.id}
                onClick={handleNodeClick}
                onContextMenu={handleContextMenu}
              >
                <div className="node-text">
                  <Typography className="node-title" variant="body1">
                    {entry.title}
                  </Typography>
                  {entry.subtitle && (
                    <Typography className="node-subtitle" variant="body2">
                      {entry.subtitle}
                    </Typography>
                  )}
                </div>
              </ListItemButton>
              <Button
                className="node-edit-button"
                size="small"
                aria-label="Edit node"
                data-node-id={entry.node.id}
                onClick={handleEditButtonClick}
              >
                <NorthEastIcon fontSize="small" />
              </Button>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
};

// Memoize component to prevent unnecessary re-renders when parent components update
// NodeExplorer processes all nodes and should only re-render when nodes data actually changes
export default memo(NodeExplorer);
