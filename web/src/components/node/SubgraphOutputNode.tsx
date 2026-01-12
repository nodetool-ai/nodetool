/** @jsxImportSource @emotion/react */
/**
 * SubgraphOutputNode - Represents an output slot within a subgraph
 * 
 * This special node type appears inside subgraphs to represent outputs to the parent.
 * Each instance corresponds to a SubgraphOutput in the parent's SubgraphDefinition.
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
      border: `2px solid ${theme.vars.palette.warning.main}`,
      borderRadius: "8px",
      padding: "0"
    },
    "&.selected": {
      border: `2px solid ${theme.vars.palette.warning.light}`,
      boxShadow: `0 0 0 2px ${hexToRgba(theme.vars.palette.warning.main, 0.3)}`
    },
    ".output-header": {
      backgroundColor: theme.vars.palette.warning.main,
      color: theme.vars.palette.warning.contrastText,
      padding: "6px 12px",
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontWeight: 600,
      fontSize: "13px"
    },
    ".output-icon": {
      fontSize: "14px"
    },
    ".output-body": {
      padding: "8px 12px",
      fontSize: "12px",
      color: theme.vars.palette.text.secondary
    },
    ".handle": {
      width: "12px",
      height: "12px",
      border: `2px solid ${theme.vars.palette.warning.main}`,
      backgroundColor: theme.vars.palette.background.paper
    },
    ".handle.connected": {
      backgroundColor: theme.vars.palette.warning.main
    }
  });

const SubgraphOutputNode: React.FC<NodeProps> = memo(({ data, selected }) => {
  const theme = useTheme();
  const nodeData = data as NodeData;
  
  // Get the output name from properties
  const outputName = (nodeData.properties as any)?.name || "Output";
  const outputType = (nodeData.properties as any)?.type || "any";
  
  return (
    <div css={styles(theme)} className={selected ? "selected" : ""}>
      {/* Input handle - data flows IN from the subgraph */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="handle"
        title={`Input: ${outputName}`}
      />
      
      {/* Header */}
      <div className="output-header">
        <span className="output-icon">⬆️</span>
        <span>{outputName}</span>
      </div>
      
      {/* Body */}
      <div className="output-body">
        Type: {outputType}
      </div>
    </div>
  );
});

SubgraphOutputNode.displayName = "SubgraphOutputNode";

export default SubgraphOutputNode;
