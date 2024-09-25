// create nodes from existing assets

import { useCallback } from "react";
import { XYPosition } from "@xyflow/react";
import { Asset, NodeMetadata } from "../../stores/ApiTypes";
import { useNodeStore } from "../../stores/NodeStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useMetadata } from "../../serverState/useMetadata";
import axios from "axios";
import { constantForType } from "./useConnectionHandlers";
import { devError } from "../../utils/DevLog";
import { nodeTypeFor } from "./dropHandlerUtils";
import Papa from "papaparse";
interface ParsedCSV {
  data: string[][];
  errors: Papa.ParseError[];
  meta: Papa.ParseMeta;
}
export const useAddNodeFromAsset = () => {
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);
  const { data: metadata } = useMetadata();
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
        devError("CSV content is empty or could not be parsed");
      }
    },
    [createNode, addNode]
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

      const createNodeWithAsset = (content?: string) => {
        const newNode = createNode(nodeMetadata, position);
        newNode.data.properties.value = {
          type: assetType,
          asset_id: asset.id,
          uri: asset.get_url,
          ...(content && { value: content })
        };
        addNode(newNode);
        return newNode;
      };

      switch (assetType) {
        case "dataframe":
          nodeMetadata = metadata.metadataByType["nodetool.constant.DataFrame"];
          downloadAssetContent(asset)
            .then((csvContent) => {
              createDataframeNode(csvContent, position, nodeMetadata);
            })
            .catch((error) => {
              devError("Failed to download asset content", error);
            });
          break;
        case "str":
          nodeMetadata = metadata.metadataByType["nodetool.constant.String"];
          downloadAssetContent(asset)
            .then((content) => {
              createNodeWithAsset(content);
            })
            .catch((error) => {
              devError("Failed to download asset content", error);
            });
          break;
        case "text":
          nodeMetadata = metadata.metadataByType["nodetool.constant.Text"];
          createNodeWithAsset();
          break;
        default:
          createNodeWithAsset();
      }
    },
    [
      addNode,
      addNotification,
      createDataframeNode,
      createNode,
      downloadAssetContent,
      metadata
    ]
  );

  return addNodeFromAsset;
};
