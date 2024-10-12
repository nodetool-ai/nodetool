/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { colorForType } from "../../config/data_types";

import ThemeNodes from "../themes/ThemeNodes";
import { memo, useEffect, useState, useMemo } from "react";
import {
  Node,
  NodeProps,
  NodeResizer,
  NodeToolbar,
  ResizeParams
} from "@xyflow/react";
import { isEqual } from "lodash";
import { Container } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { useMetadata } from "../../serverState/useMetadata";
import { useNodeStore } from "../../stores/NodeStore";
import { NodeHeader } from "./NodeHeader";
import { NodeErrors } from "./NodeErrors";
import useStatusStore from "../../stores/StatusStore";
import useResultsStore from "../../stores/ResultsStore";
import OutputRenderer from "./OutputRenderer";
import ModelRecommendations from "./ModelRecommendations";
import { isProduction } from "../../stores/ApiClient";
import ApiKeyValidation from "./ApiKeyValidation";
import NodeStatus from "./NodeStatus";
import NodeContent from "./NodeContent";
import { titleizeString } from "../../utils/titleizeString";
import NodeToolButtons from "./NodeToolButtons";

// Tooltip timing constants
export const TOOLTIP_ENTER_DELAY = 650;
export const TOOLTIP_LEAVE_DELAY = 200;
export const TOOLTIP_ENTER_NEXT_DELAY = 350;

// Node sizing constants
const BASE_HEIGHT = 0; // Minimum height for the node
const INCREMENT_PER_OUTPUT = 25; // Height increase per output in the node
const MAX_NODE_WIDTH = 600;

/**
 * BaseNode renders a single node in the workflow
 *
 * @param props
 */

const gradientAnimationKeyframes = keyframes`
  from {
    --gradient-angle: 90deg;
  }
  to {
    --gradient-angle: 450deg;
  }
`;

const styles = (theme: any, colors: string[]) =>
  css({
    // resizer
    ".node-resizer .react-flow__resize-control.top.line, .node-resizer .react-flow__resize-control.bottom.line":
      {
        display: "none"
      },
    ".node-resizer .react-flow__resize-control.handle": {
      opacity: 0
    },
    ".node-resizer .react-flow__resize-control.line": {
      opacity: 0,
      borderWidth: "1px",
      borderColor: theme.palette.c_gray2,
      transition: "all 0.15s ease-in-out"
    },
    ".node-resizer .react-flow__resize-control.line:hover": {
      opacity: 1
    },

    "&.loading": {
      position: "relative",
      "--glow-offset": "-4px",

      "&::before": {
        opacity: 0,
        content: '""',
        position: "absolute",
        top: "var(--glow-offset)",
        left: "var(--glow-offset)",
        right: "var(--glow-offset)",
        bottom: "var(--glow-offset)",
        background: `conic-gradient(
              from var(--gradient-angle), 
              ${colors[0]},
              ${colors[1]},
              ${colors[2]},
              ${colors[3]},
              ${colors[4]},
              ${colors[0]}
            )`,
        borderRadius: "inherit",
        zIndex: -20,
        animation: `${gradientAnimationKeyframes} 5s ease-in-out infinite`,

        transition: "opacity 0.5s ease-in-out"
      }
    },
    "&.loading.is-loading": {
      "&::before": {
        opacity: 1
      }
    },
    ".react-flow__resize-control.handle.right": {
      cursor: "ew-resize"
    },
    ".react-flow__handle": {
      opacity: 0.3,
      transition: "opacity 0.3s ease-in-out"
    },
    "&:hover .react-flow__handle": {
      opacity: 1
    }
  });

const BaseNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  // Metadata and loading state
  const {
    data: metadata,
    isLoading: metadataLoading,
    error: metadataError
  } = useMetadata();

  // Node-specific data and relationships
  const nodedata = useNodeStore((state) => state.findNode(props.id)?.data);
  const node = useNodeStore((state) => state.findNode(props.id));
  const hasParent = node?.parentId !== undefined;
  const parentNode = useNodeStore((state) =>
    hasParent ? state.findNode(node?.parentId || "") : null
  );

  // Workflow and status
  const workflowId = useMemo(() => nodedata?.workflow_id || "", [nodedata]);
  const status = useStatusStore((state) =>
    state.getStatus(workflowId, props.id)
  );
  const isLoading =
    status === "running" || status === "starting" || status === "booting";

  // Node type flags
  const isConstantNode = props.type.startsWith("nodetool.constant");
  const isInputNode = props.type.startsWith("nodetool.input");
  const isOutputNode =
    props.type.startsWith("nodetool.output") ||
    props.type === "comfy.image.SaveImage" ||
    props.type === "comfy.image.PreviewImage";

  // UI state
  const [parentIsCollapsed, setParentIsCollapsed] = useState(false);

  useEffect(() => {
    // Set parentIsCollapsed state based on parent node
    if (hasParent) {
      setParentIsCollapsed(parentNode?.data.collapsed || false);
    }
  }, [hasParent, node?.parentId, parentNode?.data.collapsed]);

  const className = useMemo(
    () =>
      `node-body ${props.data.collapsed ? "collapsed" : ""}
      ${hasParent ? "has-parent" : ""}
      ${isInputNode ? " input-node" : ""} ${isOutputNode ? " output-node" : ""}
      ${props.data.dirty ? "dirty" : ""}
      ${isLoading ? " loading is-loading" : " loading "}`
        .replace(/\s+/g, " ")
        .trim(),
    [
      props.data.collapsed,
      hasParent,
      isInputNode,
      isOutputNode,
      props.data.dirty,
      isLoading
    ]
  );

  // Results and rendering
  const result = useResultsStore((state) =>
    state.getResult(props.data.workflow_id, props.id)
  );
  const renderedResult = useMemo(() => {
    if (result && typeof result === "object") {
      return Object.entries(result).map(([key, value]) => (
        <OutputRenderer key={key} value={value} />
      ));
    }
  }, [result]);

  // Node height calculation
  const minHeight = useMemo(() => {
    if (!metadata) return BASE_HEIGHT;
    const outputCount =
      metadata.metadataByType[props.type]?.outputs.length || 0;
    return BASE_HEIGHT + outputCount * INCREMENT_PER_OUTPUT;
  }, [metadata, props.type]);

  // Node metadata and properties
  const nodeMetadata = metadata?.metadataByType[props.type];
  const node_namespace = nodeMetadata?.namespace || "";
  const titleizedType = useMemo(
    () => (nodeMetadata?.title ? titleizeString(nodeMetadata.title) : ""),
    [nodeMetadata?.title]
  );

  const nodeColors = useMemo(() => {
    const outputColors = [
      ...new Set(
        nodeMetadata?.outputs?.map((output) =>
          colorForType(output.type.type)
        ) || []
      )
    ];
    const inputColors = [
      ...new Set(
        nodeMetadata?.properties?.map((input) =>
          colorForType(input.type.type)
        ) || []
      )
    ];
    const allColors = [...outputColors];
    for (const color of inputColors) {
      if (!allColors.includes(color)) {
        allColors.push(color);
      }
    }
    while (allColors.length < 5) {
      allColors.push(allColors[allColors.length % allColors.length]);
    }
    return allColors.slice(0, 5);
  }, [nodeMetadata]);

  if (!nodeMetadata || metadataLoading || metadataError) {
    return (
      <Container className={className}>
        <NodeHeader id={props.id} nodeTitle={titleizedType || ""} />
      </Container>
    );
  }

  if (parentIsCollapsed) {
    return null;
  }

  return (
    <Container
      css={styles(ThemeNodes, nodeColors)}
      className={className}
      style={{
        display: parentIsCollapsed ? "none" : "flex",
        minHeight: `${minHeight}px`,
        backgroundColor: hasParent
          ? ThemeNodes.palette.c_node_bg_group
          : ThemeNodes.palette.c_node_bg
      }}
    >
      <NodeToolbar>
        <NodeToolButtons nodeId={props.id} />
      </NodeToolbar>
      <NodeHeader
        id={props.id}
        nodeTitle={titleizedType}
        hasParent={hasParent}
      />
      <NodeErrors id={props.id} workflow_id={workflowId} />
      <NodeStatus status={status} />
      {!isProduction && <ModelRecommendations nodeType={props.type} />}
      {!isProduction && <ApiKeyValidation nodeNamespace={node_namespace} />}
      <NodeContent
        id={props.id}
        nodeType={props.type}
        nodeMetadata={nodeMetadata}
        isConstantNode={isConstantNode}
        isOutputNode={isOutputNode}
        data={props.data}
        status={status}
        workflowId={workflowId}
        renderedResult={renderedResult}
      />
      <div className="node-resizer">
        <div className="resizer">
          <NodeResizer
            shouldResize={(
              event,
              params: ResizeParams & { direction: number[] }
            ) => {
              const [dirX, dirY] = params.direction;
              return dirX !== 0 && dirY === 0;
            }}
            minWidth={100}
            maxWidth={MAX_NODE_WIDTH}
          />
        </div>
      </div>
    </Container>
  );
};

export default memo(BaseNode, isEqual);
