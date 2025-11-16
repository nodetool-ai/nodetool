/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo, useCallback, useMemo } from "react";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { Container, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import JSZip from "jszip";
import log from "loglevel";
import { isEqual } from "lodash";

import { NodeData } from "../../../stores/NodeData";
import useResultsStore from "../../../stores/ResultsStore";
import { useAssetStore } from "../../../stores/AssetStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { createAssetFile } from "../../../utils/createAssetFile";
import { hexToRgba } from "../../../utils/ColorUtils";
import { tableStyles } from "../../../styles/TableStyles";
import OutputRenderer from "../OutputRenderer";
import { NodeHeader } from "../NodeHeader";
import NodeResizeHandle from "../NodeResizeHandle";
import { useCopyToClipboard } from "../output";
import PreviewActions from "./PreviewActions";

const styles = (theme: Theme) =>
  css([
    {
      "&": {
        display: "flex",
        flexDirection: "column",
        padding: 0,
        width: "100%",
        height: "100%",
        minWidth: "150px",
        maxWidth: "1000px",
        minHeight: "150px",
        borderRadius: "var(--rounded-node)"
      },
      "&.preview-node": {
        padding: 0,
        backgroundColor: "transparent",
        margin: 0,
        "&.collapsed": {
          maxHeight: "60px"
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
        flexDirection: "column"
      },
      ".preview-node-content > .content": {
        flex: 1,
        minHeight: 0,
        height: 0,
        overflow: "hidden"
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
        borderRadius: "6px"
      },
      ".preview-node-content > .content.scrollable::-webkit-scrollbar-track": {
        backgroundColor: "transparent"
      },
      ".node-header": {
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
        transition: "opacity 0.2s"
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
        transition: "opacity 0.2s"
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
        fontWeight: "300",
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
      },
      "& .node-header .node-title": {
        textTransform: "uppercase",
        fontSize: "var(--fontSizeTiny)",
        fontFamily: "var(--fontFamily2)",
        color: "var(--palette-grey-200) !important",
        marginTop: "0.25em"
      }
    },
    tableStyles(theme)
  ]);

const getOutputFromResult = (result: any) => {
  if (!result) return null;

  if (Array.isArray(result)) {
    const outputs = result.map((item: any) => item.output);
    if (outputs.every((output: any) => typeof output === "string")) {
      return outputs.join("\n");
    }
    return outputs;
  }

  return result.output;
};

const toCopyText = (output: any): string | null => {
  if (output === null || output === undefined) {
    return null;
  }

  if (typeof output === "string") {
    return output;
  }

  if (typeof output === "number" || typeof output === "boolean") {
    return output.toString();
  }

  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return null;
  }
};

interface PreviewNodeProps extends NodeProps {
  data: NodeData;
  id: string;
}

const PreviewNode: React.FC<PreviewNodeProps> = (props) => {
  const theme = useTheme();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const createAsset = useAssetStore((state) => state.createAsset);
  const copyToClipboard = useCopyToClipboard();
  const hasParent = props.parentId !== undefined;

  const result = useResultsStore((state) =>
    state.getPreview(props.data.workflow_id, props.id)
  );

  const previewOutput = useMemo(() => getOutputFromResult(result), [result]);

  const memoizedOutputRenderer = useMemo(() => {
    return result !== undefined ? (
      <OutputRenderer value={result} showTextActions={false} />
    ) : null;
  }, [result]);

  const copyPayload = useMemo(() => toCopyText(previewOutput), [previewOutput]);
  const hasCopyableOutput = Boolean(copyPayload);

  const handleCopy = useCallback(() => {
    if (!copyPayload) {
      addNotification({
        type: "warning",
        content: "No content available to copy"
      });
      return;
    }

    copyToClipboard(copyPayload);
    addNotification({
      type: "success",
      content: "Preview copied to clipboard"
    });
  }, [copyPayload, copyToClipboard, addNotification]);

  const handleAddToAssets = useCallback(async () => {
    if (!previewOutput) {
      log.warn("No result output to add to assets");
      return;
    }

    try {
      const assetFiles = createAssetFile(previewOutput, props.id);
      for (const { file } of assetFiles) {
        await createAsset(file);
      }

      addNotification({
        type: "success",
        content: `${assetFiles.length} file(s) added to assets successfully`
      });
    } catch (error) {
      log.error("Error in handleAddToAssets:", error);
      addNotification({
        type: "error",
        content: "Failed to add preview to assets"
      });
    }
  }, [previewOutput, props.id, createAsset, addNotification]);

  const handleDownload = useCallback(async () => {
    if (!previewOutput) {
      addNotification({
        type: "warning",
        content: "No content available to download"
      });
      return;
    }

    try {
      const assetFiles = createAssetFile(previewOutput, props.id);
      const electronApi = (window as any).electron || (window as any).api;

      if (assetFiles.length === 1) {
        const { file, filename } = assetFiles[0];
        const arrayBuffer = await file.arrayBuffer();

        if (electronApi?.saveFile) {
          const result = await electronApi.saveFile(arrayBuffer, filename, [
            { name: "All Files", extensions: ["*"] }
          ]);
          if (!result.success && !result.canceled) {
            throw new Error(result.error || "Failed to save file");
          }
        } else {
          const url = URL.createObjectURL(file);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } else {
        const zip = new JSZip();
        assetFiles.forEach(({ file, filename }) => {
          zip.file(filename, file);
        });
        const content = await zip.generateAsync({ type: "arraybuffer" });
        const zipName = `preview_${props.id}.zip`;

        if (electronApi?.saveFile) {
          const result = await electronApi.saveFile(content, zipName, [
            { name: "ZIP Files", extensions: ["zip"] }
          ]);
          if (!result.success && !result.canceled) {
            throw new Error(result.error || "Failed to save file");
          }
        } else {
          const blob = new Blob([content], { type: "application/zip" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = zipName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }

      addNotification({
        type: "success",
        content: "Download started successfully"
      });
    } catch (error) {
      log.error("Error in handleDownload:", error);
      addNotification({
        type: "error",
        content: "Failed to start download"
      });
    }
  }, [previewOutput, props.id, addNotification]);

  return (
    <Container
      css={styles(theme)}
      sx={{
        display: "flex",
        border: "none",
        bgcolor: hasParent ? theme.vars.palette.c_node_bg_group : undefined,
        backgroundColor: hasParent
          ? undefined
          : (theme.vars.palette.c_node_bg as any)
          ? (theme.vars.palette.c_node_bg as string)
          : undefined,
        ...(hasParent
          ? {}
          : {
              backgroundColor: hexToRgba(
                theme.vars.palette.c_node_bg as string,
                0.6
              ),
              backdropFilter: theme.vars.palette.glass.blur,
              WebkitBackdropFilter: theme.vars.palette.glass.blur,
              boxShadow: "0 0 24px -22px rgba(0,0,0,.65)",
              borderRadius: "var(--rounded-node)"
            })
      }}
      className={`preview-node nopan node-drag-handle ${
        hasParent ? "hasParent" : ""
      } ${props.selected ? "nowheel" : ""}`}
    >
      <div className={`preview-node-content `}>
        <Handle
          style={{ top: "50%" }}
          id="value"
          type="target"
          position={Position.Left}
          isConnectable={true}
        />
        <>
          <NodeResizeHandle minWidth={150} minHeight={150} />
          <NodeHeader
            id={props.id}
            data={props.data}
            hasParent={hasParent}
            metadataTitle="Preview"
            selected={props.selected}
            backgroundColor={theme.vars.palette.primary.main}
            iconType={"any"}
            iconBaseColor={theme.vars.palette.primary.main}
          />
          {!result && (
            <Typography className="hint">
              Displays any data from connected nodes
            </Typography>
          )}
          <PreviewActions
            onCopy={handleCopy}
            onDownload={handleDownload}
            onAddToAssets={handleAddToAssets}
            canCopy={hasCopyableOutput}
          />
        </>

        <Handle
          style={{ top: "50%" }}
          id="value"
          type="target"
          position={Position.Left}
          isConnectable={true}
        />
        <div className={`content ${props.selected ? "scrollable" : ""}`}>
          {memoizedOutputRenderer}
        </div>
      </div>
    </Container>
  );
};

export default memo(PreviewNode, isEqual);
