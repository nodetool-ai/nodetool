// create nodes from existing assets

import { useCallback } from "react";
import { XYPosition } from "@xyflow/react";
import { Asset, NodeMetadata } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import axios from "axios";
import {
  constantForType,
  contentTypeToNodeType
} from "../../utils/NodeTypeMapping";
import log from "loglevel";
import Papa from "papaparse";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
interface ParsedCSV {
  data: string[][];
  errors: Papa.ParseError[];
  meta: Papa.ParseMeta;
}
export const useAddNodeFromAsset = () => {
  const { addNode, createNode } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode
  }));
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const downloadAssetContent = useCallback(
    async (asset: Asset): Promise<string> => {
      if (!asset?.get_url) {
        throw new Error("Asset URL is not available");
      }
      const response = await axios.get(asset.get_url, {
        responseType: "arraybuffer"
      });
      return new TextDecoder().decode(new Uint8Array(response.data));
    },
    []
  );

  const createDataframeNode = useCallback(
    (csvContent: string, position: XYPosition, nodeMetadata: NodeMetadata) => {
      const res = Papa.parse<string[]>(csvContent, {
        header: false
      }) as ParsedCSV;

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
        log.error("CSV content is empty or could not be parsed");
      }
    },
    [createNode, addNode]
  );

  const addNodeFromAsset = useCallback(
    (asset: Asset | undefined, position: XYPosition) => {
      if (asset === undefined) {
        return;
      }
      const assetType = contentTypeToNodeType(asset.content_type);
      const nodeType = constantForType(assetType || "");
      if (nodeType === null) {
        addNotification({
          type: "warning",
          alert: true,
          content: "Unsupported file type: " + asset.content_type
        });
        return;
      }

      const createNodeWithAsset = (nodeType: string, content?: string) => {
        const metadata = getMetadata(nodeType);
        if (!metadata) {
          throw new Error("metadata for node type " + nodeType + " is missing");
        }
        const newNode = createNode(metadata, position);
        if (asset.content_type === "folder") {
          newNode.data.properties.folder = {
            type: "folder",
            asset_id: asset.id
          };
          newNode.data.properties.label = asset.name;
          newNode.data.properties.name = asset.name
            .toLowerCase()
            .replace(/\s+/g, "_");
        } else {
          newNode.data.properties.value = {
            type: assetType,
            asset_id: asset.id,
            uri: asset.get_url,
            ...(content && { value: content })
          };
        }
        addNode(newNode);
        return newNode;
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
            .catch((error) => {
              log.error("Failed to download asset content", error);
            });
          break;
        case "str":
          downloadAssetContent(asset)
            .then((content) => {
              createNodeWithAsset("nodetool.constant.String", content);
            })
            .catch((error) => {
              log.error("Failed to download asset content", error);
            });
          break;
        case "text":
          downloadAssetContent(asset)
            .then((content) => {
              createNodeWithAsset("nodetool.constant.Text", content);
            })
            .catch((error) => {
              log.error("Failed to download asset content", error);
            });
          break;
        case "folder":
          createNodeWithAsset(nodeType);
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
