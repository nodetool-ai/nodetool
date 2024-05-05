import { useNodeStore } from "../../stores/NodeStore";
import { useReactFlow } from "reactflow";
import { Asset, Edge, TypeName, Node } from "../../stores/ApiTypes";
import useKeyPressedListener from "../../utils/KeyPressedListener";
import { useAssetUpload } from "../../serverState/useAssetUpload";
// import { uuidv4 } from "../stores/uuidv4";
import { useAssetStore } from "../../stores/AssetStore";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { constantForType, inputForType } from "./useConnectionHandlers";
import { useAuth } from "../../providers/AuthProvider";
import { useNotificationStore } from "../../stores/NotificationStore";
import dagre from "dagre";
import { useMetadata } from "../../serverState/useMetadata";

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
  const controlKeyPressed = useKeyPressedListener("Control");
  const { mutation: uploadMutation } = useAssetUpload();
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);
  const workflow = useNodeStore((state) => state.workflow);
  const getAsset = useAssetStore((state) => state.get);
  const currentFolderId = useAssetStore((state) => state.currentFolderId);
  const { user } = useAuth();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const { data: metadata } = useMetadata();

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.target as HTMLElement;
    const targetIsPane = target.classList.contains("react-flow__pane");
    const assetJSON = event.dataTransfer.getData("asset");
    const asset = assetJSON ? (JSON.parse(assetJSON) as Asset) : null;
    const createWorkflow = useWorkflowStore.getState().create;
    const setWorkflow = useNodeStore.getState().setWorkflow;

    const addNewNode = (asset: Asset | undefined) => {
      if (asset === undefined) {
        return;
      }
      const assetType = nodeTypeFor(asset.content_type);
      if (assetType === null) {
        addNotification({
          type: "warning",
          alert: true,
          content: "Unsupported file type!"
        });
        return;
      }
      const nodeType = controlKeyPressed
        ? inputForType(assetType)
        : constantForType(assetType);

      if (nodeType === null) {
        addNotification({
          type: "warning",
          alert: true,
          content: "Unsupported file type!"
        });
        return;
      }

      if (metadata === undefined) {
        addNotification({
          type: "warning",
          alert: true,
          content: "Metadata not loaded!"
        });
        return;
      }
      const nodeMetadata = metadata.metadataByType[nodeType];

      const newNode = createNode(
        nodeMetadata,
        // reactFlow.screenToFlowPosition({
        reactFlow.project({
          x: event.clientX,
          y: event.clientY
        })
      );
      newNode.data.properties.value = {
        type: assetType,
        asset_id: asset.id,
        uri: asset.get_url
      };
      addNode(newNode);
    };

    const files = Array.from(event.dataTransfer?.files);

    if (files.length > 0) {
      // parent id of roor assets is the user id
      if (user) {
        let skipUpload = false;
        files.forEach((file) => {
          if (file.type === "application/json") {
            skipUpload = true;
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
          }
        });
        if (skipUpload) {
          return;
        }
        uploadMutation
          .mutateAsync({
            files,
            workflow_id: workflow.id,
            parent_id: currentFolderId || user.id
          })
          .then((assets) => {
            if (targetIsPane) assets.forEach(addNewNode);
          });
      }
    }

    // CREATE NODE ON ASSET DROP
    if (targetIsPane && asset !== null) {
      getAsset(asset.id).then(addNewNode);
    }
  };
  return { onDrop };
};
export default useDropHandler;
