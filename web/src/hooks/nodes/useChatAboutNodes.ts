import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Node } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import useChatDraftStore from "../../stores/ChatDraftStore";
import useMediaGenerationStore from "../../stores/MediaGenerationStore";
import useCanvasChatDockStore from "../../stores/CanvasChatDockStore";

/** Errors past this length are cut so the prompt stays readable. */
export const MAX_ERROR_DRAFT_LENGTH = 2000;

export interface ChatAboutNodesOptions {
  /** The node's error text. With one node, the draft asks why it failed. */
  error?: string;
}

/** Opens the canvas chat window with a draft naming the given nodes. */
export type ChatAboutNodes = (
  nodeIds: readonly string[],
  options?: ChatAboutNodesOptions
) => Promise<void>;

const nodeTitle = (node: Node<NodeData>): string => {
  const custom = node.data?.title?.trim();
  if (custom) {
    return custom;
  }
  const type = node.type ?? node.data?.originalType ?? "";
  return (
    useMetadataStore.getState().getMetadata(type)?.title ??
    type.split(".").pop() ??
    type
  );
};

const truncateError = (error: string): string =>
  error.length > MAX_ERROR_DRAFT_LENGTH
    ? `${error.slice(0, MAX_ERROR_DRAFT_LENGTH)}…`
    : error;

/**
 * "Chat about node" for the node editor. Selects the nodes, so the canvas
 * composer sends their ids as the `ui_context` selection, parks a draft that
 * names them (title and id, which the `ui_*` graph tools take) in the
 * workflow's chat thread, switches the composer to chat mode and opens the
 * chat window. The draft is not sent: the user finishes the question.
 */
export function useChatAboutNodes(): ChatAboutNodes {
  const { t } = useTranslation();
  const nodeStore = useNodeStoreRef();

  return useCallback<ChatAboutNodes>(
    async (nodeIds, options = {}) => {
      const { findNode, setSelectedNodes, workflow } = nodeStore.getState();
      const nodes = nodeIds
        .map((id) => findNode(id))
        .filter((node): node is Node<NodeData> => node !== undefined);
      if (nodes.length === 0) {
        return;
      }

      let draft: string;
      if (nodes.length === 1) {
        const [node] = nodes;
        const title = nodeTitle(node);
        draft = options.error
          ? t("screen_editor.nodeChat.draftError", {
              title,
              id: node.id,
              error: truncateError(options.error)
            })
          : t("screen_editor.nodeChat.draftNode", { title, id: node.id });
      } else {
        draft = t("screen_editor.nodeChat.draftNodes", {
          nodes: nodes
            .map((node) =>
              t("screen_editor.nodeChat.draftNodeItem", {
                title: nodeTitle(node),
                id: node.id
              })
            )
            .join(", ")
        });
      }

      setSelectedNodes(nodes);

      const chat = useGlobalChatStore.getState();
      let threadId = chat.currentThreadId;
      if (!threadId) {
        threadId = workflow?.id
          ? await chat.openWorkflowThread(workflow.id)
          : await chat.createNewThread();
      }

      // Let a closing menu hand focus back first, so its focus restore does
      // not take the caret from the composer.
      await new Promise((resolve) => setTimeout(resolve, 0));

      useMediaGenerationStore.getState().setMode("chat");
      useChatDraftStore.getState().setDraft(threadId, draft);
      useCanvasChatDockStore.getState().setConversationCollapsed(false);
    },
    [nodeStore, t]
  );
}

/**
 * {@link useChatAboutNodes} for a context menu: the call waits until the menu
 * unmounts. While the menu is open its focus trap pulls the caret back out of
 * the chat composer, and the menu provider closes it on a delay.
 */
export function useChatAboutNodesOnMenuClose(): (
  nodeIds: readonly string[]
) => void {
  const chatAboutNodes = useChatAboutNodes();
  const pending = useRef<readonly string[] | null>(null);
  useEffect(
    () => () => {
      const nodeIds = pending.current;
      pending.current = null;
      if (nodeIds) {
        void chatAboutNodes(nodeIds);
      }
    },
    [chatAboutNodes]
  );
  return useCallback((nodeIds: readonly string[]) => {
    pending.current = nodeIds;
  }, []);
}
