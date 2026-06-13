/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo, useCallback, useMemo, useState } from "react";
import { Handle, NodeProps, Position, useReactFlow } from "@xyflow/react";
import { Text, Container, MOTION } from "../../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "fast-deep-equal";

import { NodeData } from "../../../stores/NodeData";
import { useNodeResultValue } from "../../../hooks/nodes/useNodeExecState";
import { useAssetStore } from "../../../stores/AssetStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { createAssetFile } from "../../../utils/createAssetFile";
import { tableStyles } from "../../../styles/TableStyles";
import OutputRenderer from "../OutputRenderer";
import { getPreviewNodeSelectionSx } from "../selectionStyles";
import { NodeHeader } from "../NodeHeader";
import NodeResizeHandle from "../NodeResizeHandle";
import { NodeOutputs } from "../NodeOutputs";
import PreviewActions from "./PreviewActions";
import { downloadPreviewAssets } from "../../../utils/downloadPreviewAssets";
import { useSyncEdgeSelection } from "../../../hooks/nodes/useSyncEdgeSelection";
import useMetadataStore from "../../../stores/MetadataStore";
import { NODE_COLLAPSED_LAYOUT } from "../../../styles/collapsedNodeTokens";
import {
  assetsToPreviewValue,
  useNodeResultHistory
} from "../../../hooks/nodes/useNodeResultHistory";
import { useNodes } from "../../../contexts/NodeContext";

const styles = (theme: Theme) =>
  css([
    {
      "&": {
        display: "flex",
        flexDirection: "column",
        overflow: "visible",
        padding: 0,
        width: "100%",
        height: "100%",
        minWidth: "150px",
        maxWidth: "unset",
        minHeight: "80px",
        borderRadius: "calc(var(--rounded-node) - 1px)",
        border: `1px solid ${theme.vars.palette.grey[700]}`
      },
      "&.preview-node": {
        padding: 0,
        margin: 0,
        "&.collapsed": {
          ...NODE_COLLAPSED_LAYOUT
        },
        /* Fragment children flatten: hide everything except target handle + header strip */
        "&.collapsed .preview-node-content > *:not(.react-flow__handle):not(.node-header)": {
          display: "none !important"
        },
        label: {
          display: "none"
        }
      },
      ".preview-node-content": {
        height: "100%",
        width: "100%",
        backgroundColor: "transparent",
        display: "flex",
        position: "relative",
        overflow: "visible",
        flexDirection: "column"
      },
      ".preview-node-content .content": {
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 0
      },
      ".preview-node-content > .content": {
        flex: 1,
        minHeight: 0,
        height: "100%"
      },
      ".preview-node-content > .content > *": {
        flex: 1,
        minHeight: 0,
        width: "100%"
      },
      ".preview-node-content > .output": {
        flex: 1,
        minHeight: 0,
        height: 0,
        overflow: "hidden"
      },
      ".preview-node-content .content .output": {
        fontSize: theme.vars.fontSizeSmaller + " !important"
      },
      ".preview-node-content > .content.scrollable": {
        overflowY: "auto",
        overflowX: "hidden"
      },
      ".preview-node-content > .content.scrollable::-webkit-scrollbar": {
        width: "6px"
      },
      ".preview-node-content > .content.scrollable::-webkit-scrollbar-thumb": {
        backgroundColor: theme.vars.palette.grey[500],
        borderRadius: "var(--rounded-md)"
      },
      ".preview-node-content > .content.scrollable::-webkit-scrollbar-track": {
        backgroundColor: "transparent"
      },
      // table
      ".preview-node-content .content .tabulator-cell": {
        fontSize: theme.vars.fontSizeTiny + " !important"
      },
      ".preview-node-content .content .tabulator-col-resize-handle,.preview-node-content .content .tabulator-row":
        {
          height: "fit-content !important"
        },
      // header — keep full hit target; stack above NodeOutputs' right column (z-index 3)
      ".node-header": {
        position: "relative",
        zIndex: 4,
        width: "100%",
        minHeight: "unset",
        top: 0,
        left: 0,
        margin: 0,
        padding: 0,
        border: 0
      },
      "& .react-flow__resize-control.handle.bottom.right": {
        opacity: 0,
        position: "absolute",
        right: "-8px",
        bottom: "-9px",
        transition: `opacity ${MOTION.normal}`
      },
      "&:hover .react-flow__resize-control.handle.bottom.right": {
        opacity: 1
      },
      "&:hover .actions": {
        opacity: 1
      },
      ".actions": {
        opacity: 0,
        position: "absolute",
        display: "flex",
        gap: ".5em",
        top: "unset",
        bottom: ".1em",
        left: "1em",
        width: "calc(100% - 2em)",
        zIndex: 10,
        transition: `opacity ${MOTION.normal}`
      },
      ".actions .action-button.copy": {
        marginLeft: "auto"
      },
      ".preview-node-content > .actions button": {
        color: theme.vars.palette.grey[200],
        borderRadius: ".1em",
        backgroundColor: theme.vars.palette.grey[600],
        width: "17px",
        height: "17px",
        margin: 0,
        padding: 0,
        minWidth: "unset",
        "&:hover": {
          color: "var(--palette-primary-main)"
        },
        "& svg": {
          width: "100%",
          height: "100%"
        }
      },
      ".hint": {
        position: "absolute",
        opacity: 0,
        textAlign: "center",
        top: "50px",
        left: "50%",
        width: "80%",
        fontSize: "var(--fontSizeSmaller)",
        fontWeight: 400,
        transform: "translate(-50%, -50%)",
        zIndex: 0,
        color: theme.vars.palette.grey[200],
        transition: "opacity 0.2s 1s ease-out"
      },
      "&:hover .hint": {
        opacity: 0.7
      },
      "& .tensor": {
        width: "100%",
        maxHeight: "500px",
        overflowY: "auto",
        padding: "1em"
      }
    },
    tableStyles(theme)
  ]);

const getOutputFromResult = (result: unknown): unknown => {
  if (result === null || result === undefined) {
    return null;
  }

  if (Array.isArray(result)) {
    const outputs = result.map((item: unknown) => {
      if (
        item &&
        typeof item === "object" &&
        "output" in item &&
        (item as Record<string, unknown>).output !== undefined
      ) {
        return (item as Record<string, unknown>).output;
      }
      return item;
    });

    if (outputs.every((output): output is string => typeof output === "string")) {
      return outputs.join("\n");
    }
    return outputs;
  }

  if (
    typeof result === "object" &&
    result !== null &&
    "output" in result &&
    (result as Record<string, unknown>).output !== undefined
  ) {
    return (result as Record<string, unknown>).output;
  }

  return result;
};

const getCopySource = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    const flattened = value.map((item) => getCopySource(item));
    if (flattened.every((entry): entry is string => typeof entry === "string")) {
      return flattened.join("\n");
    }
    return flattened;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as Record<string, unknown>).type === "text" &&
    typeof (value as Record<string, unknown>).data === "string"
  ) {
    return (value as Record<string, unknown>).data;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "output" in value &&
    (value as Record<string, unknown>).output !== undefined
  ) {
    return getCopySource((value as Record<string, unknown>).output);
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    (value as Record<string, unknown>).value !== undefined
  ) {
    return getCopySource((value as Record<string, unknown>).value);
  }

  return value;
};

interface PreviewNodeProps extends NodeProps {
  data: NodeData;
  id: string;
}

const PreviewNode: React.FC<PreviewNodeProps> = (props) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const createAsset = useAssetStore((state) => state.createAsset);
  const hasParent = props.parentId !== undefined;
  const [isContentFocused, setIsContentFocused] = useState(false);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const nodeMetadata = getMetadata(props.type);
  const { getEdges } = useReactFlow();

  const incomingValueEdge = useMemo(
    () =>
      getEdges().find(
        (edge) => edge.target === props.id && edge.targetHandle === "value"
      ),
    [getEdges, props.id]
  );

  // The connected source node's accumulated output is the single source.
  // PreviewNode no longer emits a redundant `preview_update` for itself —
  // the runner's `output_update` for the source already carries the value.
  const rawSourceNodeValue = useNodeResultValue(
    props.data.workflow_id,
    incomingValueEdge?.source ?? "",
    incomingValueEdge?.sourceHandle ?? undefined
  );
  const sourceNodeValue = incomingValueEdge?.source ? rawSourceNodeValue : undefined;

  // The kernel intentionally skips `output_update` for `nodetool.input.*`
  // and `nodetool.constant.*` nodes (runner.ts) since the client already
  // holds their value as a property. Read it directly so previewing those
  // sources works without a workflow run.
  const sourcePropertyValue = useNodes((state) => {
    const sourceNodeId = incomingValueEdge?.source;
    if (!sourceNodeId) return undefined;
    const node = state.findNode(sourceNodeId);
    const type = node?.type;
    if (
      !type ||
      (!type.startsWith("nodetool.input.") &&
        !type.startsWith("nodetool.constant."))
    ) {
      return undefined;
    }
    return (node?.data.properties as Record<string, unknown> | undefined)
      ?.value;
  }, isEqual);

  // DB fallback: when no live value is available (page reload or workflow
  // switch), surface every saved asset from the source's most recent job
  // so the preview reflects the latest workflow execution in full.
  const { lastJobAssets: sourceLastJobAssets } = useNodeResultHistory(
    props.data.workflow_id,
    incomingValueEdge?.source ?? null
  );
  const sourceFallbackValue = useMemo(
    () => assetsToPreviewValue(sourceLastJobAssets),
    [sourceLastJobAssets]
  );

  const displayResult = useMemo(
    // Show every generation from the latest execution; for streaming
    // outputs (e.g. `num_images=N`) this is the array accumulated under
    // outputResults during the run.
    () => sourceNodeValue ?? sourcePropertyValue ?? sourceFallbackValue,
    [sourceNodeValue, sourcePropertyValue, sourceFallbackValue]
  );

  const previewOutput = useMemo(
    () => getOutputFromResult(displayResult),
    [displayResult]
  );

  const memoizedOutputRenderer = useMemo(() => {
    return displayResult !== undefined ? (
      <OutputRenderer value={displayResult} showTextActions={false} />
    ) : null;
  }, [displayResult]);

  const copyPayloadSource = useMemo(
    () => getCopySource(previewOutput ?? displayResult ?? null),
    [previewOutput, displayResult]
  );

  const handleAddToAssets = useCallback(async () => {
    if (previewOutput === null || previewOutput === undefined) {
      console.warn("No result output to add to assets");
      return;
    }

    try {
      const assetFiles = await createAssetFile(previewOutput, props.id);
      await Promise.all(assetFiles.map(({ file }) => createAsset(file)));

      addNotification({
        type: "success",
        content: `${assetFiles.length} file(s) added to assets successfully`
      });
    } catch (error) {
      console.error("Error in handleAddToAssets:", error);
      addNotification({
        type: "error",
        content: "Failed to add preview to assets"
      });
    }
  }, [previewOutput, props.id, createAsset, addNotification]);

  const handleDownload = useCallback(async () => {
    try {
      await downloadPreviewAssets({
        nodeId: props.id,
        previewValue: previewOutput,
        rawResult: displayResult
      });
      addNotification({
        type: "success",
        content: "Download started successfully"
      });
    } catch (error) {
      console.error("Error in handleDownload:", error);
      addNotification({
        type: "error",
        content: "Failed to start download"
      });
    }
  }, [previewOutput, displayResult, props.id, addNotification]);

  const handleContentFocus = useCallback(() => {
    setIsContentFocused(true);
  }, []);

  const handleContentBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget as HTMLElement | null;
      if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
        setIsContentFocused(false);
      }
    },
    []
  );

  const handleContentPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!props.selected) {
        return;
      }
      event.stopPropagation();
      const target = event.currentTarget;
      if (document.activeElement !== target) {
        target.focus();
      }
    },
    [props.selected]
  );

  const isSingleImageOrVideo = useMemo(() => {
    if (displayResult === null || displayResult === undefined) {
      return false;
    }
    const checkType = (item: unknown): boolean => {
      if (item && typeof item === "object" && "type" in item) {
        const t = (item as Record<string, unknown>).type;
        return t === "image" || t === "video";
      }
      return false;
    };
    // Only consider it "single" if it's not an array or array with 1 item
    if (Array.isArray(displayResult)) {
      return displayResult.length === 1 && checkType(displayResult[0]);
    }
    return checkType(displayResult);
  }, [displayResult]);

  const isScrollable =
    isContentFocused && displayResult !== undefined && !isSingleImageOrVideo;

  useSyncEdgeSelection(props.id, Boolean(props.selected));

  const selectionSx = useMemo(
    () => getPreviewNodeSelectionSx(theme, Boolean(props.selected)),
    [theme, props.selected]
  );

  return (
    <Container
      css={cssStyles}
      sx={selectionSx}
      className={`preview-node nopan node-drag-handle node-body ${
        hasParent ? "hasParent " : ""
      }${props.data.collapsed ? "collapsed " : ""}`}
    >
      <div className={`preview-node-content `}>
        <Handle
          id="value"
          type="target"
          position={Position.Left}
          isConnectable={true}
        />
        <>
          <NodeResizeHandle minWidth={150} minHeight={80} />
          <NodeHeader
            id={props.id}
            data={props.data}
            hasParent={hasParent}
            metadataTitle="Preview"
            selected={props.selected}
            backgroundColor={"transparent"}
            showIcon={false}
            workflowId={props.data.workflow_id}
            hideLogs={true}
          />
          {!displayResult && (
            <Text className="hint">
              Displays any data from connected nodes
            </Text>
          )}
          <PreviewActions
            onDownload={handleDownload}
            onAddToAssets={handleAddToAssets}
            copyValue={copyPayloadSource}
          />
          {nodeMetadata && (
            <NodeOutputs
              id={props.id}
              outputs={nodeMetadata.outputs}
            />
          )}
        </>
        <div
          className={`content ${
            isScrollable ? "scrollable nowheel" : "noscroll"
          } nodrag`}
          role="region"
          aria-label="Preview output"
          style={{ width: "100%", height: "100%" }}
          tabIndex={0}
          onFocus={handleContentFocus}
          onBlur={handleContentBlur}
          onPointerDown={handleContentPointerDown}
        >
          {memoizedOutputRenderer}
        </div>
      </div>
    </Container>
  );
};

export default memo(PreviewNode, isEqual);
