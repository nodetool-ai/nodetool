/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo } from "react";
import { NodeProps } from "@xyflow/react";
import { Container, Typography } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import React, { useMemo } from "react";
import { NodeHeader } from "../node/NodeHeader";
import OutputRenderer from "./OutputRenderer";
import useResultsStore from "../../stores/ResultsStore";
import { Position, Handle } from "@xyflow/react";
import { tableStyles } from "../../styles/TableStyles";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Button, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import log from "loglevel";
import { createAssetFile } from "../../utils/createAssetFile";
import JSZip from "jszip";
import { isEqual } from "lodash";
import NodeResizeHandle from "./NodeResizeHandle";

const styles = (theme: Theme) =>
  css([
    {
      "&": {
        display: "flex",
        flexDirection: "column",
        padding: 0,
        backgroundColor: theme.palette.grey[600],
        width: "100%",
        height: "100%",
        minWidth: "150px",
        maxWidth: "1000px",
        minHeight: "150px",
        borderRadius: "2px"
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
        width: "100%"
      },
      ".node-header": {
        width: "100%",
        minHeight: "unset",
        height: "20px",
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
        zIndex: 10,
        transition: "opacity 0.2s"
      },
      ".actions button": {
        color: theme.palette.grey[200],
        borderRadius: ".1em",
        backgroundColor: theme.palette.grey[600],

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
        color: theme.palette.grey[200],
        transition: "opacity 0.2s 1s ease-out"
      },
      "&:hover .hint": {
        opacity: 0.7
      },
      // tensor
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
        color: theme.palette.grey[200],
        marginTop: "0.25em"
      }
    },
    tableStyles(theme)
  ]);

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
  // const node = useNodes(
  //   useCallback((state) => state.findNode(props.id), [props.id])
  // );
  const hasParent = props.parentId !== undefined;
  // const parentNode = useNodes(
  //   useCallback(
  //     (state) => (hasParent ? state.findNode(node?.parentId || "") : null),
  //     [hasParent, node?.parentId]
  //   )
  // );
  const result = useResultsStore((state) =>
    state.getResult(props.data.workflow_id, props.id)
  );

  const memoizedOutputRenderer = useMemo(() => {
    return result !== undefined ? (
      <OutputRenderer
        value={
          Array.isArray(result)
            ? result.map((i: any) => i.output)
            : result.output
        }
      />
    ) : null;
  }, [result]);

  // const [parentIsCollapsed, setParentIsCollapsed] = useState(false);
  // useEffect(() => {
  //   // Set parentIsCollapsed state based on parent node
  //   if (hasParent) {
  //     setParentIsCollapsed(parentNode?.data.collapsed || false);
  //   }
  // }, [hasParent, node?.parentId, parentNode?.data.collapsed]);

  // if (parentIsCollapsed) {
  //   return null;
  // }

  const getOutputFromResult = (result: any) => {
    if (!result) return null;

    if (Array.isArray(result)) {
      const outputs = result.map((item: any) => item.output);
      // If all outputs are strings, concatenate them
      if (outputs.every((output: any) => typeof output === "string")) {
        return outputs.join("\n");
      }
      // For non-string outputs, return the array of outputs
      return outputs;
    }

    return result.output;
  };

  const handleAddToAssets = async () => {
    const output = getOutputFromResult(result);
    if (output) {
      try {
        const assetFiles = createAssetFile(output, props.id);
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
    } else {
      log.warn("No result output to add to assets");
    }
  };

  const handleDownload = async () => {
    const output = getOutputFromResult(result);
    if (output) {
      try {
        const assetFiles = createAssetFile(output, props.id);

        // Check for Electron's API (could be window.electron or window.api)
        const electronApi = (window as any).electron || (window as any).api;

        if (assetFiles.length === 1) {
          // Single file download
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
            // Browser fallback
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
          // Multiple files - create a zip
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
            // Browser fallback
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
    } else {
      log.warn("No result output to download");
      addNotification({
        type: "warning",
        content: "No content available to download"
      });
    }
  };

  return (
    <Container
      css={styles(theme)}
      style={{
        // display: parentIsCollapsed ? "none" : "flex",
        display: "flex",
        border: theme.palette.mode === "light" ? "1px solid #ccc" : "none",
        backgroundColor: hasParent
          ? theme.palette.c_node_bg_group
          : theme.palette.c_node_bg
      }}
      className={`preview-node nopan nodwheel node-drag-handle ${
        hasParent ? "hasParent" : ""
      }`}
    >
      <div
        className={`preview-node-content ${result?.output ? "nowheel" : ""}`}
      >
        <Handle
          style={{ top: "50%", backgroundColor: "white" }}
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
          />
          {!result?.output && (
            <Typography className="hint">
              Displays any data from connected nodes
            </Typography>
          )}
          <div className="actions">
            <Tooltip title="Download">
              <Button
                onClick={handleDownload}
                className="action-button download"
                tabIndex={-1}
              >
                <FileDownloadIcon />
              </Button>
            </Tooltip>
            <Tooltip title="Add to Assets">
              <Button
                onClick={handleAddToAssets}
                className="action-button"
                tabIndex={-1}
              >
                <AddIcon />
              </Button>
            </Tooltip>
          </div>
        </>

        <Handle
          style={{ top: "50%", backgroundColor: "white" }}
          id="value"
          type="target"
          position={Position.Left}
          isConnectable={true}
        />
        {memoizedOutputRenderer}
      </div>
    </Container>
  );
};

export default memo(PreviewNode, isEqual);
