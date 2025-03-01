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

const PlaceholderNode = (props: NodeProps<PlaceholderNodeData>) => {
  const [nodeType, setNodeType] = useState<string | null>(null);
  const [nodeData, setNodeData] = useState<any>(null);
  const [nodeTitle, setNodeTitle] = useState<string | null>(null);
  const [hasParent, setHasParent] = useState<boolean>(false);
  const [nodeNamespace, setNodeNamespace] = useState<string | null>(null);
  // const getWorkflow = useWorkflowStore((state) => state.get);
  const edges = useNodes((state) => state.getInputEdges(props.id));

  // useEffect(() => {
  //   if (props.data?.workflow_id) {
  //     const fetchWorkflow = async () => {
  //       const workflow = await getWorkflow(props.data.workflow_id);
  //       if (workflow?.graph?.nodes) {
  //         const node = workflow.graph.nodes.find((n) => n.id === props.id);
  //         if (node) {
  //           setNodeType(node.type || "");
  //           setNodeData(node.data);
  //           const parts = node.type?.split(".") || [];
  //           const title = parts[parts.length - 1] || "";
  //           const namespace = parts.slice(0, -1).join(".") || "";
  //           setNodeTitle(title);
  //           setNodeNamespace(namespace);
  //           setHasParent(node.parent_id !== null);
  //         }
  //       }
  //     };
  //     fetchWorkflow();
  //   }
  // }, [props.id, props.data.workflow_id, getWorkflow]);

  const relevantEdges = useMemo(() => {
    return edges.filter((edge) => edge.target === props.id);
  }, [edges, props.id]);

  const mockProperties = useMemo(() => {
    return relevantEdges.map((edge) => ({
      name: edge.targetHandle || "",
      type: { type: "any", optional: true, type_args: [] },
      description: `Input for ${edge.targetHandle}`,
      default: null,
      optional: true
    }));
  }, [relevantEdges]);

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
      {/* {mockProperties.length > 0 && (
        <NodeInputs
          id={props.id}
          nodeType={nodeType || ""}
          properties={mockProperties}
          data={nodeData}
        />
      )} */}
      {/* <NodeOutputs id={props.id} outputs={mockMetadata.outputs} /> */}
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
