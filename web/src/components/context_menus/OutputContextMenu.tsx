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
import { useReactFlow } from "reactflow";
import useMetadataStore from "../../stores/MetadataStore";
import { labelForType } from "../../config/data_types";
import { Slugify } from "../../utils/TypeHandler";
import useConnectionStore from "../../stores/ConnectionStore";
import { TypeMetadata } from "../../stores/ApiTypes";
import { getTimestampForFilename } from "../../utils/formatDateAndTime";

const OutputContextMenu: React.FC = () => {
  const { openMenuType, menuPosition, closeContextMenu, type, nodeId } =
    useContextMenuStore();
  const { openNodeMenu } = useNodeMenuStore();
  const createNode = useNodeStore((state) => state.createNode);
  const addNode = useNodeStore((state) => state.addNode);
  const addEdge = useNodeStore((state) => state.addEdge);
  const generateEdgeId = useNodeStore((state) => state.generateEdgeId);
  const reactFlowInstance = useReactFlow();
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const [outputNodeMetadata, setOutputNodeMetadata] = useState<any>();
  const [saveNodeMetadata, setSaveNodeMetadata] = useState<any>();
  const { connectHandleId, connectType } = useConnectionStore();
  const [sourceHandle, setSourceHandle] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<TypeMetadata | null>(null);

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

  useEffect(() => {
    if (connectHandleId) {
      setSourceHandle(connectHandleId);
      setSourceType(connectType);
    }
  }, [connectHandleId, connectType]);

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
    if (type) {
      fetchMetadata(type);
    }
  }, [type, fetchMetadata]);

  const createNodeWithEdge = useCallback(
    (metadata: any, position: { x: number; y: number }, nodeType: string) => {
      if (!metadata) {
        devLog("Metadata is undefined, cannot create node.");
        return;
      }
      const newNode = createNode(
        metadata,
        reactFlowInstance.project({
          x: position.x + 150,
          y: position.y
        })
      );
      newNode.data.size = {
        width: 200,
        height: 200
      };
      newNode.data.properties.name =
        sourceType?.type +
          "_" +
          sourceHandle +
          "_" +
          getTimestampForFilename(false) || "";
      addNode(newNode);
      const targetHandle = getTargetHandle(type || "", nodeType);
      addEdge({
        id: generateEdgeId(),
        source: nodeId || "",
        target: newNode.id,
        sourceHandle: sourceHandle,
        targetHandle: targetHandle,
        type: "default",
        className: Slugify(type || "")
      });
    },
    [
      createNode,
      reactFlowInstance,
      addNode,
      getTargetHandle,
      type,
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
      createNodeWithEdge(
        metadata,
        {
          x: event.clientX - 150,
          y: event.clientY - 150
        },
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
      type || "",
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

  if (openMenuType !== "output-context-menu" || !menuPosition) return null;
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
            type === "string"
              ? "Text"
              : type
              ? type.charAt(0).toUpperCase() + type.slice(1)
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
