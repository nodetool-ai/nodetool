/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useState, useMemo, useCallback } from "react";
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

const humanizeType = (type: string) => {
  return type.replace(/([A-Z])/g, " $1").trim();
};

interface PlaceholderNodeData extends Node<NodeData> {
  data: NodeData & {
    workflow_id?: string;
    collapsed?: boolean;
  };
}

const styles = (theme: Theme) =>
  css({
    "&": {
      outline: "2px solid" + theme.vars.palette.error.main
    },
    ".node-header ": {
      minWidth: "50px",
      backgroundColor: theme.vars.palette.error.main
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
      color: theme.vars.palette.error.main,
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
      backgroundColor: "var(--palette-grey-400)",
      fontSize: "var(--fontSizeTiny)",
      lineHeight: "1.2em",
      "&:hover": {
        backgroundColor: "var(--palette-grey-200)"
      }
    },
    ".install-button": {
      backgroundColor: "var(--palette-grey-400)",
      fontSize: "var(--fontSizeTiny)",
      lineHeight: "1.2em",
      "&:hover": {
        backgroundColor: "var(--palette-grey-200)"
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
  const theme = useTheme();
  const nodeType = props.type;
  const nodeData = props.data;
  const nodeTitle = humanizeType(nodeType?.split(".").pop() || "");
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
      const { data, error } = await client.POST(
        "/api/packages/install" as any,
        {
          body: { repo_id: repoId }
        }
      );
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
      is_streaming: false,
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
    <Container css={styles(theme)} className={className}>
      <NodeHeader
        id={props.id}
        metadataTitle={nodeTitle || "Missing Node!"}
        data={nodeData || {}}
        showMenu={false}
        selected={props.selected}
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
