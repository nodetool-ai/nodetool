/** @jsxImportSource @emotion/react */
import ThemeNodes from "../themes/ThemeNodes";
import { memo, useEffect, useState } from "react";
import { NodeProps } from "reactflow";
import { isEqual } from "lodash";
import { Container, Typography } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { useMetadata } from "../../serverState/useMetadata";

import { useNodeStore } from "../../stores/NodeStore";
import useResultsStore, { hashKey } from "../../stores/ResultsStore";
import OutputRenderer from "./OutputRenderer";
import { NodeHeader } from "./NodeHeader";
import { NodeFooter } from "./NodeFooter";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import { NodeLogs } from "./NodeLogs";
import { ProcessTimer } from "./ProcessTimer";
import { NodeProgress } from "./NodeProgress";
import { NodeErrors } from "./NodeErrors";
import useStatusStore from "../../stores/StatusStore";

export const TOOLTIP_ENTER_DELAY = 650;
export const TOOLTIP_LEAVE_DELAY = 200;
export const TOOLTIP_ENTER_NEXT_DELAY = 350;
/**
 * Split a camelCase string into a space separated string.
 */
export function titleize(str: string) {
  const s = str.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return s.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * BaseNode renders a single node in the workflow
 *
 * @param props
 */

export default memo(
  function BaseNode(props: NodeProps<NodeData>) {
    const {
      data: metadata,
      isLoading: metadataLoading,
      error: metadataError
    } = useMetadata();
    const findNode = useNodeStore((state) => state.findNode);
    const nodedata = useNodeStore((state) => state.findNode(props.id)?.data);
    const node = useNodeStore((state) => state.findNode(props.id));
    const getInputEdges = useNodeStore((state) => state.getInputEdges);
    const workflowId = nodedata?.workflow_id || "";
    const nodeKey = hashKey(workflowId, props.id);
    const status = useStatusStore((state) => state.statuses[nodeKey]);
    const edges = getInputEdges(props.id);
    const isLoading =
      status === "running" ||
      status === "starting" ||
      status === "processing" ||
      status === "booting";
    const isConstantNode = props.type.startsWith("nodetool.constant");

    const [parentIsCollapsed, setParentIsCollapsed] = useState(false);
    const hasParent = node?.parentId !== undefined;
    const parentNode = hasParent ? findNode(node?.parentId || "") : null;
    useEffect(() => {
      // Set parentIsCollapsed state based on parent node
      if (hasParent) {
        setParentIsCollapsed(parentNode?.data.collapsed || false);
      }
    }, [hasParent, node?.parentId, parentNode?.data.collapsed]);

    const isInputNode = props.type.startsWith("nodetool.input");
    const isOutputNode =
      props.type.startsWith("nodetool.output") ||
      props.type === "comfy.image.SaveImage";
    const className = `node-body ${props.data.collapsed ? "collapsed" : ""}
      ${hasParent ? "has-parent" : ""}
      ${isInputNode ? " input-node" : ""} ${isOutputNode ? " output-node" : ""}
      ${props.data.dirty ? "dirty" : ""}`
      .replace(/\s+/g, " ")
      .trim();
    if (!metadata) {
      return (
        <Container className={className}>
          {metadataLoading && <span>Loading...</span>}
          {metadataError !== undefined && (
            <span>{metadataError?.toString()}</span>
          )}
        </Container>
      );
    }

    const nodeMetadata = metadata.metadataByType[props.type];
    const node_title = titleize(nodeMetadata.title || "");
    const node_namespace = nodeMetadata.namespace || "";
    const firstOutput =
      nodeMetadata.outputs.length > 0
        ? nodeMetadata.outputs[0]
        : {
            name: "output",
            type: {
              type: "string"
            }
          };

    return (
      <Container
        className={className}
        style={{
          display: parentIsCollapsed ? "none" : "block",
          backgroundColor: hasParent
            ? ThemeNodes.palette.c_node_bg_group
            : ThemeNodes.palette.c_node_bg
        }}
      >
        <>
          <NodeHeader
            id={props.id}
            nodeTitle={node_title}
            isLoading={isLoading}
            hasParent={hasParent}
          />
          <div className="node-content-hidden" />
          <NodeErrors id={props.id} />
          {status === "booting" && (
            <Typography
              variant="body2"
              color="textSecondary"
              sx={{ padding: "10px", color: "red" }}
            >
              Model is booting, this can take up to 3 minutes.
            </Typography>
          )}
        </>
        {!isOutputNode && (
          <NodeOutputs id={props.id} outputs={nodeMetadata.outputs} />
        )}
        <NodeInputs
          id={props.id}
          layout={nodeMetadata.layout}
          properties={nodeMetadata.properties}
          nodeType={props.type}
          data={props.data}
          onlyFields={isConstantNode}
          onlyHandles={false}
          edges={edges}
          primaryField={nodeMetadata.primary_field || ""}
          secondaryField={nodeMetadata.secondary_field || ""}
        />

        {nodeMetadata.layout === "default" && (
          <>
            <ProcessTimer isLoading={isLoading} status={status} />
            <NodeProgress id={props.id} />
            <NodeLogs id={props.id} workflowId={workflowId} />
            <NodeFooter
              nodeNamespace={node_namespace}
              type={firstOutput.type.type}
              metadata={nodeMetadata}
            />
          </>
        )}
      </Container>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps, nextProps)
);
