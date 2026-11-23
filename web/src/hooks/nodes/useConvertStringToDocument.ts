/**
 * Turn a String constant into a document (document editor PRD R14): the
 * node's text becomes a Markdown file in the workflow's project, and the node
 * becomes a Document constant that references it. The new node's `text`
 * output takes over the String node's outgoing edges, so downstream nodes
 * receive the same text, now edited in the document tab.
 */
import { useCallback } from "react";

import { useNodeStoreRef } from "../../contexts/NodeContext";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { creationProjectId } from "../../stores/WorkspaceTabsStore";
import { queryClient } from "../../queryClient";
import { projectDocumentValue } from "../../components/properties/ProjectDocumentSelect";

export const STRING_CONSTANT_TYPE = "nodetool.constant.String";
export const DOCUMENT_CONSTANT_TYPE = "nodetool.constant.Document";

/** A file name from the node's title, or a default. */
const documentFileName = (title: string | undefined): string => {
  const base = (title ?? "").trim().replace(/[\\/:*?"<>|]+/g, " ").trim();
  return `${base || "Untitled"}.md`;
};

export function useConvertStringToDocument(): (nodeId: string) => Promise<void> {
  const store = useNodeStoreRef();
  const createAsset = useAssetStore((state) => state.createAsset);
  const addNotification = useNotificationStore((state) => state.addNotification);

  return useCallback(
    async (nodeId: string) => {
      const { findNode, updateNodeData, updateNode, setEdges, getWorkflow } = store.getState();
      const node = findNode(nodeId);
      if (!node || node.type !== STRING_CONSTANT_TYPE) return;
      const value = node.data?.properties?.value;
      const text = typeof value === "string" ? value : "";
      const projectId = getWorkflow()?.project_id || creationProjectId();
      try {
        const asset = await createAsset(
          new File([text], documentFileName(node.data?.title), { type: "text/markdown" }),
          undefined,
          undefined,
          undefined,
          undefined,
          projectId
        );
        void queryClient.invalidateQueries({ queryKey: [["documents"]] });
        updateNodeData(nodeId, {
          properties: { value: projectDocumentValue(asset.id) }
        });
        updateNode(nodeId, { type: DOCUMENT_CONSTANT_TYPE });
        setEdges(
          store.getState().edges.map((edge) =>
            edge.source === nodeId && edge.sourceHandle === "output"
              ? { ...edge, sourceHandle: "text" }
              : edge
          )
        );
        addNotification({
          type: "info",
          alert: false,
          content: `Converted to the document ${asset.name}`
        });
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not convert to a document: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    },
    [addNotification, createAsset, store]
  );
}
