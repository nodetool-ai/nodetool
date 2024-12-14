import React, { useCallback, useState, useEffect } from "react";
//mui
import { Divider, Menu, MenuItem, Typography } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import ViewWeekIcon from "@mui/icons-material/ViewWeek";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import { devLog } from "../../utils/DevLog";
import LogoutIcon from "@mui/icons-material/Logout";
import { useNodeStore } from "../../stores/NodeStore";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";
import { labelForType } from "../../config/data_types";
import { Slugify } from "../../utils/TypeHandler";
import { getTimestampForFilename } from "../../utils/formatDateAndTime";

const OutputContextMenu: React.FC = () => {
  const {
    nodeId,
    menuPosition,
    closeContextMenu,
    type: sourceType,
    handleId: sourceHandle
  } = useContextMenuStore((state) => ({
    nodeId: state.nodeId,
    menuPosition: state.menuPosition,
    closeContextMenu: state.closeContextMenu,
    type: state.type,
    handleId: state.handleId
  }));
  const { openNodeMenu } = useNodeMenuStore();
  const { createNode, addNode, addEdge, generateEdgeId } = useNodeStore();
  const reactFlowInstance = useReactFlow();
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const [outputNodeMetadata, setOutputNodeMetadata] = useState<any>();
  const [saveNodeMetadata, setSaveNodeMetadata] = useState<any>();

  type HandleType = "value" | "image" | "df" | "values";
  const getTargetHandle = useCallback(
    (type: string, nodeType: string): HandleType => {
      const typeMap: { [key: string]: HandleType } = {
        image: "image",
        dataframe: "df",
        list: "values"
      };
      if (nodeType === "preview") {
        return "value";
      } else if (nodeType === "output") {
        return "value";
      } else {
        return typeMap[type] || "value";
      }
    },
    []
  );
  const fetchMetadata = useCallback(
    (nodeType: string) => {
      devLog(`Fetching metadata for node type: ${nodeType}`);
      const datatypeLabel = labelForType(nodeType || "").replaceAll(" ", "");
      const adjustedLabel = datatypeLabel === "String" ? "Text" : datatypeLabel;
      const outputNodePath = `nodetool.output.${datatypeLabel}Output`;
      const outputMetadata = getMetadata(outputNodePath);
      setOutputNodeMetadata(outputMetadata);

      const saveNodePath = `nodetool.${adjustedLabel.toLowerCase()}.Save${adjustedLabel}`;
      const saveMetadata = getMetadata(saveNodePath);
      setSaveNodeMetadata(saveMetadata);
    },
    [getMetadata]
  );

  useEffect(() => {
    if (sourceType && sourceType !== "") {
      fetchMetadata(sourceType);
    }
  }, [sourceType, fetchMetadata]);

  const createNodeWithEdge = useCallback(
    (metadata: any, position: { x: number; y: number }, nodeType: string) => {
      if (!metadata) {
        devLog("Metadata is undefined, cannot create node.");
        return;
      }

      const newNode = createNode(
        metadata,
        reactFlowInstance.screenToFlowPosition({
          x: position.x + 150,
          y: position.y
        })
      );

      if (metadata.style) {
        newNode.style = metadata.style;
      }

      // Assign a default size if specific dimensions were not provided
      newNode.data.size = {
        width:
          typeof newNode.style?.width === "number"
            ? newNode.style.width
            : parseInt(newNode.style?.width as string, 10) || 200,
        height:
          typeof newNode.style?.height === "number"
            ? newNode.style.height
            : parseInt(newNode.style?.height as string, 10) || 200
      };

      // Assign a unique name to the node
      newNode.data.properties.name =
        `${sourceType}_${sourceHandle}_${getTimestampForFilename(false)}` || "";

      addNode(newNode);
      const targetHandle = getTargetHandle(sourceType || "", nodeType);
      addEdge({
        id: generateEdgeId(),
        source: nodeId || "",
        target: newNode.id,
        sourceHandle: sourceHandle,
        targetHandle: targetHandle,
        type: "default",
        className: Slugify(sourceType || "")
      });
    },
    [
      createNode,
      reactFlowInstance,
      addNode,
      getTargetHandle,
      addEdge,
      generateEdgeId,
      nodeId,
      sourceHandle,
      sourceType
    ]
  );

  const createPreviewNode = useCallback(
    (event: React.MouseEvent) => {
      const metadata = getMetadata("nodetool.workflows.base_node.Preview");
      if (!metadata) {
        return;
      }
      const position = {
        x: event.clientX - 150,
        y: event.clientY - 150
      };
      createNodeWithEdge(
        {
          ...metadata,
          style: {
            width: "160px",
            height: "160px"
          }
        },
        position,
        "preview"
      );
    },
    [getMetadata, createNodeWithEdge]
  );

  const createOutputNode = useCallback(
    (event: React.MouseEvent) => {
      if (!outputNodeMetadata) {
        return;
      }
      createNodeWithEdge(
        outputNodeMetadata,
        {
          x: event.clientX - 20,
          y: event.clientY - 220
        },
        "output"
      );
    },
    [outputNodeMetadata, createNodeWithEdge]
  );

  const createSaveNode = useCallback(
    (event: React.MouseEvent) => {
      if (!saveNodeMetadata) {
        return;
      }
      createNodeWithEdge(
        saveNodeMetadata,
        {
          x: event.clientX - 250,
          y: event.clientY - 200
        },
        "save"
      );
    },
    [saveNodeMetadata, createNodeWithEdge]
  );

  const handleOpenNodeMenu = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    openNodeMenu(
      getMousePosition().x,
      getMousePosition().y,
      true,
      sourceType || "",
      "source"
    );
    closeContextMenu();
  };

  const handleCreatePreviewNode = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createPreviewNode(event);
    }
    closeContextMenu();
  };

  const handleCreateOutputNode = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createOutputNode(event);
    }
    closeContextMenu();
  };

  const handleCreateSaveNode = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createSaveNode(event);
    }
    closeContextMenu();
  };

  if (!menuPosition) return null;
  return (
    <Menu
      className="context-menu output-context-menu"
      open={menuPosition !== null}
      onContextMenu={(event) => event.preventDefault()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
    >
      <MenuItem disabled>
        <Typography
          style={{
            margin: ".1em 0",
            padding: "0"
          }}
          variant="body1"
        >
          Output
        </Typography>
      </MenuItem>
      <Divider />
      <ContextMenuItem
        onClick={handleCreatePreviewNode}
        label="Create Preview Node"
        addButtonClassName="create-preview-node"
        IconComponent={<LogoutIcon />}
        tooltip={"..."}
      />
      {outputNodeMetadata && (
        <ContextMenuItem
          onClick={handleCreateOutputNode}
          label="Create Output Node"
          addButtonClassName="create-output-node"
          IconComponent={<LogoutIcon />}
          tooltip={"..."}
        />
      )}
      {saveNodeMetadata && (
        <ContextMenuItem
          onClick={handleCreateSaveNode}
          label={`Create Save${
            sourceType === "string"
              ? "Text"
              : sourceType
              ? sourceType.charAt(0).toUpperCase() + sourceType.slice(1)
              : ""
          } Node`}
          addButtonClassName="create-save-node"
          IconComponent={<SaveAltIcon />}
          tooltip={"..."}
        />
      )}
      <ContextMenuItem
        onClick={handleOpenNodeMenu}
        label="Open filtered NodeMenu"
        addButtonClassName="open-node-menu"
        IconComponent={<ViewWeekIcon />}
        tooltip={"..."}
      />
    </Menu>
  );
};

export default OutputContextMenu;
