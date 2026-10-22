/** Hook for copy/paste functionality of nodes and edges in the flow editor. */

import { getMousePosition } from "../../utils/MousePosition";
import { useReactFlow, useStoreApi, Edge, Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useCallback, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import useSessionStateStore from "../../stores/SessionStateStore";
import { useClipboardContentPaste } from "./useClipboardContentPaste";
import { isTextInputActive } from "../../utils/browser";
import { absoluteNodePosition } from "../../utils/absoluteNodePosition";
import { withGroupContents } from "../../utils/withGroupContents";
import { insertGraphFragment, type GraphFragment } from "./insertGraphFragment";

/** Flow units between a paste and the one before it at the same spot. */
const PASTE_OFFSET = 40;

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

/**
 * Text from the system clipboard, or `unreadable` when the browser gives no
 * access: no Clipboard API (a page served over plain http on a LAN address)
 * or a denied read permission.
 */
const readSystemClipboardText = async (): Promise<
  { readable: true; text: string | null } | { readable: false }
> => {
  try {
    if (window.api?.clipboard?.readText) {
      return { readable: true, text: await window.api.clipboard.readText() };
    }
    if (navigator.clipboard?.readText) {
      return { readable: true, text: await navigator.clipboard.readText() };
    }
  } catch (error) {
    console.debug("Clipboard read failed:", error);
  }
  return { readable: false };
};

const parseClipboardData = (text: string | null | undefined): ClipboardData | null => {
  if (!text) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isClipboardData(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

interface UseCopyPasteResult {
  handleCopy: (nodeId?: string) => Promise<{ nodesToCopy: Node<NodeData>[]; connectedEdges: Edge[] }>;
  handleCut: (nodeId?: string) => Promise<void>;
  /** `at` is the screen point to paste at; the mouse position otherwise. */
  handlePaste: (at?: { x: number; y: number }) => Promise<void>;
}

export const useCopyPaste = (): UseCopyPasteResult => {
  const reactFlow = useReactFlow();
  const flowStore = useStoreApi();
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

  const { handleContentPaste, readClipboardContent } =
    useClipboardContentPaste();

  // The last paste's anchor, so pasting again without moving the pointer
  // offsets the copy instead of stacking it exactly on the previous one.
  const lastPasteRef = useRef<{ x: number; y: number } | null>(null);

  /**
   * Flow position for a paste: `at`, else the pointer when it is over this
   * canvas, else the canvas centre. Repeated pastes at one spot step down and
   * to the right.
   */
  const pastePosition = useCallback(
    (at?: { x: number; y: number }): { x: number; y: number } | null => {
      let screen = at ?? getMousePosition();
      const rect = flowStore.getState().domNode?.getBoundingClientRect();
      if (
        rect &&
        (!screen ||
          screen.x < rect.left ||
          screen.x > rect.right ||
          screen.y < rect.top ||
          screen.y > rect.bottom)
      ) {
        screen = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
      if (!screen) {
        return null;
      }
      let position = reactFlow.screenToFlowPosition(screen);
      const last = lastPasteRef.current;
      if (
        last &&
        Math.abs(last.x - position.x) < PASTE_OFFSET &&
        Math.abs(last.y - position.y) < PASTE_OFFSET
      ) {
        position = { x: last.x + PASTE_OFFSET, y: last.y + PASTE_OFFSET };
      }
      lastPasteRef.current = position;
      return position;
    },
    [flowStore, reactFlow]
  );

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

      // A group is copied with everything inside it.
      const nodesToCopy = withGroupContents(
        nodeId ? [nodeId] : selectedNodes.map((node) => node.id),
        nodes
      );
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
    //    When the system clipboard cannot be read, the copy kept in session
    //    state is the only one there is.
    const systemClipboard = await readSystemClipboardText();
    const parsedData = systemClipboard.readable
      ? parseClipboardData(systemClipboard.text)
      : parseClipboardData(useSessionStateStore.getState().clipboardData);

    // 2. If clipboard text is not valid node data, check for images/files/other content
    if (!parsedData) {
      if (!systemClipboard.readable) {
        console.debug("Clipboard not readable and no nodes were copied");
        return;
      }
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

    const flowPosition = pastePosition(at);
    if (!flowPosition) {
      console.warn("Failed to calculate paste position");
      return;
    }

    insertGraphFragment(nodeStore, parsedData, flowPosition);
  }, [nodeStore, pastePosition, handleContentPaste, readClipboardContent]);

  return { handleCopy, handleCut, handlePaste };
};
