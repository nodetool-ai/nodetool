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
import { useAssetStore } from "../../stores/AssetStore";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { constantForType } from "./useConnectionHandlers";
import { useAuth } from "../../providers/AuthProvider";
import { useNotificationStore } from "../../stores/NotificationStore";
import dagre from "dagre";
import { useMetadata } from "../../serverState/useMetadata";
import axios from "axios";
import { devError } from "../../utils/DevLog";
import { useCallback } from "react";

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
  const { mutation: uploadMutation } = useAssetUpload();
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);
  const workflow = useNodeStore((state) => state.workflow);
  const createWorkflow = useWorkflowStore((state) => state.create);
  const setWorkflow = useNodeStore((state) => state.setWorkflow);
  const getAsset = useAssetStore((state) => state.get);
  const currentFolderId = useAssetStore((state) => state.currentFolderId);
  const { user } = useAuth();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const { data: metadata } = useMetadata();

  const processComfyFiles = useCallback(
    (files: File[]) => {
      return files.reduce((acc: File[], file) => {
        // TODO: better way to check for comfy
        if (file.type === "application/json") {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target) {
              const comfyWorkflow = JSON.parse(event.target.result as string);
              createWorkflow({
                name: file.name,
                description: "created from comfy",
                access: "private",
                comfy_workflow: comfyWorkflow
              })
                .then((workflow) => {
                  const edges = workflow.graph.edges;
                  const nodes = workflow.graph.nodes;
                  workflow.graph.nodes = autoLayout(edges, nodes);

                  setWorkflow(workflow);
                })
                .catch((error) => {
                  alert(error.detail);
                });
            }
          };
          reader.readAsText(file);
        } else {
          acc.push(file);
        }
        return acc;
      }, [] as File[]);
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
      const newNode = createNode(nodeMetadata, position);

      newNode.data.properties = {
        type: assetType,
        value: data,
        asset_id: asset.id,
        uri: asset.get_url
      };
      addNode(newNode);
    },
    [addNode, createNode]
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
              const newNode = createNode(nodeMetadata, position);
              // transform csv into dataframe
              const data = csv
                .split("\n")
                .map((row) => row.split(","))
                .filter((row) => row.length > 0);
              const columnDefs = data[0].map((col) => ({
                name: col,
                data_type: "object"
              }));
              newNode.data.properties.value = {
                type: "dataframe",
                columns: columnDefs,
                data: data.slice(1)
              };
              addNode(newNode);
            }
          };
          reader.readAsText(file);
        } else {
          acc.push(file);
        }
        return acc;
      }, [] as File[]);
    },
    [addNode, createNode, metadata]
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
      const nodeMetadata = metadata.metadataByType[nodeType];
      if (assetType === "str" || assetType === "dataframe") {
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
    const assetJSON = event.dataTransfer.getData("asset");
    const asset = assetJSON ? (JSON.parse(assetJSON) as Asset) : null;

    // Create nodes on asset drop
    if (targetIsPane && asset !== null) {
      getAsset(asset.id).then((asset) => {
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
        uploadMutation
          .mutateAsync({
            files,
            workflow_id: workflow.id,
            parent_id: currentFolderId || user.id
          })
          .then((assets) => {
            if (targetIsPane) {
              assets.forEach((asset) => {
                addNodeFromAsset(asset, position);
              });
            }
          });
      }
    }
  };
  return { onDrop };
};
export default useDropHandler;
