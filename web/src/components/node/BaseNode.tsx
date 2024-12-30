/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { colorForType } from "../../config/data_types";

import ThemeNodes from "../themes/ThemeNodes";
import { memo, useMemo } from "react";
import {
  Node,
  NodeProps,
  NodeResizer,
  NodeToolbar,
  Position,
  ResizeParams
} from "@xyflow/react";
import { isEqual } from "lodash";
import { Container } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
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
import NodeToolButtons from "./NodeToolButtons";
import { useRenderLogger } from "../../hooks/useRenderLogger";
import { darkenHexColor, simulateOpacity } from "../../utils/ColorUtils";
import useMetadataStore from "../../stores/MetadataStore";
import NodeFooter from "./NodeFooter";
import useSelect from "../../hooks/nodes/useSelect";

// Node sizing constants
const BASE_HEIGHT = 0; // Minimum height for the node
const INCREMENT_PER_OUTPUT = 25; // Height increase per output in the node
const MAX_NODE_WIDTH = 600;

const resizer = (
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
);

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

const styles = (colors: string[]) =>
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
      borderColor: ThemeNodes.palette.c_gray2,
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

    "&.is-loading::before": {
      opacity: 1
    }
  });

const BaseNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  // Node-specific data and relationships
  const parentId = props.parentId;
  const hasParent = Boolean(parentId);
  const { activeSelect } = useSelect();

  // Workflow and status
  const workflowId = props.data.workflow_id;
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
      props.data.dirty,
      hasParent,
      isInputNode,
      isOutputNode,
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

  const metadata = useMetadataStore((state) => state.getMetadata(props.type));

  // Node height calculation
  const minHeight = useMemo(() => {
    if (!metadata) return BASE_HEIGHT;
    const outputCount = metadata?.outputs?.length || 0;
    return BASE_HEIGHT + outputCount * INCREMENT_PER_OUTPUT;
  }, [metadata]);

  // Node metadata and properties
  const node_namespace = metadata?.namespace || "";

  const nodeColors = useMemo(() => {
    const outputColors = [
      ...new Set(
        metadata?.outputs?.map((output) => colorForType(output.type.type)) || []
      )
    ];
    const inputColors = [
      ...new Set(
        metadata?.properties?.map((input) => colorForType(input.type.type)) ||
          []
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
  }, [metadata]);

  const memoizedStyles = useMemo(() => styles(nodeColors), [nodeColors]);

  useRenderLogger(metadata?.title || "", {
    metadata,
    // parentIsCollapsed,
    className,
    props,
    ThemeNodes,
    nodeColors,
    minHeight,
    workflowId,
    status,
    isProduction,
    node_namespace,
    isConstantNode,
    isOutputNode,
    renderedResult,
    resizer
  });

  const { headerColor, footerColor } = useMemo(() => {
    const firstOutputColor = metadata?.outputs?.[0]?.type?.type;
    return {
      headerColor: firstOutputColor
        ? darkenHexColor(
            simulateOpacity(
              colorForType(firstOutputColor),
              0.5,
              ThemeNodes.palette.c_node_bg
            ),
            20
          )
        : "",
      footerColor: firstOutputColor
        ? darkenHexColor(
            simulateOpacity(
              colorForType(firstOutputColor),
              0.25,
              ThemeNodes.palette.c_node_bg
            ),
            100
          )
        : ""
    };

    // Otherwise use parent's group color
    // if (!parentNode?.data?.properties?.group_color) return "";
    // return simulateOpacity(
    //   parentNode?.data?.properties?.group_color,
    //   0.15,
    //   ThemeNodes.palette.c_editor_bg_color
    // );
  }, [metadata]);

  if (!metadata) {
    return (
      <Container className={className}>
        {/* <NodeHeader id={props.id} nodeTitle={nodeTitle} /> */}
      </Container>
    );
  }

  // if (parentIsCollapsed) {
  //   return null;
  // }

  return (
    <Container
      css={memoizedStyles}
      className={className}
      style={{
        // display: parentIsCollapsed ? "none" : "flex",
        display: "flex",
        minHeight: `${minHeight}px`,
        backgroundColor: hasParent
          ? ThemeNodes.palette.c_node_bg_group
          : ThemeNodes.palette.c_node_bg
      }}
    >
      {props.selected && !activeSelect && (
        <NodeToolbar position={Position.Bottom} offset={0}>
          <NodeToolButtons nodeId={props.id} />
        </NodeToolbar>
      )}
      <NodeHeader
        id={props.id}
        data={props.data}
        backgroundColor={headerColor}
        metadataTitle={metadata.title}
        hasParent={hasParent}
      />
      <NodeErrors id={props.id} workflow_id={workflowId} />
      <NodeStatus status={status} />
      {!isProduction && <ModelRecommendations nodeType={props.type} />}
      {!isProduction && <ApiKeyValidation nodeNamespace={node_namespace} />}
      <NodeContent
        id={props.id}
        nodeType={props.type}
        nodeMetadata={metadata}
        isConstantNode={isConstantNode}
        isOutputNode={isOutputNode}
        data={props.data}
        status={status}
        workflowId={workflowId}
        renderedResult={renderedResult}
      />
      {props.selected && resizer}
      <NodeFooter
        nodeNamespace={metadata.namespace}
        metadata={metadata}
        backgroundColor={footerColor}
        nodeType={props.type}
      />
    </Container>
  );
};

export default memo(BaseNode, isEqual);
