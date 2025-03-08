/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useEffect, useState, useMemo, useCallback } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { isEqual } from "lodash";
import { Container, Tooltip } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { NodeHeader } from "../node/NodeHeader";
import { NodeFooter } from "../node/NodeFooter";
import { Typography } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import { useNodes } from "../../contexts/NodeContext";
import { NodeInputs } from "../node/NodeInputs";
import { NodeOutputs } from "../node/NodeOutputs";

interface PlaceholderNodeData extends Node<NodeData> {
  data: NodeData & {
    workflow_id?: string;
    collapsed?: boolean;
  };
}

const styles = (theme: any) =>
  css({
    "&": {
      outline: "2px solid" + theme.palette.c_error
    },
    ".node-header ": {
      minWidth: "50px",
      backgroundColor: theme.palette.c_error
    },
    ".node-property": {
      width: "100%",
      textAlign: "left",
      paddingLeft: "0.5em",
      marginBottom: "0.1em"
    },
    ".missing-node-text": {
      fontWeight: "bold",
      textAlign: "center",
      color: theme.palette.c_error,
      padding: 0,
      margin: ".5em 0 0"
    }
  });

const typeForValue = (value: any) => {
  if (typeof value === "string") {
    return { type: "string", optional: true, type_args: [] };
  }
  if (typeof value === "number") {
    return { type: "number", optional: true, type_args: [] };
  }
  if (typeof value === "boolean") {
    return { type: "boolean", optional: true, type_args: [] };
  }
  if (typeof value === "object" && value !== null) {
    if (value.type) {
      return { type: value.type, optional: true, type_args: [] };
    }
  }
  if (Array.isArray(value)) {
    return { type: "array", optional: true, type_args: [] };
  }
  return { type: "any", optional: true, type_args: [] };
};

const PlaceholderNode = (props: NodeProps<PlaceholderNodeData>) => {
  const nodeType = props.type;
  const nodeData = props.data;
  const nodeTitle = nodeType?.split(".").pop() || "";
  const hasParent = props.parentId !== null;
  const nodeNamespace = nodeType?.split(".").slice(0, -1).join(".") || "";

  const mockProperties = useMemo(() => {
    return Object.entries(nodeData.properties).map(([key, value]) => ({
      name: key,
      type: typeForValue(value),
      default: value,
      optional: true
    }));
  }, [nodeData.properties]);

  const mockMetadata: NodeMetadata = useMemo(
    () => ({
      title: nodeTitle || "Missing Node",
      description: "This node is missing",
      namespace: nodeNamespace || "unknown",
      node_type: nodeType || "unknown",
      layout: "default",
      properties: mockProperties,
      basic_fields: [],
      is_dynamic: false,
      outputs: [
        {
          name: "output",
          type: { type: "any", optional: true, type_args: [] },
          description: "Default output",
          stream: false
        }
      ],
      input_schema: {},
      output_schema: {},
      the_model_info: {},
      recommended_models: []
    }),
    [nodeTitle, nodeNamespace, nodeType, mockProperties]
  );
  const basicFields = mockProperties
    .slice(0, 2)
    .map((property) => property.name);

  const className = useMemo(
    () =>
      `node-body ${props.data.collapsed ? "collapsed" : ""}
      ${hasParent ? "has-parent" : ""}`
        .replace(/\s+/g, " ")
        .trim(),
    [props.data.collapsed, hasParent]
  );
  return (
    <Container css={styles} className={className}>
      <NodeHeader
        id={props.id}
        metadataTitle={nodeTitle || "Missing Node!"}
        data={nodeData || {}}
        showMenu={false}
      />
      <Tooltip title="Try to find a replacement node or write us a fax.">
        <Typography variant="h4" className="missing-node-text">
          Missing Node
        </Typography>
      </Tooltip>
      {mockProperties.length > 0 && (
        <NodeInputs
          basicFields={basicFields}
          id={props.id}
          nodeType={nodeType || ""}
          properties={mockProperties}
          data={nodeData}
        />
      )}
      <NodeOutputs id={props.id} outputs={mockMetadata.outputs} />
      <NodeFooter
        nodeNamespace={nodeNamespace || ""}
        metadata={mockMetadata}
        nodeType={nodeType || ""}
      />
    </Container>
  );
};

export default memo(PlaceholderNode, (prevProps, nextProps) =>
  isEqual(prevProps, nextProps)
);
