/** @jsxImportSource @emotion/react */
/**
 * SubgraphNode - A node that represents a subgraph instance
 * 
 * This component renders a subgraph node which:
 * - Shows the subgraph name and node count
 * - Supports double-click to navigate into the subgraph
 * - Displays input/output slots based on the subgraph definition
 * - Can be bypassed like regular nodes
 */

import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useSubgraphStore } from "../../stores/SubgraphStore";
import { hexToRgba } from "../../utils/ColorUtils";

const styles = (theme: Theme, bypassed: boolean) =>
  css({
    "&": {
      minWidth: "280px",
      minHeight: "120px",
      backgroundColor: theme.vars.palette.c_bg_node,
      border: `2px solid ${theme.vars.palette.primary.main}`,
      borderRadius: "8px",
      padding: "0",
      opacity: bypassed ? 0.5 : 1,
      cursor: "pointer"
    },
    "&.selected": {
      border: `2px solid ${theme.vars.palette.primary.light}`,
      boxShadow: `0 0 0 2px ${hexToRgba(theme.vars.palette.primary.main, 0.3)}`
    },
    ".subgraph-header": {
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      padding: "8px 12px",
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontWeight: 600,
      fontSize: "14px"
    },
    ".subgraph-icon": {
      fontSize: "16px"
    },
    ".subgraph-badge": {
      marginLeft: "auto",
      fontSize: "11px",
      opacity: 0.8,
      backgroundColor: hexToRgba(theme.vars.palette.common.white, 0.2),
      padding: "2px 6px",
      borderRadius: "4px"
    },
    ".subgraph-body": {
      padding: "12px",
      minHeight: "60px"
    },
    ".subgraph-description": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      marginBottom: "8px"
    },
    ".handle": {
      width: "12px",
      height: "12px",
      border: `2px solid ${theme.vars.palette.primary.main}`,
      backgroundColor: theme.vars.palette.background.paper
    },
    ".handle.connected": {
      backgroundColor: theme.vars.palette.primary.main
    }
  });

const SubgraphNode: React.FC<NodeProps> = memo(({ id, data, selected }) => {
  const theme = useTheme();
  const getDefinition = useSubgraphStore(state => state.getDefinition);
  const openSubgraph = useSubgraphStore(state => state.openSubgraph);
  
  // Type-safe access to subgraph-specific properties
  const nodeData = data as NodeData;
  const subgraphId = (nodeData as any).subgraphId as string | undefined;
  const definition = subgraphId ? getDefinition(subgraphId) : undefined;
  
  const bypassed = nodeData.bypassed || false;
  
  const handleDoubleClick = useCallback(() => {
    if (!definition) {
      console.warn("[SubgraphNode] Cannot open subgraph: definition not found");
      return;
    }
    
    // Open the subgraph for editing - this will navigate into it
    // The navigation will swap the displayed nodes/edges to show the subgraph's internal structure
    openSubgraph(id as string);
    
    // Load the subgraph's internal nodes and edges
    // This is a simplified implementation - in a full version, we'd need to:
    // 1. Convert definition nodes/edges to ReactFlow format
    // 2. Handle viewport restoration if cached
    // For now, we'll let the SubgraphStore handle the navigation state
    
    console.log(`[SubgraphNode] Navigated into subgraph: ${definition.name}`);
  }, [id, definition, openSubgraph]);
  
  if (!definition) {
    return (
      <div css={styles(theme, bypassed)} className={selected ? "selected" : ""}>
        <div className="subgraph-header">
          <span className="subgraph-icon">⚠️</span>
          <span>Invalid Subgraph</span>
        </div>
        <div className="subgraph-body">
          <div className="subgraph-description">
            Subgraph definition not found: {subgraphId}
          </div>
        </div>
      </div>
    );
  }
  
  const nodeCount = definition.nodes.length;
  
  return (
    <div 
      css={styles(theme, bypassed)} 
      className={selected ? "selected" : ""}
      onDoubleClick={handleDoubleClick}
    >
      {/* Input handles */}
      {definition.inputs.map((input, index) => (
        <Handle
          key={`input-${index}`}
          type="target"
          position={Position.Left}
          id={`input-${index}`}
          style={{ top: `${((index + 1) / (definition.inputs.length + 1)) * 100}%` }}
          className="handle"
          title={input.label || input.name}
        />
      ))}
      
      {/* Header */}
      <div className="subgraph-header">
        <span className="subgraph-icon">📦</span>
        <span>{nodeData.title || definition.name}</span>
        <span className="subgraph-badge">{nodeCount} nodes</span>
      </div>
      
      {/* Body */}
      <div className="subgraph-body">
        {definition.description && (
          <div className="subgraph-description">
            {definition.description}
          </div>
        )}
      </div>
      
      {/* Output handles */}
      {definition.outputs.map((output, index) => (
        <Handle
          key={`output-${index}`}
          type="source"
          position={Position.Right}
          id={`output-${index}`}
          style={{ top: `${((index + 1) / (definition.outputs.length + 1)) * 100}%` }}
          className="handle"
          title={output.label || output.name}
        />
      ))}
    </div>
  );
});

SubgraphNode.displayName = "SubgraphNode";

export default SubgraphNode;
