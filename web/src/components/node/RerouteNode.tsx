/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo } from "react";
import { NodeProps, Node, Handle, Position } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { isEqual } from "lodash";
import { Container } from "@mui/material";
import useMetadataStore from "../../stores/MetadataStore";
import { hexToRgba } from "../../utils/ColorUtils";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    width: "60px !important",
    height: "20px !important",
    minWidth: "60px !important",
    minHeight: "20px !important",
    overflow: "visible",
    border: `1px solid ${theme.vars.palette.grey[400]}`,
    backgroundColor: hexToRgba(theme.vars.palette.c_node_bg as string, 0.8),
    backdropFilter: theme.vars.palette.glass.blur,
    WebkitBackdropFilter: theme.vars.palette.glass.blur,
    borderRadius: "50%",
    cursor: "grab",
    transition: "all 0.2s ease",

    "&:hover": {
      transform: "scale(1.05)"
    }
  });

interface RerouteNodeProps extends NodeProps {
  data: NodeData;
  id: string;
}

const RerouteNode: React.FC<RerouteNodeProps> = (props) => {
  const theme = useTheme();
  const { selected, id, type, data } = props;

  // Get metadata for this node type
  const metadata = useMetadataStore((state) => state.getMetadata(type));

  if (!metadata) {
    return <div>Loading...</div>;
  }

  return (
    <Container
      css={styles(theme)}
      className={`node-drag-handle node-body reroute-node ${
        selected ? "selected" : ""
      }`}
      sx={{
        boxShadow: selected
          ? `0 0 12px ${theme.vars.palette.primary.main}60`
          : "0 0 24px -22px rgba(0,0,0,.65)",
        borderColor: selected
          ? theme.vars.palette.primary.main
          : theme.vars.palette.grey[400]
      }}
    >
      {/* Centered circle with only handles at left/right midpoints */}
      <Handle
        id="input_value"
        type="target"
        position={Position.Left}
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
      <Handle
        id="output"
        type="source"
        position={Position.Right}
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
    </Container>
  );
};

export default memo(RerouteNode, isEqual);
