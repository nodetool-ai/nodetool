/** @jsxImportSource @emotion/react */
import ThemeNodes from "../themes/ThemeNodes";
import { memo, useEffect, useState, useMemo, useCallback } from "react";
import { NodeProps, useStore } from "reactflow";
import { isEqual } from "lodash";
import { Box, Button, Container, Tooltip, Typography } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { useMetadata } from "../../serverState/useMetadata";
import useModelStore from "../../stores/ModelStore";
import { useNodeStore } from "../../stores/NodeStore";
import { NodeHeader } from "./NodeHeader";
import { NodeFooter } from "./NodeFooter";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import { NodeLogs } from "./NodeLogs";
import { ProcessTimer } from "./ProcessTimer";
import { NodeProgress } from "./NodeProgress";
import { NodeErrors } from "./NodeErrors";
import useStatusStore from "../../stores/StatusStore";
import useResultsStore from "../../stores/ResultsStore";
import OutputRenderer from "./OutputRenderer";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { MIN_ZOOM } from "../../config/constants";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import ModelRecommendations from "./ModelRecommendations";
import { UnifiedModel } from "../../stores/ApiTypes";
import { isProduction } from "../../stores/ApiClient";
import { llama_models } from "../../config/models";

// Tooltip timing constants
export const TOOLTIP_ENTER_DELAY = 650; // Delay before tooltip appears on hover
export const TOOLTIP_LEAVE_DELAY = 200; // Delay before tooltip disappears on mouse leave
export const TOOLTIP_ENTER_NEXT_DELAY = 350; // Delay before next tooltip appears when hovering multiple elements

// Node sizing constants
const BASE_HEIGHT = 0; // Minimum height for the node
const INCREMENT_PER_OUTPUT = 25; // Height increase per output in the node

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
    // Flow and zoom-related state
    const currentZoom = useStore((state) => state.transform[2]);
    const isMinZoom = currentZoom === MIN_ZOOM;

    // Metadata and loading state
    const {
      data: metadata, // Metadata for all node types
      isLoading: metadataLoading,
      error: metadataError
    } = useMetadata();

    // Global settings and stores
    const secrets = useRemoteSettingsStore((state) => state.secrets);
    const setMenuOpen = useSettingsStore((state) => state.setMenuOpen);
    const hasInstalledModels = useModelStore(
      (state) => state.hasInstalledModels
    );
    const { startDownload, openDialog } = useModelDownloadStore();

    // Node-specific data and relationships
    const nodedata = useNodeStore(
      useCallback((state) => state.findNode(props.id)?.data, [props.id])
    );
    const node = useNodeStore(
      useCallback((state) => state.findNode(props.id), [props.id])
    );
    const hasParent = node?.parentId !== undefined;
    const parentNode = useNodeStore(
      useCallback(
        (state) => (hasParent ? state.findNode(node?.parentId || "") : null),
        [hasParent, node?.parentId]
      )
    );
    const edges = useNodeStore(
      useCallback((state) => state.getInputEdges(props.id), [props.id])
    );

    // Workflow and status information
    const workflowId = useMemo(() => nodedata?.workflow_id || "", [nodedata]);
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

    // UI state
    const [parentIsCollapsed, setParentIsCollapsed] = useState(false);
    const [openModelDialog, setOpenModelDialog] = useState(false);
    const handleOpenModelDialog = () => setOpenModelDialog(true);
    const handleCloseModelDialog = () => setOpenModelDialog(false);

    useEffect(() => {
      // Set parentIsCollapsed state based on parent node
      if (hasParent) {
        setParentIsCollapsed(parentNode?.data.collapsed || false);
      }
    }, [hasParent, node?.parentId, parentNode?.data.collapsed]);

    const className = useMemo(
      () =>
        `node-body ${props.data.collapsed ? "collapsed" : ""}
      ${hasParent ? "has-parent" : ""}
      ${isInputNode ? " input-node" : ""} ${isOutputNode ? " output-node" : ""}
      ${props.data.dirty ? "dirty" : ""}`
          .replace(/\s+/g, " ")
          .trim(),
      [
        props.data.collapsed,
        hasParent,
        isInputNode,
        isOutputNode,
        props.data.dirty
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

    // Node height calculation
    const minHeight = useMemo(() => {
      if (!metadata) return BASE_HEIGHT;
      const outputCount =
        metadata.metadataByType[props.type]?.outputs.length || 0;
      return BASE_HEIGHT + outputCount * INCREMENT_PER_OUTPUT;
    }, [metadata, props.type]);

    // Node metadata and properties
    const nodeMetadata = metadata?.metadataByType[props.type];
    const node_title = titleize(nodeMetadata?.title || "");
    const node_namespace = nodeMetadata?.namespace || "";
    const node_outputs = nodeMetadata?.outputs || [];
    const modelType = nodeMetadata?.properties.find((p) =>
      p.type.type.includes("model")
    )?.type.type;
    const firstOutput =
      node_outputs.length > 0
        ? node_outputs[0]
        : {
            name: "output",
            type: {
              type: "string"
            }
          };

    // Model recommendations and installation status
    const recommendedModels: UnifiedModel[] = useMemo(
      () =>
        node_namespace.startsWith("huggingface.")
          ? (nodeMetadata?.recommended_models || []).map((model) => ({
              id: model.repo_id || "",
              name: model.repo_id || "",
              type: model.type || "hf.model",
              ...model
            }))
          : node_namespace.startsWith("ollama.")
          ? llama_models
          : [],
      [nodeMetadata?.recommended_models, node_namespace]
    );
    const hasRelevantInstalledModels = modelType
      ? hasInstalledModels(modelType)
      : false;

    // API key validation
    const missingAPIKeys = useMemo(() => {
      if (node_namespace.startsWith("openai.")) {
        if ((secrets.OPENAI_API_KEY || "").length === 0) {
          return "OpenAI API Key";
        }
      }
      if (node_namespace.startsWith("replicate.")) {
        if ((secrets.REPLICATE_API_TOKEN || "").length === 0) {
          return "Replicate API Token";
        }
      }
      if (node_namespace.startsWith("anthropic.")) {
        if ((secrets.ANTHROPIC_API_KEY || "").length === 0) {
          return "Anthropic API Key";
        }
      }
      return null;
    }, [
      node_namespace,
      secrets.OPENAI_API_KEY,
      secrets.REPLICATE_API_TOKEN,
      secrets.ANTHROPIC_API_KEY
    ]);

    if (!nodeMetadata || metadataLoading || metadataError) {
      return (
        <Container
          className={className}
          style={{ minHeight: `${minHeight}px` }}
        >
          <NodeHeader id={props.id} nodeTitle={node_title} isLoading={true} />
        </Container>
      );
    }
    return (
      <Container
        className={className}
        style={{
          display: parentIsCollapsed ? "none" : "flex",
          minHeight: `${minHeight}px`,
          backgroundColor: hasParent
            ? ThemeNodes.palette.c_node_bg_group
            : ThemeNodes.palette.c_node_bg
        }}
      >
        {!isMinZoom && (
          <>
            <NodeHeader
              id={props.id}
              nodeTitle={node_title}
              isLoading={isLoading}
              hasParent={hasParent}
            />
            <NodeErrors id={props.id} />
            {status == "booting" && (
              <Typography className="node-status">
                Model is booting, taking minutes.
              </Typography>
            )}

            {!isProduction && (
              <ModelRecommendations
                recommendedModels={recommendedModels}
                hasRelevantInstalledModels={hasRelevantInstalledModels}
                openModelDialog={openModelDialog}
                handleOpenModelDialog={handleOpenModelDialog}
                handleCloseModelDialog={handleCloseModelDialog}
                startDownload={startDownload}
                openDialog={openDialog}
              />
            )}

            {missingAPIKeys && (
              <Typography className="node-status">
                {missingAPIKeys} is missing!
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  onClick={() => {
                    setMenuOpen(true);
                  }}
                >
                  Add key in Settings
                </Button>
              </Typography>
            )}
          </>
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
        />
        {!isOutputNode && (
          <NodeOutputs id={props.id} outputs={nodeMetadata.outputs} />
        )}
        {renderedResult}
        {nodeMetadata.layout === "default" && !isMinZoom && (
          <>
            <ProcessTimer status={status} />
            {status === "running" && (
              <NodeProgress id={props.id} workflowId={workflowId} />
            )}
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
