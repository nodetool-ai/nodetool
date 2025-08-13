/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useState, useMemo, useCallback, useEffect } from "react";
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
import ManageSearchIcon from "@mui/icons-material/ManageSearch";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";
import { hexToRgba } from "../../utils/ColorUtils";
import useNodeMenuStore from "../../stores/NodeMenuStore";

const humanizeType = (type: string) => {
  return type.replace(/([A-Z])/g, " $1").trim();
};

interface PlaceholderNodeData extends Node<NodeData> {
  data: NodeData & {
    workflow_id?: string;
    collapsed?: boolean;
  };
}

const GROUP_COLOR_OPACITY = 0.55;

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
      alignItems: "center",
      flexDirection: "column",
      gap: "6px",
      margin: "8px 0"
    },
    ".search-button": {
      backgroundColor: "var(--palette-grey-400)",
      fontSize: "var(--fontSizeTiny)",
      lineHeight: "1.1em",
      minWidth: "unset",
      padding: "2px 6px",
      "&:hover": {
        backgroundColor: "var(--palette-grey-200)"
      }
    },
    ".install-button": {
      backgroundColor: "var(--palette-grey-400)",
      fontSize: "var(--fontSizeTiny)",
      lineHeight: "1.1em",
      minWidth: "unset",
      padding: "2px 6px",
      "&:hover": {
        backgroundColor: "var(--palette-grey-200)"
      }
    },
    ".open-menu-button": {
      backgroundColor: "var(--palette-grey-400)",
      fontSize: "var(--fontSizeTiny)",
      lineHeight: "1.1em",
      minWidth: "unset",
      padding: "2px 6px",
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
  const isDarkMode = useIsDarkMode();
  const nodeType = props.type;
  const nodeData = props.data;
  const nodeTitle = humanizeType(nodeType?.split(".").pop() || "");
  const hasParent = props.parentId !== null;
  const nodeNamespace = nodeType?.split(".").slice(0, -1).join(".") || "";
  const queryClient = useQueryClient();
  const edges = useNodes((n) => n.edges);
  const incomingEdges = edges.filter((e) => e.target === props.id);
  const openNodeMenu = useNodeMenuStore((s) => s.openNodeMenu);

  const parentColor = useMemo(() => {
    if (!hasParent) return "";
    return isDarkMode
      ? hexToRgba("#222", GROUP_COLOR_OPACITY)
      : hexToRgba("#ccc", GROUP_COLOR_OPACITY);
  }, [hasParent, isDarkMode]);

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
    const originalType = (nodeData as any)?.originalType;
    const nodeTypeToSearch = originalType || nodeType;
    if (!nodeTypeToSearch) return;

    setIsSearching(true);
    try {
      console.debug("[PlaceholderNode] server search for", {
        nodeTypeToSearch
      });
      console.log("[PlaceholderNode] request", {
        method: "GET",
        url: "/api/packages/nodes/package",
        params: { query: { node_type: nodeTypeToSearch } }
      });
      const { data, error } = await client.GET("/api/packages/nodes/package", {
        params: { query: { node_type: nodeTypeToSearch } }
      });
      console.log("[PlaceholderNode] response", { data, error });
      if (data && typeof (data as any).found !== "undefined") {
        console.debug("[PlaceholderNode] server search parsed", {
          found: (data as any).found,
          node_type: (data as any).node_type,
          package: (data as any).package
        });
      }

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
  }, [nodeData, nodeType]);

  // Function to install the package
  const installPackage = useCallback(() => {
    if (packageInfo && packageInfo.package) {
      installMutation.mutate(packageInfo.package);
    }
  }, [packageInfo, installMutation]);

  // Open the Node Menu prefilled with the missing node's type
  const handleSearchClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const originalType = (nodeData as any)?.originalType || nodeType || "";
      const parts = originalType.split(".").filter(Boolean);
      const selectedPath = parts.slice(0, -1);
      const searchTerm = parts.slice(-1)[0] || originalType;
      console.debug("[PlaceholderNode] opening node menu with", {
        originalType,
        selectedPath,
        searchTerm
      });
      // kick off server-side search for missing packs
      searchForNode();
      console.debug("[PlaceholderNode] calling openNodeMenu", {
        x: e.clientX,
        y: e.clientY,
        searchTerm,
        selectedPath
      });
      openNodeMenu({ x: e.clientX, y: e.clientY, searchTerm, selectedPath });
      setTimeout(() => {
        const getState = (useNodeMenuStore as any).getState;
        if (typeof getState === "function") {
          const state = getState();
          console.debug(
            "[PlaceholderNode] post-open isMenuOpen?",
            state?.isMenuOpen
          );
        }
      }, 0);
    },
    [nodeData, nodeType, openNodeMenu, searchForNode]
  );

  // Trigger server search without bubbling to React Flow
  const handleServerSearchClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      searchForNode();
    },
    [searchForNode]
  );

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

  // Compute a better header title for missing node
  const computedHeaderTitle = useMemo(() => {
    const originalType = (nodeData as any)?.originalType as string | undefined;
    const sourceType =
      packageInfo?.node_type ||
      originalType ||
      nodeType ||
      (nodeData as any)?.node_type ||
      "";
    const preferredTitle = (nodeData as any)?.title as string | undefined;
    const raw =
      preferredTitle && preferredTitle.trim().length > 0
        ? preferredTitle
        : sourceType;
    const lastSegment = raw?.split(".").pop() || "";
    return humanizeType(lastSegment) || "Missing Node";
  }, [packageInfo?.node_type, nodeType, nodeData]);

  // Debug logs to trace why header shows an unexpected title
  useEffect(() => {
    console.debug("[PlaceholderNode] header title debug", {
      id: props.id,
      nodeType,
      originalType: (nodeData as any)?.originalType,
      nodeDataTitle: (nodeData as any)?.title,
      nodeDataType: (nodeData as any)?.node_type,
      packageInfo,
      computedHeaderTitle
    });
    if ((computedHeaderTitle || "").toLowerCase() === "default") {
      console.debug(
        "[PlaceholderNode] title resolved to 'default' — check node type segments",
        {
          typeSegments: (nodeType || "").split("."),
          rawTitle: (nodeData as any)?.title
        }
      );
    }
  }, [props.id, nodeType, nodeData, packageInfo, computedHeaderTitle]);

  const mockMetadata: NodeMetadata = useMemo(
    () => ({
      title: computedHeaderTitle || nodeTitle || "Missing Node",
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
    [computedHeaderTitle, nodeTitle, nodeNamespace, nodeType, mockProperties]
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
    <Container
      css={styles(theme)}
      className={className}
      sx={{
        backgroundColor: parentColor || theme.vars.palette.c_node_bg
      }}
    >
      <NodeHeader
        id={props.id}
        metadataTitle={computedHeaderTitle || nodeTitle || "Missing Node!"}
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
          <>
            <Tooltip title="Open the Node Menu prefilled with this node's type">
              <Button
                variant="contained"
                size="small"
                className="open-menu-button"
                onClick={handleSearchClick}
                startIcon={<ManageSearchIcon />}
              >
                Open Node Menu
              </Button>
            </Tooltip>
            <Tooltip title="Search installed/available packs on the server for a matching node">
              <Button
                variant="contained"
                size="small"
                className="search-button"
                onClick={handleServerSearchClick}
                startIcon={<SearchIcon />}
              >
                Server Search
              </Button>
            </Tooltip>
          </>
        )}

        {isSearching && <CircularProgress size={24} />}

        {nodeFound && packageInfo && !installMutation.isPending && (
          <Tooltip title={`Install package ${packageInfo.package}`}>
            <Button
              variant="contained"
              size="small"
              className="install-button"
              onClick={installPackage}
              startIcon={<CloudDownloadIcon />}
            >
              Install Package
            </Button>
          </Tooltip>
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
