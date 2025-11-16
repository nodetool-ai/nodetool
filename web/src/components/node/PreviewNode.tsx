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
import { hexToRgba } from "../../utils/ColorUtils";
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
import { typeFor } from "./output";

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
        overflow: "hidden"
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
        zIndex: 10,
        transition: "opacity 0.2s"
      },
      ".actions button": {
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
        color: "var(--palette-grey-200) !important",
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
    state.getPreview(props.data.workflow_id, props.id)
  );

  const memoizedOutputRenderer = useMemo(() => {
    return result !== undefined ? <OutputRenderer value={result} /> : null;
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

    // If result is an array
    if (Array.isArray(result)) {
      // Check if array items have 'output' property
      if (result.length > 0 && result[0]?.output !== undefined) {
        const outputs = result.map((item: any) => item.output);
        // If all outputs are strings, concatenate them
        if (outputs.every((output: any) => typeof output === "string")) {
          return outputs.join("\n");
        }
        // For non-string outputs, return the array of outputs
        return outputs;
      }
      // If array items don't have 'output' property, return the array as-is
      return result;
    }

    // If result has an 'output' property, use it
    if (result && typeof result === "object" && "output" in result) {
      return result.output;
    }

    // Otherwise, result is already the output value
    return result;
  };

  const handleAddToAssets = async () => {
    log.debug("handleAddToAssets - result:", result);
    
    // Check if result exists
    if (!result) {
      log.warn("No result available to add to assets");
      addNotification({
        type: "warning",
        content: "No preview result available. Please run the workflow first."
      });
      return;
    }
    
    const output = getOutputFromResult(result);
    log.debug("handleAddToAssets - extracted output:", output);
    
    // Check if output is valid (not null, undefined, empty object, or empty array)
    if (!output || 
        (typeof output === "object" && !Array.isArray(output) && Object.keys(output).length === 0) ||
        (Array.isArray(output) && output.length === 0)) {
      log.warn("No valid output to add to assets. Result:", result, "Output:", output);
      addNotification({
        type: "warning",
        content: "No content available to add to assets"
      });
      return;
    }
    
    try {
        // Normalize output structure to ensure it has 'type' property
        const normalizeOutput = async (value: any): Promise<any> => {
          if (Array.isArray(value)) {
            return Promise.all(value.map(normalizeOutput));
          }
          // If it already has a type property, check if we need to fetch URI data
          if (value && typeof value === "object" && "type" in value) {
            // If it has a URI but no data, fetch the data
            if (value.uri && !value.data && typeof value.uri === "string") {
              // Handle data URIs (base64 encoded)
              if (value.uri.startsWith("data:")) {
                try {
                  const base64Data = value.uri.split(",")[1];
                  const binaryString = atob(base64Data);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  return { ...value, data: bytes };
                } catch (dataUriError) {
                  log.error("Failed to parse data URI:", dataUriError);
                  throw new Error("Failed to parse data URI");
                }
              } else {
                // Fetch from HTTP/HTTPS URL
                try {
                  const response = await fetch(value.uri);
                  const blob = await response.blob();
                  const arrayBuffer = await blob.arrayBuffer();
                  return { ...value, data: new Uint8Array(arrayBuffer) };
                } catch (fetchError) {
                  log.error("Failed to fetch data from URI:", fetchError);
                  throw new Error("Failed to fetch data from URI");
                }
              }
            }
            return value;
          }
          // Otherwise, infer the type and wrap it
          const type = typeFor(value);
          // Handle ImageRef, AudioRef, VideoRef structures
          if (type === "object" && (value?.uri || value?.data)) {
            // Determine media type from content_type or URI
            let mediaType = "image";
            if (value?.content_type) {
              if (value.content_type.includes("audio")) mediaType = "audio";
              else if (value.content_type.includes("video")) mediaType = "video";
              else if (value.content_type.includes("image")) mediaType = "image";
            } else if (value?.uri) {
              if (value.uri.includes("audio") || value.uri.match(/\.(mp3|wav|ogg)$/i)) {
                mediaType = "audio";
              } else if (value.uri.includes("video") || value.uri.match(/\.(mp4|webm|ogg)$/i)) {
                mediaType = "video";
              }
            }
            
            // If we have a URI but no data, fetch it
            if (value.uri && !value.data && typeof value.uri === "string") {
              // Handle data URIs (base64 encoded)
              if (value.uri.startsWith("data:")) {
                try {
                  const base64Data = value.uri.split(",")[1];
                  const binaryString = atob(base64Data);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  return { type: mediaType, data: bytes, uri: value.uri };
                } catch (dataUriError) {
                  log.error("Failed to parse data URI:", dataUriError);
                  throw new Error(`Failed to parse ${mediaType} data URI`);
                }
              } else {
                // Fetch from HTTP/HTTPS URL
                try {
                  const response = await fetch(value.uri);
                  const blob = await response.blob();
                  const arrayBuffer = await blob.arrayBuffer();
                  return { type: mediaType, data: new Uint8Array(arrayBuffer), uri: value.uri };
                } catch (fetchError) {
                  log.error("Failed to fetch data from URI:", fetchError);
                  throw new Error(`Failed to fetch ${mediaType} data from URI`);
                }
              }
            }
            
            return { type: mediaType, data: value.data, uri: value.uri };
          }
          // For other types, wrap with inferred type
          return { type, data: value };
        };

        const normalizedOutput = await normalizeOutput(output);
        const assetFiles = createAssetFile(normalizedOutput, props.id);
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
          content: error instanceof Error ? error.message : "Failed to add preview to assets"
        });
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
      sx={{
        // display: parentIsCollapsed ? "none" : "flex",
        display: "flex",
        border: "none",
        bgcolor: hasParent ? theme.vars.palette.c_node_bg_group : undefined,
        backgroundColor: hasParent
          ? undefined
          : (theme.vars.palette.c_node_bg as any)
          ? (theme.vars.palette.c_node_bg as string)
          : undefined,
        // Glass look (only outside groups)
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
      className={`preview-node nopan nodwheel node-drag-handle ${
        hasParent ? "hasParent" : ""
      }`}
    >
      <div
        className={`preview-node-content ${result?.output ? "nowheel" : ""}`}
      >
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
          style={{ top: "50%" }}
          id="value"
          type="target"
          position={Position.Left}
          isConnectable={true}
        />
        <div className="content">{memoizedOutputRenderer}</div>
      </div>
    </Container>
  );
};

export default memo(PreviewNode, isEqual);
