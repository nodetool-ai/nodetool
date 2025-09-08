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
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

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
      outline: "2px solid",
      outlineColor: theme.vars.palette.error.main
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
      // backgroundColor: "var(--palette-grey-400)",
      // padding: 0,
      fontSize: "var(--fontSizeTiny)",
      lineHeight: "1.1em",
      minWidth: "unset"
      // "&:hover": {
      //   backgroundColor: "var(--palette-grey-200)"
      // }
    },
    ".install-button": {
      position: "relative",
      fontSize: "var(--fontSizeTiny)",
      lineHeight: "1.1em",
      minWidth: "unset",
      padding: "6px 12px",
      borderRadius: 10,
      color: (theme as any).vars?.palette?.primary?.contrastText || "#fff",
      backgroundImage: `linear-gradient(135deg, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main})`,
      backgroundSize: "200% 200%",
      border: "1px solid rgba(255,255,255,0.15)",
      boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
      transition:
        "transform 200ms ease, box-shadow 200ms ease, background-position 300ms ease",
      overflow: "hidden",
      "&::before": {
        content: "''",
        position: "absolute",
        top: 0,
        left: "-150%",
        width: "50%",
        height: "100%",
        background:
          "linear-gradient(120deg, rgba(255,255,255,0), rgba(255,255,255,0.35), rgba(255,255,255,0))",
        transform: "skewX(-20deg)",
        transition: "left 400ms ease"
      },
      "&:hover": {
        transform: "translateY(-1px)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.32)",
        backgroundPosition: "100% 0"
      },
      "&:hover::before": {
        left: "150%"
      },
      "&:active": {
        transform: "translateY(0) scale(0.99)"
      }
    }
    // ".open-menu-button": {
    //   backgroundColor: "var(--palette-grey-400)",
    //   fontSize: "var(--fontSizeTiny)",
    //   lineHeight: "1.1em",
    //   minWidth: "unset",
    //   padding: "2px 6px",
    //   "&:hover": {
    //     backgroundColor: "var(--palette-grey-200)"
    //   }
    // }
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
  const edges = useNodes((n) => n.edges);
  const incomingEdges = edges.filter((e) => e.target === props.id);
  const openNodeMenu = useNodeMenuStore((s) => s.openNodeMenu);

  // Resolve the type/namespace to display strictly from originalType when available
  const resolvedType = useMemo(() => {
    const originalType = (nodeData as any)?.originalType as string | undefined;
    const nodeDataType = (nodeData as any)?.node_type as string | undefined;
    return originalType || nodeType || nodeDataType || "";
  }, [nodeType, nodeData]);

  const resolvedNamespace = useMemo(() => {
    return resolvedType.split(".").slice(0, -1).join(".") || "unknown";
  }, [resolvedType]);

  const [packageInfo, setPackageInfo] = useState<{
    node_type: string;
    package: string;
  } | null>(null);

  const installPackage = useCallback(() => {
    // Pass the node type to the package manager to pre-fill the search
    const nodeTypeToSearch = (nodeData as any)?.originalType || nodeType || "";
    if (window.api?.showPackageManager) {
      // Use the Electron API with node search if available
      (window.api.showPackageManager as (nodeSearch?: string) => void)(
        nodeTypeToSearch
      );
    } else {
      // Fallback for non-Electron environments
      window.api?.showPackageManager?.();
    }
  }, [nodeData, nodeType]);

  const mockProperties = useMemo(() => {
    const safeProperties =
      (nodeData as any)?.properties &&
      typeof (nodeData as any).properties === "object"
        ? (nodeData as any).properties
        : {};
    const props = Object.entries(safeProperties).map(([key, value]) => ({
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
  }, [nodeData, incomingEdges]);

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

  const mockMetadata: NodeMetadata = useMemo(
    () => ({
      title: computedHeaderTitle || nodeTitle || "Missing Node",
      description: "This node is missing",
      namespace: resolvedNamespace,
      node_type: resolvedType || "unknown",
      layout: "default",
      properties: mockProperties,
      basic_fields: [],
      is_dynamic: false,
      is_streaming: false,
      expose_as_tool: false,
      supports_dynamic_outputs: false,
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
    [
      computedHeaderTitle,
      nodeTitle,
      resolvedNamespace,
      resolvedType,
      mockProperties
    ]
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
        backgroundColor: theme.vars.palette.c_node_bg
      }}
    >
      <NodeHeader
        id={props.id}
        metadataTitle={computedHeaderTitle || nodeTitle || "Missing Node!"}
        data={nodeData || {}}
        showMenu={false}
        selected={props.selected}
      />
      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title="Try to find a replacement node or write us a fax."
      >
        <Typography variant="h4" className="missing-node-text">
          Missing Node
        </Typography>
      </Tooltip>

      <div className="node-actions">
        <Tooltip title={`Search for ${resolvedType} in Package Manager`}>
          <Button
            variant="contained"
            size="small"
            className="install-button"
            onClick={installPackage}
            startIcon={<CloudDownloadIcon />}
          >
            Search Package Manager
          </Button>
        </Tooltip>
      </div>

      {mockProperties.length > 0 && (
        <NodeInputs
          nodeMetadata={mockMetadata}
          basicFields={basicFields}
          id={props.id}
          nodeType={nodeType || ""}
          properties={mockProperties}
          data={nodeData}
        />
      )}
      <NodeOutputs id={props.id} outputs={mockMetadata.outputs} />
      <NodeFooter
        nodeNamespace={resolvedNamespace}
        metadata={mockMetadata}
        nodeType={resolvedType || nodeType || ""}
      />
    </Container>
  );
};

export default memo(PlaceholderNode, (prevProps, nextProps) =>
  isEqual(prevProps, nextProps)
);
