/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo, useCallback, useMemo, useState } from "react";
import { NodeProps } from "@xyflow/react";
import { getCopySource, getOutputFromResult } from "../outputResult";
import { Container, CheckerDropzone, MOTION, BORDER_RADIUS, Z_INDEX, getSpacingPx, SPACING } from "../../ui_primitives";
import OutputIcon from "@mui/icons-material/Output";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "../../../utils/isEqual";

import { NodeData } from "../../../stores/NodeData";
import { useNodeGenerations } from "../../../hooks/nodes/useNodeGenerations";
import useResultsStore from "../../../stores/ResultsStore";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import { outputOf } from "../../../utils/nodeGenerations";
import { useAssetStore } from "../../../stores/AssetStore";
import { useNotificationStore } from "../../../stores/NotificationStore";

import { createAssetFile } from "../../../utils/createAssetFile";
import { tableStyles } from "../../../styles/TableStyles";
import OutputRenderer from "../OutputRenderer";
import { getOutputNodeSelectionSx } from "../selectionStyles";
import { NodeHeader, NODE_HEADER_MIN_HEIGHT } from "../NodeHeader";
import NodeResizeHandle from "../NodeResizeHandle";
import { NodeInputs } from "../NodeInputs";
import HandleColumn from "../HandleColumn";
import PreviewActions from "../PreviewNode/PreviewActions";
import { downloadPreviewAssets } from "../../../utils/downloadPreviewAssets";
import { useSyncEdgeSelection } from "../../../hooks/nodes/useSyncEdgeSelection";
import useMetadataStore from "../../../stores/MetadataStore";
import { NODE_COLLAPSED_LAYOUT } from "../../../styles/collapsedNodeTokens";
import { isObjectLike } from "../../../utils/typePredicates";

const styles = (theme: Theme) =>
  css([
    {
      // This node pins its handles to the header row, whose title names
      // them; a handle label there would sit on the title and its actions.
      "& .handle-label": {
        display: "none"
      },
      "&": {
        display: "flex",
        flexDirection: "column",
        overflow: "visible",
        width: "100%",
        height: "100%",
        minWidth: "150px",
        maxWidth: "unset",
        minHeight: "150px",
        borderRadius: theme.rounded.node,
        border: `1px solid ${theme.vars.palette.grey[700]}`
      },
      // The body padding of every other node, so the header and the content
      // sit where they do on a base node. `.react-flow__node .node-body`
      // (nodes.base.css) resets the padding at equal specificity and loads
      // later, so the class is doubled to outrank it.
      ".react-flow__node &&": {
        "--node-body-padding": "8px",
        padding: "var(--node-body-padding)"
      },
      "&.output-node": {
        margin: 0,
        "&.collapsed": {
          ...NODE_COLLAPSED_LAYOUT,
          "--node-body-padding": "0px",
          padding: "0 !important"
        },
        "&.collapsed .node-header ~ *": {
          display: "none !important"
        },
        label: {
          display: "none"
        }
      },
      // Fills the body: `height: 100%` alone resolves to auto while the node
      // has no explicit height, which left the empty state short.
      ".output-node-content": {
        flex: "1 1 auto",
        minHeight: 0,
        height: "100%",
        width: "100%",
        backgroundColor: "transparent",
        display: "flex",
        position: "relative",
        overflow: "visible",
        flexDirection: "column"
      },
      ".output-node-content .content": {
        flex: "1 1 auto",
        minHeight: 0,
        overflow: "hidden"
      },
      ".output-node-content > .output": {
        flex: 1,
        minHeight: 0,
        height: 0,
        overflow: "hidden"
      },
      ".output-node-content .content .output": {
        fontSize: theme.vars.fontSizeSmaller + " !important"
      },
      ".output-node-content > .content.scrollable": {
        overflowY: "auto",
        overflowX: "hidden"
      },
      ".output-node-content > .content.scrollable::-webkit-scrollbar": {
        width: "6px"
      },
      ".output-node-content > .content.scrollable::-webkit-scrollbar-thumb": {
        backgroundColor: theme.vars.palette.grey[500],
        borderRadius: BORDER_RADIUS.md
      },
      ".output-node-content > .content.scrollable::-webkit-scrollbar-track": {
        backgroundColor: "transparent"
      },
      // table
      ".output-node-content .content .tabulator-cell": {
        fontSize: theme.vars.fontSizeSmaller + " !important"
      },
      ".output-node-content .content .tabulator-col-resize-handle,.output-node-content .content .tabulator-row":
      {
        height: "fit-content !important"
      },
      // The same header as every other node; the input handle sits on the
      // first row below it, as a node's first input does.
      ".node-header": {
        width: "100%",
        margin: 0,
        border: 0
      },
      ".handle-column.handle-column--header": {
        top: `calc(${NODE_HEADER_MIN_HEIGHT}px + ${getSpacingPx(SPACING.xs)})`
      },
      // Without inline fields the inputs row is empty; its margins would
      // push the output down from the header.
      ".output-node-content > .node-inputs:empty": {
        display: "none"
      },
      ".output-node-content > .content": {
        marginTop: getSpacingPx(SPACING.xs)
      },
      ".media-aspect-resize-handle .resize-grip": {
        opacity: 0,
        transition: `opacity ${MOTION.normal}`
      },
      "&:hover .media-aspect-resize-handle .resize-grip": {
        opacity: 0.6
      },
      ".media-aspect-resize-handle .resize-grip:hover, .media-aspect-resize-handle .resize-grip:active":
        {
          opacity: 1
        },
      "&:hover .actions": {
        opacity: 1
      },
      ".actions": {
        opacity: 0,
        position: "absolute",
        display: "flex",
        gap: getSpacingPx(SPACING.md),
        top: "unset",
        bottom: ".1em",
        left: "1em",
        width: "calc(100% - 2em)",
        zIndex: Z_INDEX.dropdown,
        transition: `opacity ${MOTION.normal}`
      },
      ".actions .action-button.copy": {
        marginLeft: "auto"
      },
      ".output-node-content > .actions button": {
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
      "& .tensor": {
        width: "100%",
        maxHeight: "500px",
        overflowY: "auto",
        padding: getSpacingPx(SPACING.xl)
      },
      // Ensure image action buttons show on hover
      "&:hover .image-view-actions": {
        opacity: 1
      },
      "&:hover .tile-actions": {
        opacity: 1
      },
      "& .image-output:hover .image-view-actions": {
        opacity: 1
      },
      "& .tile:hover .tile-actions": {
        opacity: 1
      },
      // Touch devices have no hover; keep the output action buttons reachable.
      "@media (pointer: coarse)": {
        ".actions": { opacity: 1 },
        ".image-view-actions": { opacity: 1 },
        ".tile-actions": { opacity: 1 },
        ".media-aspect-resize-handle .resize-grip": { opacity: 0.6 }
      }
    },
    tableStyles(theme)
  ]);

interface OutputNodeProps extends NodeProps {
  data: NodeData;
  id: string;
}

const CONTENT_DIV_STYLE = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column" as const
};

/**
 * OutputNode - A custom ReactFlow node for displaying workflow outputs.
 * Similar to PreviewNode but uses output results from ResultsStore.
 * This displays streaming outputs accumulated via output_update messages.
 */
const OutputNode: React.FC<OutputNodeProps> = (props) => {
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

  const { inlineFieldProps, inputFieldProps } = useMemo(() => {
    if (!nodeMetadata) return { inlineFieldProps: [], inputFieldProps: [] };
    const inlineNames = nodeMetadata.inline_fields ?? [];
    const inputNames = nodeMetadata.input_fields ?? [];
    return {
      inlineFieldProps: nodeMetadata.properties.filter((p) =>
        inlineNames.includes(p.name)
      ),
      inputFieldProps: nodeMetadata.properties.filter((p) =>
        inputNames.includes(p.name)
      )
    };
  }, [nodeMetadata]);

  // Live display reads the output-node stream buffer (outputResults), which
  // output_update appends to during a run, scoped to the focused job. When no
  // live stream exists (e.g. after reopening the workflow) we fall back to the
  // settled value from the node's generation timeline.
  const workflowId = props.data.workflow_id;
  const focusedJob = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  const streamBuffer = useResultsStore((s) =>
    focusedJob
      ? s.getOutputResult(workflowId, focusedJob, props.id)
      : undefined
  );
  const { current } = useNodeGenerations(workflowId, props.id);
  const settledValue = useMemo(
    () => (current ? outputOf(current) : undefined),
    [current]
  );
  const result = streamBuffer !== undefined ? streamBuffer : settledValue;

  const outputValue = useMemo(() => getOutputFromResult(result), [result]);

  const memoizedOutputRenderer = useMemo(() => {
    return result !== undefined ? (
      <OutputRenderer value={result} showTextActions={false} />
    ) : null;
  }, [result]);

  const copyPayloadSource = useMemo(
    () => getCopySource(outputValue ?? result ?? null),
    [outputValue, result]
  );

  const handleAddToAssets = useCallback(async () => {
    if (outputValue === null || outputValue === undefined) {
      console.warn("No result output to add to assets");
      return;
    }

    try {
      const assetFiles = await createAssetFile(outputValue, props.id);
      await Promise.all(assetFiles.map(({ file }) => createAsset(file)));

      addNotification({
        type: "success",
        content: `${assetFiles.length} file${
          assetFiles.length === 1 ? "" : "s"
        } added to assets`
      });
    } catch (error) {
      console.error("Error in handleAddToAssets:", error);
      addNotification({
        type: "error",
        content: "Failed to add output to assets"
      });
    }
  }, [outputValue, props.id, createAsset, addNotification]);

  const handleDownload = useCallback(async () => {
    try {
      await downloadPreviewAssets({
        nodeId: props.id,
        previewValue: outputValue,
        rawResult: result
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
  }, [outputValue, result, props.id, addNotification]);

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
      event.stopPropagation();
      const target = event.currentTarget;
      if (document.activeElement !== target) {
        target.focus();
      }
    },
    []
  );

  const isSingleImageOrVideo = useMemo(() => {
    if (result === null || result === undefined) {
      return false;
    }
    const checkType = (item: unknown): boolean => {
      if (item && isObjectLike(item) && "type" in item) {
        const t = (item as Record<string, unknown>).type;
        return t === "image" || t === "video";
      }
      return false;
    };
    // Only consider it "single" if it's not an array or array with 1 item
    if (Array.isArray(result)) {
      return result.length === 1 && checkType(result[0]);
    }
    return checkType(result);
  }, [result]);

  const isScrollable =
    isContentFocused && result !== undefined && !isSingleImageOrVideo;

  useSyncEdgeSelection(props.id, Boolean(props.selected));

  return (
    <Container
      css={cssStyles}
      sx={getOutputNodeSelectionSx(theme, Boolean(props.selected))}
      className={`output-node nopan node-drag-handle node-body ${
        hasParent ? "hasParent " : ""
      }${props.data.collapsed ? "collapsed " : ""}`}
    >
      <div className={`output-node-content `}>
        <>
          <NodeResizeHandle
            minWidth={150}
            minHeight={150}
            nodeId={props.id}
            contentAware
          />
          <NodeHeader
            id={props.id}
            data={props.data}
            hasParent={hasParent}
            metadataTitle="Output"
            selected={props.selected}
            backgroundColor={theme.vars.palette.info.main}
            iconType={nodeMetadata?.properties?.[0]?.type?.type ?? "any"}
            iconBaseColor={theme.vars.palette.info.main}
            workflowId={props.data.workflow_id}
            hideLogs={true}
          />

          {nodeMetadata && (
              <>
                <HandleColumn
                  id={props.id}
                  properties={inputFieldProps}
                  layout="header"
                />
                <NodeInputs
                  id={props.id}
                  nodeMetadata={nodeMetadata}
                  layout={nodeMetadata.layout}
                  properties={inlineFieldProps}
                  nodeType={props.type}
                  data={props.data}
                  showHandle={false}
                  showFields={true}
                />
              </>
          )}

          <PreviewActions
            onDownload={handleDownload}
            onAddToAssets={handleAddToAssets}
            copyValue={copyPayloadSource}
          />
        </>

        <div
          className={`content ${isScrollable ? "scrollable nowheel" : "noscroll"
            }`}
          role="region"
          aria-label="Node output"
          style={CONTENT_DIV_STYLE}
          tabIndex={0}
          onFocus={handleContentFocus}
          onBlur={handleContentBlur}
          onPointerDown={handleContentPointerDown}
        >
          {result === null || result === undefined ? (
            <CheckerDropzone
              message="Run to see the output"
              icon={<OutputIcon />}
            />
          ) : (
            memoizedOutputRenderer
          )}
        </div>
      </div>
    </Container>
  );
};

export default memo(OutputNode, isEqual);
