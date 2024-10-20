/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useCallback, useEffect, useState } from "react";
import { NodeProps, NodeResizeControl } from "@xyflow/react";
import { Container, Typography } from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import SouthEastIcon from "@mui/icons-material/SouthEast";
import React, { useMemo } from "react";
import { NodeHeader } from "../node/NodeHeader";
import OutputRenderer from "./OutputRenderer";
import useResultsStore from "../../stores/ResultsStore";
import { Position, Handle } from "@xyflow/react";
import { tableStyles } from "../../styles/TableStyles";
import ThemeNodes from "../themes/ThemeNodes";
import { useNodeStore } from "../../stores/NodeStore";
import { Button, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { devLog, devWarn, devError } from "../../utils/DevLog";
import { createAssetFile } from "../../utils/createAssetFile";
import JSZip from "jszip";
import { isEqual } from "lodash";

const styles = (theme: any) =>
  css([
    {
      "&": {
        display: "flex",
        flexDirection: "column",
        padding: 0,
        backgroundColor: theme.palette.c_gray2,
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
        color: theme.palette.c_gray5,
        borderRadius: ".1em",
        backgroundColor: theme.palette.c_gray2,

        width: "17px",
        height: "17px",
        margin: 0,
        padding: 0,
        minWidth: "unset",
        "&:hover": {
          color: theme.palette.c_hl1
        },
        "& svg": {
          width: "100%",
          height: "100%"
        }
      },
      ".description": {
        position: "absolute",
        opacity: 0,
        textAlign: "center",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 0,
        fontFamily: theme.fontFamily2,
        width: "100%",
        color: theme.palette.c_gray5
      },
      "&:hover .description": {
        opacity: 1
      },
      // tensor
      "& .tensor": {
        width: "100%",
        maxHeight: "500px",
        overflowY: "auto",
        padding: "1em"
      }
    },
    tableStyles(theme)
  ]);

interface PreviewNodeProps extends NodeProps {
  data: NodeData;
  id: string;
}

const PreviewNode: React.FC<PreviewNodeProps> = (props) => {
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const createAsset = useAssetStore((state) => state.createAsset);
  // const node = useNodeStore(
  //   useCallback((state) => state.findNode(props.id), [props.id])
  // );
  const hasParent = props.parentId !== undefined;
  // const parentNode = useNodeStore(
  //   useCallback(
  //     (state) => (hasParent ? state.findNode(node?.parentId || "") : null),
  //     [hasParent, node?.parentId]
  //   )
  // );
  const result = useResultsStore((state) =>
    state.getResult(props.data.workflow_id, props.id)
  );

  const memoizedOutputRenderer = useMemo(() => {
    return result?.output ? <OutputRenderer value={result.output} /> : null;
  }, [result?.output]);

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

  const handleAddToAssets = async () => {
    devLog("handleAddToAssets called");
    if (result?.output) {
      devLog("Result output exists:", result.output);
      try {
        const assetFiles = createAssetFile(result.output, props.id);
        devLog("Created asset files:", assetFiles);

        for (const { file } of assetFiles) {
          await createAsset(file);
        }

        addNotification({
          type: "success",
          content: `${assetFiles.length} file(s) added to assets successfully`
        });
      } catch (error) {
        devError("Error in handleAddToAssets:", error);
        addNotification({
          type: "error",
          content: "Failed to add preview to assets"
        });
      }
    } else {
      devWarn("No result output to add to assets");
    }
  };

  const handleDownload = async () => {
    devLog("handleDownload called");
    if (result?.output) {
      devLog("Result output exists:", result.output);
      try {
        const assetFiles = createAssetFile(result.output, props.id);
        devLog("Created asset files:", assetFiles);

        if (assetFiles.length === 1) {
          // Single file download
          const { file, filename } = assetFiles[0];
          const url = URL.createObjectURL(file);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          // Multiple files - create a zip
          const zip = new JSZip();
          assetFiles.forEach(({ file, filename }) => {
            zip.file(filename, file);
          });
          const content = await zip.generateAsync({ type: "blob" });
          const url = URL.createObjectURL(content);
          const a = document.createElement("a");
          a.href = url;
          a.download = `preview_${props.id}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        devLog("File download initiated");
        addNotification({
          type: "success",
          content: "Download started successfully"
        });
      } catch (error) {
        devError("Error in handleDownload:", error);
        addNotification({
          type: "error",
          content: "Failed to start download"
        });
      }
    } else {
      devWarn("No result output to download");
      addNotification({
        type: "warning",
        content: "No content available to download"
      });
    }
  };

  return (
    <Container
      css={styles}
      style={{
        // display: parentIsCollapsed ? "none" : "flex",
        display: "flex",
        backgroundColor: hasParent
          ? ThemeNodes.palette.c_node_bg_group
          : ThemeNodes.palette.c_node_bg
      }}
      className={`preview-node ${hasParent ? "hasParent" : ""}`}
    >
      <Handle
        style={{ top: "50%", backgroundColor: "white" }}
        id="value"
        type="target"
        position={Position.Left}
        isConnectable={true}
      />
      <>
        <NodeResizeControl
          style={{ background: "red", border: "none" }}
          minWidth={150}
          minHeight={150}
          maxWidth={1000}
          maxHeight={1000}
        >
          <SouthEastIcon />
        </NodeResizeControl>
        <NodeHeader
          id={props.id}
          data={props.data}
          hasParent={hasParent}
          metadataTitle="Preview"
        />
        <div className="actions">
          <Tooltip title="Download">
            <Button onClick={handleDownload} className="action-button download">
              <FileDownloadIcon />
            </Button>
          </Tooltip>
          <Tooltip title="Add to Assets">
            <Button onClick={handleAddToAssets} className="action-button">
              <AddIcon />
            </Button>
          </Tooltip>
        </div>
      </>

      {!result?.output && (
        <Typography className="description">Preview any output</Typography>
      )}
      <Handle
        style={{ top: "50%", backgroundColor: "white" }}
        id="value"
        type="target"
        position={Position.Left}
        isConnectable={true}
      />
      {memoizedOutputRenderer}
    </Container>
  );
};

export default memo(PreviewNode, isEqual);
