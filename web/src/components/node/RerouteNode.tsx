/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useMemo } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "lodash/isEqual";
import { Container } from "@mui/material";
import useMetadataStore from "../../stores/MetadataStore";
import { hexToRgba } from "../../utils/ColorUtils";
import { useNodes } from "../../contexts/NodeContext";
import { DATA_TYPES } from "../../config/data_types";
import { findOutputHandle } from "../../utils/handleUtils";
import { useSyncEdgeSelection } from "../../hooks/nodes/useSyncEdgeSelection";

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
  const { selected, id } = props;

  const upstreamConnection = useNodes((state) => {
    const incoming = state.edges.find(
      (e) => e.target === id && e.targetHandle === "input_value"
    );
    if (!incoming) {
      return null;
    }
    const sourceNode = state.nodes.find((n) => n.id === incoming.source);
    if (!sourceNode) {
      return null;
    }
    return {
      sourceType: sourceNode.type,
      sourceData: sourceNode.data,
      sourceHandle: incoming.sourceHandle
    };
  });

  // Determine effective type from upstream connection
  const { slug: upstreamSlug, color: upstreamColor } = useMemo(() => {
    // Default to 'any'
    const anyType = DATA_TYPES.find((dt) => dt.slug === "any");
    const fallback = {
      slug: anyType?.slug || "any",
      color: anyType?.color || "#888"
    };

    if (!upstreamConnection) {
      return fallback;
    }

    const { sourceType, sourceData, sourceHandle } = upstreamConnection;

    const sourceMeta = useMetadataStore
      .getState()
      .getMetadata(sourceType || "");
    if (!sourceMeta) {
      return fallback;
    }

    // Construct a minimal node object for findOutputHandle
    // We cast it to any because findOutputHandle expects a full Node object but only uses data properties
    const sourceNode = { type: sourceType, data: sourceData } as any;

    const outHandle = findOutputHandle(
      sourceNode,
      sourceHandle || "",
      sourceMeta
    );
    const typeStr = outHandle?.type?.type;
    const match = DATA_TYPES.find(
      (dt) => dt.value === typeStr || dt.name === typeStr || dt.slug === typeStr
    );
    if (match) {
      return { slug: match.slug, color: match.color };
    }
    return fallback;
  }, [upstreamConnection]);

  useSyncEdgeSelection(id, Boolean(selected));

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
        className={upstreamSlug}
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          backgroundColor: upstreamColor
        }}
      />
      <Handle
        id="output"
        type="source"
        position={Position.Right}
        className={upstreamSlug}
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          backgroundColor: upstreamColor
        }}
      />
    </Container>
  );
};

export default memo(RerouteNode, isEqual);
