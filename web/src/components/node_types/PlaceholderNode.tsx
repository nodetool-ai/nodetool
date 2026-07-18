/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useCallback, useEffect, useState } from "react";
import { Node, NodeProps } from "@xyflow/react";
import isEqual from "../../utils/isEqual";
import { NodeData } from "../../stores/NodeData";
import { NodeHeader } from "../node/NodeHeader";
import { NodeMetadata } from "../../stores/ApiTypes";
import { useNodes } from "../../contexts/NodeContext";
import { NodeInputs } from "../node/NodeInputs";
import { NodeOutputs } from "../node/NodeOutputs";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import ExtensionIcon from "@mui/icons-material/Extension";
import type { Edge } from "@xyflow/react";
import type { NodeStoreState } from "../../stores/NodeStore";
import { findBuiltinPackForNodeType } from "@nodetool-ai/protocol";
import usePacksStore from "../../stores/PacksStore";
import { useOpenPackageManager } from "../../hooks/useOpenPackageManager";
import {
  Box,
  EditorButton,
  FlexColumn,
  MOTION,
  Text,
  Tooltip,
  BORDER_RADIUS,
  FONT_WEIGHT,
  SPACING,
  getSpacingPx
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
      fontWeight: FONT_WEIGHT.semibold,
      textAlign: "center",
      color: theme.vars.palette.error.main,
      padding: 0,
      margin: ".5em 0 0"
    },
    ".search-button": {
      fontSize: "var(--fontSizeSmaller)",
      lineHeight: "1.1em",
      minWidth: "unset"
    },
    ".install-button": {
      position: "relative",
      fontSize: "var(--fontSizeSmaller)",
      lineHeight: "1.1em",
      minWidth: "unset",
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`,
      borderRadius: BORDER_RADIUS.md,
      color:
        theme.vars?.palette?.primary?.contrastText ||
        "var(--palette-text-primary)",
      backgroundImage: `linear-gradient(135deg, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main})`,
      backgroundSize: "200% 200%",
      border: `1px solid ${theme.vars.palette.action.selected}`,
      boxShadow: `0 6px 18px ${theme.vars.palette.c_scrim_soft}`,
      transition: `${MOTION.transform}, ${MOTION.shadow}, background-position ${MOTION.slow}`,
      overflow: "hidden",
      "&::before": {
        content: "''",
        position: "absolute",
        top: 0,
        left: "-150%",
        width: "50%",
        height: "100%",
        background:
          `linear-gradient(120deg, transparent, ${theme.vars.palette.c_overlay_strong}, transparent)`,
        transform: "skewX(-20deg)",
        transition: `left ${MOTION.slow}`
      },
      "&:hover": {
        transform: "translateY(-1px)",
        boxShadow: `0 10px 24px ${theme.vars.palette.c_scrim_soft}`,
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

  // If the missing type belongs to a built-in pack that's merely disabled,
  // offer to enable it in place instead of sending the user to the package
  // manager. The server applies the toggle live; refetched metadata swaps
  // this placeholder for the real node.
  const candidatePack = useMemo(
    () => findBuiltinPackForNodeType(resolvedType),
    [resolvedType]
  );
  const builtins = usePacksStore((state) => state.builtins);
  const fetchBuiltins = usePacksStore((state) => state.fetchBuiltins);
  const setBuiltinEnabled = usePacksStore((state) => state.setBuiltinEnabled);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (candidatePack && builtins.length === 0) {
      void fetchBuiltins();
    }
  }, [candidatePack, builtins.length, fetchBuiltins]);

  const disabledPack = useMemo(() => {
    if (!candidatePack) return undefined;
    const status = builtins.find((p) => p.id === candidatePack.id);
    return status && !status.enabled ? candidatePack : undefined;
  }, [candidatePack, builtins]);

  const enablePack = useCallback(async () => {
    if (!disabledPack) return;
    setEnabling(true);
    try {
      await setBuiltinEnabled(disabledPack.id, true);
    } finally {
      setEnabling(false);
    }
  }, [disabledPack, setBuiltinEnabled]);

  const openPackageManager = useOpenPackageManager();

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
      supports_dynamic_inputs: false,
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
  const className = useMemo(
    () =>
      `node-body ${props.data.collapsed ? "collapsed" : ""}
      ${hasParent ? "has-parent" : ""}`
        .replace(/\s+/g, " ")
        .trim(),
    [props.data.collapsed, hasParent]
  );
  return (
    <Box
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
        workflowId={nodeData?.workflow_id}
      />
      <Tooltip title="This node type is missing. Search the node menu for a replacement or install the package that provides it.">
        <Text size="big" className="missing-node-text">
          Missing Node
        </Text>
      </Tooltip>

      <FlexColumn gap={1} align="center" className="node-actions" sx={{ margin: `${getSpacingPx(SPACING.md)} 0` }}>
        {disabledPack ? (
          <Tooltip
            title={`This node is part of the ${disabledPack.name} pack, which is currently disabled. Enable it to load the node.`}
          >
            <EditorButton
              variant="contained"
              density="compact"
              className="install-button"
              onClick={enablePack}
              disabled={enabling}
              startIcon={<ExtensionIcon />}
            >
              {enabling
                ? "Enabling…"
                : `Enable ${disabledPack.name} Nodes`}
            </EditorButton>
          </Tooltip>
        ) : (
          <Tooltip title={`Search for ${resolvedType} in Package Manager`}>
            <EditorButton
              variant="contained"
              density="compact"
              className="install-button"
              onClick={openPackageManager}
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
          id={props.id}
          nodeType={nodeType || ""}
          properties={mockProperties}
          data={nodeData}
        />
      )}
      <NodeOutputs id={props.id} outputs={mockMetadata.outputs} />
    </Box>
  );
};

export default memo(PlaceholderNode, (prevProps, nextProps) =>
  isEqual(prevProps, nextProps)
);
