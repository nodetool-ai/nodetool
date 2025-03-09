/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useEffect, useState, useMemo, useCallback } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { isEqual } from "lodash";
import { Container, Tooltip, Button, CircularProgress } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { NodeHeader } from "../node/NodeHeader";
import { NodeFooter } from "../node/NodeFooter";
import { Typography } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import { useNodes } from "../../contexts/NodeContext";
import { NodeInputs } from "../node/NodeInputs";
import { NodeOutputs } from "../node/NodeOutputs";
import { client } from "../../stores/ApiClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { loadMetadata } from "../../serverState/useMetadata";
import SearchIcon from "@mui/icons-material/Search";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";

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
    },
    ".node-actions": {
      display: "flex",
      justifyContent: "center",
      gap: "8px",
      margin: "8px 0"
    },
    ".search-button": {
      backgroundColor: theme.palette.c_primary,
      "&:hover": {
        backgroundColor: theme.palette.c_primary_dark
      }
    },
    ".install-button": {
      backgroundColor: theme.palette.c_hl1,
      "&:hover": {
        backgroundColor: theme.palette.c_hl2
      }
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
  const queryClient = useQueryClient();
  const edges = useNodes((n) => n.edges);
  const incomingEdges = edges.filter((e) => e.target === props.id);

  // Add state for node search and package info
  const [isSearching, setIsSearching] = useState(false);
  const [nodeFound, setNodeFound] = useState(false);
  const [packageInfo, setPackageInfo] = useState<{
    node_type: string;
    package: string;
  } | null>(null);

  // Install package mutation
  const installMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const { data, error } = await client.POST("/api/packages/install", {
        body: { repo_id: repoId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installedPackages"] });
      // Reload metadata after package installation
      loadMetadata();
    }
  });

  // Function to search for the node on the server
  const searchForNode = useCallback(async () => {
    if (!nodeType) return;

    setIsSearching(true);
    try {
      const { data, error } = await client.GET("/api/packages/nodes/package", {
        params: { query: { node_type: nodeType } }
      });

      if (error) throw error;

      setNodeFound(data.found);
      if (data.found) {
        setPackageInfo({
          node_type: data.node_type,
          package: data.package || ""
        });
      }
    } catch (error) {
      console.error("Error searching for node:", error);
      setNodeFound(false);
    } finally {
      setIsSearching(false);
    }
  }, [nodeType]);

  // Function to install the package
  const installPackage = useCallback(() => {
    if (packageInfo && packageInfo.package) {
      installMutation.mutate(packageInfo.package);
    }
  }, [packageInfo, installMutation]);

  const mockProperties = useMemo(() => {
    const props = Object.entries(nodeData.properties).map(([key, value]) => ({
      name: key,
      type: typeForValue(value),
      default: value,
      optional: true
    }));
    incomingEdges.forEach((edge) => {
      props.push({
        name: edge.targetHandle || "",
        type: { type: "any", optional: true, type_args: [] },
        default: null,
        optional: true
      });
    });
    return props;
  }, [nodeData.properties, incomingEdges]);

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

      <div className="node-actions">
        {!isSearching && !nodeFound && (
          <Button
            variant="contained"
            size="small"
            className="search-button"
            onClick={searchForNode}
            startIcon={<SearchIcon />}
          >
            Search for Node
          </Button>
        )}

        {isSearching && <CircularProgress size={24} />}

        {nodeFound && packageInfo && !installMutation.isPending && (
          <Button
            variant="contained"
            size="small"
            className="install-button"
            onClick={installPackage}
            startIcon={<CloudDownloadIcon />}
          >
            Install Package
          </Button>
        )}

        {installMutation.isPending && <CircularProgress size={24} />}
      </div>

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
