/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "lodash/isEqual";
import { Container, Tooltip } from "@mui/material";
import useMetadataStore from "../../stores/MetadataStore";
import { hexToRgba } from "../../utils/ColorUtils";
import { useNodes } from "../../contexts/NodeContext";
import { DATA_TYPES } from "../../config/data_types";
import { findOutputHandle } from "../../utils/handleUtils";
import { useSyncEdgeSelection } from "../../hooks/nodes/useSyncEdgeSelection";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    position: "relative",
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
      // transform: "scale(1.05)"
    }
  });

const titleStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: "calc(100% + 6px)",
    left: "50%",
    transform: "translateX(-50%)",
    width: "max-content",
    whiteSpace: "normal",
    wordBreak: "break-word",
    fontSize: "10px",
    lineHeight: 1.3,
    color: theme.vars.palette.text.secondary,
    background: hexToRgba(theme.vars.palette.c_node_bg as string, 0.85),
    backdropFilter: theme.vars.palette.glass.blur,
    WebkitBackdropFilter: theme.vars.palette.glass.blur,
    padding: "2px 6px",
    borderRadius: "4px",
    border: `1px solid ${theme.vars.palette.divider}`,
    cursor: "default",
    userSelect: "none",
    maxWidth: "130px",
    textAlign: "center",

    "& input": {
      width: "100px",
      border: "none",
      outline: "none",
      background: "transparent",
      color: theme.vars.palette.text.primary,
      fontSize: "10px",
      lineHeight: 1.3,
      fontFamily: "inherit",
      padding: 0,
      textAlign: "center"
    }
  });

interface RerouteNodeProps extends NodeProps {
  data: NodeData;
  id: string;
}

const RerouteNode: React.FC<RerouteNodeProps> = (props) => {
  const theme = useTheme();
  const { selected, id, data } = props;
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateNodeData = useNodes((state) => state.updateNodeData);

  const title = data.title || "";

  const commitTitle = useCallback(
    (value: string) => {
      updateNodeData(id, { title: value });
      setIsEditing(false);
    },
    [id, updateNodeData]
  );

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        commitTitle(e.currentTarget.value);
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    [commitTitle]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      commitTitle(e.currentTarget.value);
    },
    [commitTitle]
  );

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

  const { slug: upstreamSlug, color: upstreamColor } = useMemo(() => {
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
    <Tooltip
      title="Double-click to add a label"
      enterDelay={TOOLTIP_ENTER_DELAY * 2}
      placement="top"
    >
      <Container
        css={styles(theme)}
        className={`node-drag-handle node-body reroute-node ${
          selected ? "selected" : ""
        }`}
        onDoubleClick={handleDoubleClick}
        sx={{
          boxShadow: selected
            ? `0 0 12px ${theme.vars.palette.primary.main}60`
            : "0 0 24px -22px rgba(0,0,0,.65)",
          borderColor: selected
            ? theme.vars.palette.primary.main
            : theme.vars.palette.grey[400]
        }}
      >
        <Handle
          id="input_value"
          type="target"
          position={Position.Left}
          className={upstreamSlug}
          style={{
            top: "50%",
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
            backgroundColor: upstreamColor
          }}
        />

        {(isEditing || title) && (
          <div css={titleStyles(theme)}>
            {isEditing ? (
              <input
                ref={inputRef}
                defaultValue={title}
                autoFocus
                placeholder="label"
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
              />
            ) : (
              <span>{title}</span>
            )}
          </div>
        )}
      </Container>
    </Tooltip>
  );
};

export default memo(RerouteNode, isEqual);
