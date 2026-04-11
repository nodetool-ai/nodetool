/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useCallback } from "react";
import { Node, NodeProps } from "@xyflow/react";
import isEqual from "fast-deep-equal";
import { Container } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { NodeHeader } from "../node/NodeHeader";
import { NodeMetadata } from "../../stores/ApiTypes";
import { useNodes } from "../../contexts/NodeContext";
import { NodeInputs } from "../node/NodeInputs";
import { NodeOutputs } from "../node/NodeOutputs";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import type { Edge } from "@xyflow/react";
import type { NodeStoreState } from "../../stores/NodeStore";
import {
  EditorButton,
  FlexColumn,
  Text,
  Tooltip
} from "../ui_primitives";

const humanizeType = (type: string) => {
  return type.replace(/([A-Z])/g, " $1").trim();
};

interface PlaceholderNodeData extends Node<NodeData> {
  data: NodeData & {
    workflow_id?: string;
    collapsed?: boolean;
    /** Original node type string preserved from the missing node */
    originalType?: string;
    /** Node type stored in the node data */
    node_type?: string;
    /** Display title for the node */
    title?: string;
    /** Property values from the original node */
    properties?: Record<string, unknown>;
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
    ".search-button": {
      fontSize: "var(--fontSizeTiny)",
      lineHeight: "1.1em",
      minWidth: "unset"
    },
    ".install-button": {
      position: "relative",
      fontSize: "var(--fontSizeTiny)",
      lineHeight: "1.1em",
      minWidth: "unset",
      padding: "6px 12px",
      borderRadius: 10,
      color:
        theme.vars?.palette?.primary?.contrastText ||
        "var(--palette-text-primary)",
      backgroundImage: `linear-gradient(135deg, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main})`,
      backgroundSize: "200% 200%",
      border: `1px solid ${theme.vars.palette.action.selected}`,
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
  });

const typeForValue = (value: unknown) => {
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
    if (!Array.isArray(value)) {
      const typedValue = value as { type?: unknown };
      if (typeof typedValue.type === "string") {
        return { type: typedValue.type, optional: true, type_args: [] };
      }
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
  const isComfyNode = useMemo(
    () =>
      (nodeType || "").startsWith("comfy.") ||
      (nodeData?.originalType || "").startsWith("comfy.") ||
      (nodeData?.node_type || "").startsWith("comfy."),
    [nodeType, nodeData?.originalType, nodeData?.node_type]
  );
  const incomingEdgeHandles = useNodes(
    useMemo(() => {
      let lastEdges: Edge[] | null = null;
      let lastResult: string[] = [];
      return (state: NodeStoreState) => {
        if (state.edges === lastEdges) {
          return lastResult;
        }
        lastEdges = state.edges;

        const newHandles = state.edges
          .filter((e) => e.target === props.id)
          .map((e) => e.targetHandle || "");

        // Only return new reference if contents actually changed
        if (
          newHandles.length === lastResult.length &&
          newHandles.every((val, index) => val === lastResult[index])
        ) {
          return lastResult;
        }

        lastResult = newHandles;
        return lastResult;
      };
    }, [props.id])
  );

  // Resolve the type/namespace to display strictly from originalType when available
  const resolvedType = useMemo(() => {
    const originalType = nodeData?.originalType;
    const nodeDataType = nodeData?.node_type;
    return originalType || nodeType || nodeDataType || "";
  }, [nodeType, nodeData]);

  const resolvedNamespace = useMemo(() => {
    return resolvedType.split(".").slice(0, -1).join(".") || "unknown";
  }, [resolvedType]);

  const installPackage = useCallback(() => {
    // Pass the node type to the package manager to pre-fill the search
    const nodeTypeToSearch = nodeData?.originalType || nodeType || "";
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
      nodeData?.properties &&
      typeof nodeData.properties === "object"
        ? nodeData.properties
        : {};
    const props = Object.entries(safeProperties).map(([key, value]) => ({
      name: key,
      type: typeForValue(value),
      default: value,
      optional: true,
      required: false
    }));
    incomingEdgeHandles.forEach((handle) => {
      props.push({
        name: handle,
        type: { type: "any", optional: true, type_args: [] },
        default: null,
        optional: true,
        required: false
      });
    });
    return props;
  }, [nodeData, incomingEdgeHandles]);

  // Compute a better header title for missing node
  const computedHeaderTitle = useMemo(() => {
    const originalType = nodeData?.originalType;
    const sourceType =
      originalType || nodeType || nodeData?.node_type || "";
    const preferredTitle = nodeData?.title;
    const raw =
      preferredTitle && preferredTitle.trim().length > 0
        ? preferredTitle
        : sourceType;
    const lastSegment = raw?.split(".").pop() || "";
    return humanizeType(lastSegment) || "Missing Node";
  }, [nodeType, nodeData]);

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

      recommended_models: [],
      is_streaming_output: false,
      required_settings: []
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
        backgroundColor: theme.vars.palette.c_node_bg,
        ...(isComfyNode && {
          outlineColor: theme.vars.palette.warning.main,
          "& .node-header": {
            backgroundColor: theme.vars.palette.warning.main
          },
          "& .missing-node-text": {
            color: theme.vars.palette.warning.main
          }
        })
      }}
    >
      <NodeHeader
        id={props.id}
        metadataTitle={computedHeaderTitle || nodeTitle || (isComfyNode ? "ComfyUI Node" : "Missing Node!")}
        data={nodeData || {}}
        showMenu={false}
        selected={props.selected}
        workflowId={nodeData?.workflow_id}
      />
      <Tooltip
        title={
          isComfyNode
            ? "Start ComfyUI and reload the workflow to use this node."
            : "Try to find a replacement node or write us a fax."
        }
      >
        <Text size="big" className="missing-node-text">
          {isComfyNode ? "ComfyUI Not Running" : "Missing Node"}
        </Text>
      </Tooltip>

      <FlexColumn gap={0.75} align="center" className="node-actions" sx={{ margin: "8px 0" }}>
        {isComfyNode ? (
          <Text
            size="small"
            sx={{
              textAlign: "center",
              padding: "4px 8px",
              fontSize: "var(--fontSizeTiny)",
              color: theme.vars.palette.text.secondary
            }}
          >
            Start ComfyUI, then reload
          </Text>
        ) : (
          <Tooltip title={`Search for ${resolvedType} in Package Manager`}>
            <EditorButton
              variant="contained"
              density="compact"
              className="install-button"
              onClick={installPackage}
              startIcon={<CloudDownloadIcon />}
            >
              Search Package Manager
            </EditorButton>
          </Tooltip>
        )}
      </FlexColumn>

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
    </Container>
  );
};

export default memo(PlaceholderNode, (prevProps, nextProps) =>
  isEqual(prevProps, nextProps)
);
