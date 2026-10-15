/** Hook for copy/paste functionality of nodes and edges in the flow editor. */

import { getMousePosition } from "../../utils/MousePosition";
import { useReactFlow, Edge, Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import useSessionStateStore from "../../stores/SessionStateStore";
import { useClipboardContentPaste } from "./useClipboardContentPaste";
import { isTextInputActive } from "../../utils/browser";
import { absoluteNodePosition } from "../../utils/absoluteNodePosition";
import { insertGraphFragment, type GraphFragment } from "./insertGraphFragment";

/** Lineage links are absent in older clipboard data. */
type ClipboardData = GraphFragment;

const isValidNode = (node: unknown): node is Node<NodeData> =>
  !!node && typeof node === "object" && "id" in node && typeof node.id === "string";

const isValidEdge = (edge: unknown): edge is Edge =>
  !!edge && typeof edge === "object" && "source" in edge && "target" in edge && typeof edge.source === "string" && typeof edge.target === "string";

const isClipboardData = (value: unknown): value is ClipboardData =>
  !!value &&
  typeof value === "object" &&
  "nodes" in value &&
  "edges" in value &&
  Array.isArray(value.nodes) &&
  Array.isArray(value.edges) &&
  value.nodes.every(isValidNode) &&
  value.edges.every(isValidEdge);

interface UseCopyPasteResult {
  handleCopy: (nodeId?: string) => Promise<{ nodesToCopy: Node<NodeData>[]; connectedEdges: Edge[] }>;
  handleCut: (nodeId?: string) => Promise<void>;
  /** `at` is the screen point to paste at; the mouse position otherwise. */
  handlePaste: (at?: { x: number; y: number }) => Promise<void>;
}

export const useCopyPaste = (): UseCopyPasteResult => {
  const reactFlow = useReactFlow();
  // Use the live store ref so all callbacks always read the latest state,
  // avoiding stale-closure bugs when the user acts faster than React's
  // async effect scheduling (e.g. rubber-band select then immediately Ctrl+C).
  const nodeStore = useNodeStoreRef();
  const { setClipboardData, setIsClipboardValid } = useSessionStateStore(
    useShallow((state) => ({
      setClipboardData: state.setClipboardData,
      setIsClipboardValid: state.setIsClipboardValid
    }))
  );

  const { handleContentPaste, readClipboardContent, readClipboardText } =
    useClipboardContentPaste();

  const handleCopy = useCallback(
    async (nodeId?: string) => {
      if (!nodeId && isTextInputActive()) return { nodesToCopy: [], connectedEdges: [] };

      // Always read fresh state to avoid stale closures.
      const { nodes, edges, links, getSelectedNodes } = nodeStore.getState();
      const selectedNodes = getSelectedNodes();

      // Allow the browser to handle text copy when no nodes are selected and
      // text is highlighted. But when nodes ARE selected, always copy them —
      // rubber-band selection can accidentally create a text selection, which
      // would otherwise silently block multi-node copy.
      if (!nodeId && selectedNodes.length === 0 && (window.getSelection()?.toString().length ?? 0) > 0) {
        return { nodesToCopy: [], connectedEdges: [] };
      }

      let nodesToCopy: Node<NodeData>[];
      if (nodeId && nodeId !== "") {
        const node = nodes.find((node) => node.id === nodeId);
        nodesToCopy = node ? [node] : [];
      } else {
        nodesToCopy = selectedNodes;
      }
      if (nodesToCopy.length === 0) {
        return { nodesToCopy: [], connectedEdges: [] };
      }
      const nodesToCopyIds = nodesToCopy.map((node) => node.id);
      const nodesToCopyIdsSet = new Set(nodesToCopyIds);
      const connectedEdges = edges.filter(
        (edge) =>
          nodesToCopyIdsSet.has(edge.source) ||
          nodesToCopyIdsSet.has(edge.target)
      );
      // A node copied without its group is pasted outside any group, so it
      // carries its canvas position rather than one relative to that group.
      const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
      const clipboardNodes = nodesToCopy.map((node) =>
        node.parentId && !nodesToCopyIdsSet.has(node.parentId)
          ? {
              ...node,
              parentId: undefined,
              position: absoluteNodePosition(node, nodeById)
            }
          : node
      );
      const copiedLinks = links.filter(
        (link) =>
          nodesToCopyIdsSet.has(link.source) &&
          nodesToCopyIdsSet.has(link.target)
      );
      const clipboard: ClipboardData = {
        nodes: clipboardNodes,
        edges: connectedEdges
      };
      if (copiedLinks.length > 0) {
        clipboard.links = copiedLinks;
      }
      const serializedData = JSON.stringify(clipboard);

      // Use Electron's clipboard API if available, otherwise fallback to browser clipboard API
      if (window.api?.clipboard?.writeText) {
        await window.api.clipboard.writeText(serializedData);
      } else if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(serializedData);
        } catch (error) {
          console.debug("Browser clipboard write failed:", error);
        }
      }

      // Let UI know we have valid node data available for paste
      setClipboardData(serializedData);
      setIsClipboardValid(true);

      return { nodesToCopy, connectedEdges };
    },
    [nodeStore, setClipboardData, setIsClipboardValid]
  );

  const handleCut = useCallback(
    async (nodeId?: string) => {
      const { nodesToCopy } = await handleCopy(nodeId);

      if (nodesToCopy.length === 0) {
        return;
      }

      // Go through deleteNodes rather than filtering the arrays directly: it
      // re-parents children of a cut group back to the canvas (converting their
      // parent-relative position to absolute) and clears errors/results. A raw
      // setNodes would leave orphans pointing at a deleted parentId.
      // Read fresh state so we don't lose nodes added after the cut callback was created.
      const { deleteNodes } = nodeStore.getState();
      deleteNodes(nodesToCopy.map((n) => n.id));
    },
    [handleCopy, nodeStore]
  );

  const handlePaste = useCallback(async (at?: { x: number; y: number }) => {
    // Skip paste handling if user is typing in a text field (should use native paste instead)
    if (isTextInputActive()) {
      return;
    }

    // 1. Check plain text clipboard for valid node JSON first.
    //    This must happen before readClipboardContent() because that function
    //    prioritizes image/HTML formats which can intercept node JSON text
    //    (e.g. some environments wrap clipboard text in HTML tags).
    let clipboardData: string | null = null;
    const clipboardText = await readClipboardText();
    if (clipboardText) {
      try {
        const parsed: unknown = JSON.parse(clipboardText);
        if (isClipboardData(parsed)) {
          clipboardData = clipboardText;
        }
      } catch {
        // Not JSON, continue to other checks
      }
    }

    // 2. If clipboard text is not valid node data, check for images/files/other content
    if (!clipboardData) {
      const clipboardContent = await readClipboardContent();

      if (
        clipboardContent.type === "image" ||
        clipboardContent.type === "file"
      ) {
        await handleContentPaste();
        return;
      }

      // For text/HTML/RTF types that aren't node JSON, handle as content paste
      if (
        clipboardContent.type === "text" ||
        clipboardContent.type === "html" ||
        clipboardContent.type === "rtf"
      ) {
        await handleContentPaste();
        return;
      }

      // No valid clipboard content found
      console.debug("No valid data found in clipboard");
      return;
    }

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(clipboardData);
    } catch {
      return;
    }

    if (!isClipboardData(parsedData)) {
      return;
    }

    const mousePosition = at ?? getMousePosition();
    if (!mousePosition) {
      console.warn("Mouse position not available");
      return;
    }

    const flowPosition = reactFlow.screenToFlowPosition({
      x: mousePosition.x,
      y: mousePosition.y
    });
    if (!flowPosition) {
      console.warn("Failed to calculate paste position");
      return;
    }

    insertGraphFragment(nodeStore, parsedData, flowPosition);
  }, [
    nodeStore,
    reactFlow,
    handleContentPaste,
    readClipboardContent,
    readClipboardText
  ]);

  return { handleCopy, handleCut, handlePaste };
};
