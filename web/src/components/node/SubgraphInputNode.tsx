/** @jsxImportSource @emotion/react */
/**
 * SubgraphInputNode - Represents an input slot within a subgraph
 * 
 * This special node type appears inside subgraphs to represent inputs from the parent.
 * Each instance corresponds to a SubgraphInput in the parent's SubgraphDefinition.
 */

import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { hexToRgba } from "../../utils/ColorUtils";

const styles = (theme: Theme) =>
  css({
    "&": {
      minWidth: "200px",
      minHeight: "60px",
      backgroundColor: theme.vars.palette.background.paper,
      border: `2px solid ${theme.vars.palette.success.main}`,
      borderRadius: "8px",
      padding: "0"
    },
    "&.selected": {
      border: `2px solid ${theme.vars.palette.success.light}`,
      boxShadow: `0 0 0 2px ${hexToRgba(theme.vars.palette.success.main, 0.3)}`
    },
    ".input-header": {
      backgroundColor: theme.vars.palette.success.main,
      color: theme.vars.palette.success.contrastText,
      padding: "6px 12px",
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontWeight: 600,
      fontSize: "13px"
    },
    ".input-icon": {
      fontSize: "14px"
    },
    ".input-body": {
      padding: "8px 12px",
      fontSize: "12px",
      color: theme.vars.palette.text.secondary
    },
    ".handle": {
      width: "12px",
      height: "12px",
      border: `2px solid ${theme.vars.palette.success.main}`,
      backgroundColor: theme.vars.palette.background.paper
    },
    ".handle.connected": {
      backgroundColor: theme.vars.palette.success.main
    }
  });

const SubgraphInputNode: React.FC<NodeProps> = memo(({ data, selected }) => {
  const theme = useTheme();
  const nodeData = data as NodeData;
  
  // Get the input name from properties
  const inputName = (nodeData.properties as any)?.name || "Input";
  const inputType = (nodeData.properties as any)?.type || "any";
  
  return (
    <div css={styles(theme)} className={selected ? "selected" : ""}>
      {/* Header */}
      <div className="input-header">
        <span className="input-icon">⬇️</span>
        <span>{inputName}</span>
      </div>
      
      {/* Body */}
      <div className="input-body">
        Type: {inputType}
      </div>
      
      {/* Output handle - data flows OUT of this node into the subgraph */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="handle"
        title={`Output: ${inputName}`}
      />
    </div>
  );
});

SubgraphInputNode.displayName = "SubgraphInputNode";

export default SubgraphInputNode;
