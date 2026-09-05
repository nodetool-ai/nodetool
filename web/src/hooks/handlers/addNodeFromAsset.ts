import { useCallback } from "react";
import { XYPosition } from "@xyflow/react";
import { Asset, NodeMetadata } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  constantForType,
  contentTypeToNodeType
} from "../../utils/NodeTypeMapping";
import Papa from "papaparse";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import { shallow } from "zustand/shallow";
import { mediaRefFromAsset } from "../../utils/mediaRef";
export const useAddNodeFromAsset = () => {
  const { addNode, createNode } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode
  }), shallow);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const downloadAssetContent = useCallback(
    async (asset: Asset): Promise<string> => {
      if (!asset?.get_url) {
        throw new Error("Asset URL is not available");
      }
      const response = await fetch(asset.get_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch asset: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      return new TextDecoder().decode(new Uint8Array(buffer));
    },
    []
  );

  const createDataframeNode = useCallback(
    (csvContent: string, position: XYPosition, nodeMetadata: NodeMetadata) => {
      const res = Papa.parse<string[]>(csvContent, {
        header: false
      });

      if (res.data.length > 0) {
        const columnDefs = res.data[0].map((col: string) => ({
          name: col,
          data_type: "string"
        }));
        const data = res.data.slice(1);
        const newNode = createNode(nodeMetadata, position);
        newNode.data.properties.value = {
          type: "dataframe",
          columns: columnDefs,
          data: data
        };
        addNode(newNode);
      } else {
        console.error("CSV content is empty or could not be parsed");
      }
    },
    [createNode, addNode]
  );

  const addNodeFromAsset = useCallback(
    (asset: Asset | undefined, position: XYPosition) => {
      if (asset === undefined) {
        return;
      }
      const assetType = contentTypeToNodeType(asset.content_type, asset.name);
      const nodeType = constantForType(assetType || "");
      if (nodeType === null) {
        addNotification({
          type: "warning",
          alert: true,
          content: "Unsupported file type: " + asset.content_type
        });
        return;
      }

      const createNodeWithAsset = (
        nodeType: string,
        properties?: Record<string, unknown>
      ) => {
        const metadata = getMetadata(nodeType);
        if (!metadata) {
          throw new Error("metadata for node type " + nodeType + " is missing");
        }
        const newNode = createNode(metadata, position);
        Object.assign(
          newNode.data.properties,
          properties ?? { value: mediaRefFromAsset(asset, assetType ?? "asset") }
        );
        addNode(newNode);
        return newNode;
      };

      const reportFailure = (error: unknown) => {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not add ${asset.name}: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      };
      let nodeMetadata: NodeMetadata | undefined;

      switch (assetType) {
        case "dataframe":
          nodeMetadata = getMetadata("nodetool.constant.DataFrame");
          downloadAssetContent(asset)
            .then((csvContent) => {
              if (nodeMetadata === undefined) {
                throw new Error("metadata for DataFrame is undefined");
              }
              createDataframeNode(csvContent, position, nodeMetadata);
            })
            .catch(reportFailure);
          break;
        case "str":
        case "text":
          downloadAssetContent(asset)
            .then((content) => {
              createNodeWithAsset(nodeType, { value: content });
            })
            .catch(reportFailure);
          break;
        case "folder":
          createNodeWithAsset(nodeType, {
            value: { type: "folder", uri: "", asset_id: asset.id },
            name: asset.name.toLowerCase().replace(/\s+/g, "_")
          });
          break;
        default:
          createNodeWithAsset(nodeType);
      }
    },
    [
      addNode,
      addNotification,
      createDataframeNode,
      createNode,
      downloadAssetContent,
      getMetadata
    ]
  );

  return addNodeFromAsset;
};
