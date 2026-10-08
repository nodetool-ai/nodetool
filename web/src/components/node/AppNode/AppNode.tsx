import React, { memo, useMemo } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { Box, FlexColumn, SPACING } from "../../ui_primitives";
import { useTheme } from "@mui/material/styles";
import { NodeData } from "../../../stores/NodeData";
import { NodeHeader } from "../NodeHeader";
import { NodeErrors } from "../NodeErrors";
import NodeStatus from "../NodeStatus";
import NodeResizeHandle from "../NodeResizeHandle";
import NodeSelectionToolbar from "../NodeSelectionToolbar";
import NodeExecutionTime from "../NodeExecutionTime";
import useMetadataStore from "../../../stores/MetadataStore";
import { useNodeStatus } from "../../../hooks/nodes/useNodeExecState";
import { useNodeFocusStore } from "../../../stores/NodeFocusStore";
import { isObjectLike, isString } from "../../../utils/typePredicates";
import { AppNodeContent } from "./AppNodeContent";
import { APP_ACCENT_COLOR } from "../../../constants/nodeTypes";

/**
 * Dedicated React Flow node for the App node: runs a mini app's workflow
 * operation, with the app's inputs and outputs as the node's ports.
 */
const AppNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const { id, type, data, selected, parentId, dragging } = props;
  const workflow_id = data.workflow_id ?? "";
  const isFocused = useNodeFocusStore((state) => state.focusedNodeId === id);
  const hasParent = Boolean(parentId);

  const metadata = useMetadataStore((state) => state.getMetadata(type));
  const statusRaw = useNodeStatus(workflow_id, id);
  const statusValue =
    statusRaw && typeof statusRaw !== "object"
      ? statusRaw
      : undefined;

  const headerTitle = useMemo(() => {
    const base = data.title || metadata?.title || "App";
    const snapshot = data.properties?.app_json;
    const appName =
      isObjectLike(snapshot) && isString(snapshot.name) ? snapshot.name : "";
    return appName ? `${base} · ${appName}` : base;
  }, [metadata?.title, data.title, data.properties?.app_json]);

  if (!metadata) {
    return null;
  }

  return (
    <FlexColumn
      className="app-node"
      sx={{
        height: "100%",
        minHeight: 100,
        padding: "0 !important",
        border: `1px solid ${APP_ACCENT_COLOR}40`,
        borderRadius: theme.rounded.node,
        backgroundColor: theme.vars.palette.c_node_bg,
        boxShadow: selected
          ? `0 0 0 2px ${APP_ACCENT_COLOR}`
          : isFocused
          ? `0 0 0 2px ${theme.vars.palette.warning.main}`
          : "none",
        outline: isFocused
          ? `2px dashed ${theme.vars.palette.warning.main}`
          : "none",
        outlineOffset: "-2px",
        "--node-primary-color": APP_ACCENT_COLOR
      }}
    >
      {selected && (
        <NodeSelectionToolbar
          id={id}
          selected={selected}
          dragging={dragging}
        />
      )}
      <NodeResizeHandle minWidth={150} minHeight={150} />
      {/* This node draws its own body (no `.node-body.base-node`), so it also
          has to supply the 8px inset that class gives every other node's
          header — without it the icon sits flush against the border. */}
      <Box sx={{ px: SPACING.md, pt: SPACING.md, flexShrink: 0 }}>
        <NodeHeader
          id={id}
          selected={selected}
          data={data}
          backgroundColor={APP_ACCENT_COLOR}
          metadataTitle={headerTitle}
          hasParent={hasParent}
          iconType="workflow"
          iconBaseColor={APP_ACCENT_COLOR}
          workflowId={workflow_id}
        />
      </Box>
      <NodeErrors id={id} workflow_id={workflow_id} />
      <NodeStatus status={statusValue} />
      <NodeExecutionTime
        nodeId={id}
        workflowId={workflow_id}
        status={statusValue}
      />
      <FlexColumn
        className="node-content-container"
        sx={{
          flex: "1 1 auto",
          minHeight: 80,
          width: "100%"
        }}
      >
        <AppNodeContent
          id={id}
          nodeType={type}
          nodeMetadata={metadata}
          data={data}
          status={statusValue}
          workflowId={workflow_id}
        />
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(AppNode);
