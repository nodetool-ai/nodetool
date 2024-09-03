// create nodes from existing assets

import { useCallback } from "react";
import { XYPosition } from "reactflow";
import { Asset, NodeMetadata, TypeName } from "../../stores/ApiTypes";
import { useNodeStore } from "../../stores/NodeStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useMetadata } from "../../serverState/useMetadata";
import axios from "axios";
import { constantForType } from "./useConnectionHandlers";
import { devError, devLog } from "../../utils/DevLog";
import { nodeTypeFor } from "./dropHandlerUtils";
import Papa from "papaparse";

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

  const downloadAssetContentAndCreateNode = useCallback(
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
      devLog("Downloaded asset content", asset, nodeMetadata);
    },
    [addNode, createNode]
  );

  interface ParsedCSV {
    data: string[][];
    errors: Papa.ParseError[];
    meta: Papa.ParseMeta;
  }

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
      if (assetType === "dataframe") {
        const nodeType = "nodetool.constant.DataFrame";
        nodeMetadata = metadata.metadataByType[nodeType];
        downloadAssetContent(asset)
          .then((csvContent) => {
            createDataframeNode(csvContent, position, nodeMetadata);
          })
          .catch((error) => {
            devError("Failed to download asset content", error);
          });
      } else if (assetType === "str") {
        const nodeType = "nodetool.constant.String";
        nodeMetadata = metadata.metadataByType[nodeType];
        downloadAssetContent(asset)
          .then((content) => {
            const newNode = createNode(nodeMetadata, position);
            newNode.data.properties.value = {
              type: assetType,
              value: content,
              asset_id: asset.id,
              uri: asset.get_url
            };
            addNode(newNode);
          })
          .catch((error) => {
            devError("Failed to download asset content", error);
          });
      } else if (assetType === "text") {
        const nodeType = "nodetool.constant.Text";
        nodeMetadata = metadata.metadataByType[nodeType];
        console.log("Creating text node:", asset.id, asset.get_url);
        const newNode = createNode(nodeMetadata, position);
        newNode.data.properties.value = {
          type: assetType,
          asset_id: asset.id,
          uri: asset.get_url
        };
        console.log("New text node created:", newNode);
        addNode(newNode);
      } else {
        downloadAssetContentAndCreateNode(
          asset,
          assetType || "",
          nodeMetadata,
          position
        );
      }

      // } else {
      //   const newNode = createNode(nodeMetadata, position);
      //   newNode.data.properties.value = {
      //     type: assetType,
      //     asset_id: asset.id,
      //     uri: asset.get_url
      //   };
      //   addNode(newNode);
      // }
    },
    [
      addNode,
      addNotification,
      createDataframeNode,
      createNode,
      downloadAssetContent,
      downloadAssetContentAndCreateNode,
      metadata
    ]
  );

  // const addNodeFromAsset = useCallback(
  //   (asset: Asset | undefined, position: XYPosition) => {
  //     if (asset === undefined) {
  //       return;
  //     }
  //     const assetType = nodeTypeFor(asset.content_type);
  //     const nodeType = constantForType(assetType || "");
  //     if (nodeType === null) {
  //       addNotification({
  //         type: "warning",
  //         alert: true,
  //         content: "Unsupported file type: " + asset.content_type
  //       });
  //       return;
  //     }

  //     if (metadata === undefined) {
  //       devError("metadata is undefined");
  //       return;
  //     }
  //     let nodeMetadata = metadata.metadataByType[nodeType];
  //     if (assetType === "dataframe") {
  //       const nodeType = "nodetool.constant.DataFrame";
  //       nodeMetadata = metadata.metadataByType[nodeType];
  //       downloadAssetContent(asset, assetType, nodeMetadata, position);
  //     } else {
  //       if (assetType === "str") {
  //         const nodeType = "nodetool.constant.String";
  //         nodeMetadata = metadata.metadataByType[nodeType];
  //         downloadAssetContent(asset, assetType, nodeMetadata, position);
  //       } else {
  //         const newNode = useCreateDataframe(createNode, addNode, metadata);
  //         // const newNode = createNode(nodeMetadata, position);
  //         console.log("!!!! newNode", newNode);
  //         newNode.data.properties.value = {
  //           type: assetType,
  //           asset_id: asset.id,
  //           uri: asset.get_url
  //         };
  //         addNode(newNode);
  //       }
  //     }
  //   },
  //   [addNode, addNotification, createNode, downloadAssetContent, metadata]
  // );

  return addNodeFromAsset;
};
