import { useNodeStore } from "../../stores/NodeStore";
import { useReactFlow, XYPosition } from "reactflow";
import {
  Asset,
  Edge,
  TypeName,
  Node,
  NodeMetadata
} from "../../stores/ApiTypes";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useAssetStore } from "../AssetStore";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { constantForType } from "./useConnectionHandlers";
import { useNotificationStore } from "../../stores/NotificationStore";
import dagre from "dagre";
import { useMetadata } from "../../serverState/useMetadata";
import axios from "axios";
import { devError, devLog } from "../../utils/DevLog";
import { useCallback } from "react";
import useAuth from "../../stores/useAuth";
import Papa, { ParseResult } from "papaparse";

interface DropHandler {
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}

export const autoLayout = (edges: Edge[], nodes: Node[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({ rankdir: "LR" });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: 200,
      height: 300
    });
  });

  edges.forEach((el) => {
    dagreGraph.setEdge(el.source, el.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node: Node) => {
    const dnode = dagreGraph.node(node.id);
    return {
      id: node.id,
      type: node.type,
      data: node.data,
      width: dnode.width,
      height: dnode.height,
      ui_properties: {
        position: {
          x: dnode.x,
          y: dnode.y
        }
      }
    };
  });
};

export function nodeTypeFor(content_type: string): TypeName | null {
  switch (content_type) {
    case "application/json":
      return "str";
    case "text/plain":
      return "str";
    case "text/csv":
      return "dataframe";
    case "image/png":
      return "image";
    case "image/jpeg":
      return "image";
    case "image/gif":
      return "image";
    case "video/mp4":
      return "video";
    case "video/ogg":
      return "video";
    case "video/webm":
      return "video";
    case "audio/mpeg":
      return "audio";
    case "audio/ogg":
      return "audio";
    case "audio/wav":
      return "audio";
    case "audio/webm":
      return "audio";
    default:
      return null;
  }
}

export const useDropHandler = (): DropHandler => {
  const reactFlow = useReactFlow();
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);
  const workflow = useNodeStore((state) => state.workflow);
  const createWorkflow = useWorkflowStore((state) => state.create);
  const setWorkflow = useNodeStore((state) => state.setWorkflow);
  const getAsset = useAssetStore((state) => state.get);
  const currentFolderId = useAssetStore((state) => state.currentFolderId);
  const { uploadAsset } = useAssetUpload();
  const { user } = useAuth();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const { data: metadata } = useMetadata();

  const createDataFrameNode = useCallback(
    (csv: string, position: XYPosition, nodeMetadata: NodeMetadata) => {
      const newNode = createNode(nodeMetadata, position);

      const res: ParseResult<string[]> = Papa.parse(csv);
      const columnDefs = res.data[0].map((col: string) => ({
        name: col,
        data_type: "string"
      }));
      const data = res.data.slice(1);
      newNode.data.properties.value = {
        type: "dataframe",
        columns: columnDefs,
        data: data
      };
      addNode(newNode);
    },
    [addNode, createNode]
  );

  const isWorkflowJson = (json: any): boolean => {
    const comfyProperties = ["inputs", "class_type", "type", "_meta"];

    for (const key in json) {
      if (Object.prototype.hasOwnProperty.call(json, key)) {
        const node = json[key];
        if (
          comfyProperties.some((prop) =>
            Object.prototype.hasOwnProperty.call(node, prop)
          )
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const processComfyFiles = useCallback(
    (files: File[]) => {
      const nonJsonFiles: File[] = [];

      files.forEach((file) => {
        if (file.type === "application/json") {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target) {
              try {
                const comfyWorkflow = JSON.parse(event.target.result as string);
                if (isWorkflowJson(comfyWorkflow)) {
                  createWorkflow({
                    name: file.name,
                    description: "created from comfy",
                    access: "private",
                    comfy_workflow: comfyWorkflow
                  })
                    .then((workflow) => {
                      setWorkflow(workflow);
                    })
                    .catch((error) => {
                      alert(error.detail);
                    });
                } else {
                  nonJsonFiles.push(file);
                }
              } catch (error) {
                devError("Error parsing JSON", error);
                nonJsonFiles.push(file);
              }
            }
          };
          reader.readAsText(file);
        } else {
          nonJsonFiles.push(file);
        }
      });

      return nonJsonFiles;
    },
    [createWorkflow, setWorkflow]
  );

  const downloadAssetContent = useCallback(
    async (
      asset: Asset,
      assetType: TypeName,
      nodeMetadata: NodeMetadata,
      position: XYPosition
    ) => {
      if (!asset?.get_url) {
        return;
      }
      const response = await axios.get(asset?.get_url, {
        responseType: "arraybuffer"
      });
      const data = new TextDecoder().decode(new Uint8Array(response.data));
      if (assetType === "dataframe") {
        createDataFrameNode(data, position, nodeMetadata);
      } else {
        const newNode = createNode(nodeMetadata, position);
        newNode.data.properties = {
          type: assetType,
          value: data,
          asset_id: asset.id,
          uri: asset.get_url
        };
        addNode(newNode);
      }
      devLog("Downloaded asset content", asset, nodeMetadata);
    },
    [addNode, createDataFrameNode, createNode]
  );

  // Embed text files as nodes
  const embedAssetsFromFiles = useCallback(
    (files: File[], position: XYPosition) => {
      if (metadata === undefined) {
        devError("metadata is undefined");
        return [];
      }
      return files.reduce((acc: File[], file: File) => {
        if (file.type === "text/plain") {
          const nodeType = "nodetool.constant.String";
          const nodeMetadata = metadata.metadataByType[nodeType];
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target) {
              const data = event.target.result as string;
              const newNode = createNode(nodeMetadata, position);
              newNode.data.properties.value = data;
              addNode(newNode);
            }
          };
          reader.readAsText(file);
        } else if (file.type === "text/csv") {
          const nodeType = "nodetool.constant.DataFrame";
          const nodeMetadata = metadata.metadataByType[nodeType];
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target) {
              const csv = event.target.result as string;
              createDataFrameNode(csv, position, nodeMetadata);
            }
          };
          reader.readAsText(file);
        } else {
          acc.push(file);
        }
        return acc;
      }, [] as File[]);
    },
    [addNode, createDataFrameNode, createNode, metadata]
  );

  const addNodeFromAsset = useCallback(
    (asset: Asset | undefined, position: XYPosition) => {
      if (asset === undefined) {
        return;
      }
      const assetType = nodeTypeFor(asset.content_type);
      const nodeType = constantForType(assetType || "");
      if (nodeType === null) {
        addNotification({
          type: "warning",
          alert: true,
          content: "Unsupported file type: " + asset.content_type
        });
        return;
      }

      if (metadata === undefined) {
        devError("metadata is undefined");
        return;
      }
      let nodeMetadata = metadata.metadataByType[nodeType];
      if (assetType === "dataframe") {
        const nodeType = "nodetool.constant.DataFrame";
        nodeMetadata = metadata.metadataByType[nodeType];
        downloadAssetContent(asset, assetType, nodeMetadata, position);
      } else {
        if (assetType === "str") {
          const nodeType = "nodetool.constant.String";
          nodeMetadata = metadata.metadataByType[nodeType];
          downloadAssetContent(asset, assetType, nodeMetadata, position);
        } else {
          const newNode = createNode(nodeMetadata, position);
          newNode.data.properties.value = {
            type: assetType,
            asset_id: asset.id,
            uri: asset.get_url
          };
          addNode(newNode);
        }
      }
    },
    [addNode, addNotification, createNode, downloadAssetContent, metadata]
  );

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.target as HTMLElement;
    const targetIsPane = target.classList.contains("react-flow__pane");
    const position = reactFlow.project({
      x: event.clientX,
      y: event.clientY
    });

    // Create nodes from node menu drop
    const nodeJSON = event.dataTransfer.getData("create-node");
    const node = nodeJSON ? (JSON.parse(nodeJSON) as NodeMetadata) : null;
    if (node !== null) {
      const newNode = createNode(node, position);
      addNode(newNode);
    }

    // Create nodes on asset drop
    const assetJSON = event.dataTransfer.getData("asset");
    const asset = assetJSON ? (JSON.parse(assetJSON) as Asset) : null;
    if (targetIsPane && asset !== null) {
      getAsset(asset.id).then((asset: Asset) => {
        addNodeFromAsset(asset, position);
      });
    }

    let files = Array.from(event.dataTransfer?.files);

    // Create nodes on file drop
    if (files.length > 0) {
      // parent id of root assets is the user id
      if (user) {
        files = processComfyFiles(files);
        files = embedAssetsFromFiles(files, position);
        files.forEach((file: File, index: number) => {
          uploadAsset({
            file,
            workflow_id: workflow.id,
            parent_id: currentFolderId || user.id,
            onCompleted: (asset: Asset) => {
              if (targetIsPane) {
                addNodeFromAsset(asset, {
                  x: position.x + index * 300,
                  y: position.y
                });
              }
            }
          });
        });
      }
    }
  };
  return { onDrop };
};
export default useDropHandler;
