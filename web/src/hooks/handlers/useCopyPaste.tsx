import { useNodeStore } from "../../stores/NodeStore";
import { getMousePosition } from "../../utils/MousePosition";
import { useReactFlow, Edge, Node } from "reactflow";
import { uuidv4 } from "../../stores/uuidv4";
import { devLog, devWarn } from "../../utils/DevLog";
import useSessionStateStore from "../../stores/SessionStateStore";
import { useClipboard } from "../browser/useClipboard";

const findNewNodeId = (
  oldId: string,
  copiedNodes: Node[],
  newNodes: Node[]
): string => {
  const oldNodeIndex = copiedNodes.findIndex((node) => node.id === oldId);
  return oldNodeIndex !== -1 ? newNodes[oldNodeIndex].id : oldId;
};

export const useCopyPaste = () => {
  const reactFlow = useReactFlow();
  const { nodes, edges, setEdges, setNodes } = useNodeStore();
  const { readClipboard, writeClipboard } = useClipboard();
  const selectedNodes = useSessionStateStore.getState().selectedNodes;

  const handleCopy = async (nodeId?: string) => {
    const focusedElement = document.activeElement as HTMLElement;
    if (
      (focusedElement.classList.contains("MuiInput-input") &&
        !focusedElement.classList.contains("action")) ||
      focusedElement.tagName === "TEXTAREA"
    ) {
      return;
    }

    let nodesToCopy: Node[];
    if (nodeId && nodeId !== "") {
      // Find the node with the given nodeId
      const node = nodes.find((node: any) => node.id === nodeId);
      if (node) {
        nodesToCopy = [node];
      } else {
        nodesToCopy = [];
      }
    } else {
      nodesToCopy = selectedNodes;
    }
    if (nodesToCopy.length === 0) {
      return;
    }
    const nodesToCopyIds = nodesToCopy.map((node) => node.id);
    const connectedEdges = edges.filter(
      (edge) =>
        nodesToCopyIds.includes(edge.source) ||
        nodesToCopyIds.includes(edge.target)
    );
    const serializedData = JSON.stringify({
      nodes: nodesToCopy,
      edges: connectedEdges
    });
    await writeClipboard(serializedData);
  };

  const handlePaste = async () => {
    await readClipboard();
    const { clipboardData, isClipboardValid } = useSessionStateStore.getState();
    if (!isClipboardValid || clipboardData === null) {
      return;
    }

    let parsedData;
    try {
      parsedData = JSON.parse(clipboardData);
    } catch (parseError) {
      devWarn("Failed to parse clipboard data:", parseError);
      return;
    }

    const mousePosition = getMousePosition();
    const elementUnderCursor = document.elementFromPoint(
      mousePosition.x,
      mousePosition.y
    );
    if (!mousePosition) {
      devWarn("Mouse position not available");
      return;
    }

    if (
      elementUnderCursor?.classList.contains("react-flow__pane") ||
      (elementUnderCursor?.classList.contains("action") &&
        !document.activeElement?.classList.contains("MuiInputBase-input"))
    ) {
      const { nodes: copiedNodes, edges: copiedEdges } = parsedData;
      if (copiedNodes.length === 0) {
        devLog("No nodes to paste");
        return;
      }

      // const firstNodePosition = reactFlow.screenToFlowPosition({
      const firstNodePosition = reactFlow.screenToFlowPosition({
        x: mousePosition.x,
        y: mousePosition.y
      });

      if (!firstNodePosition) {
        devWarn("firstNodePosition is undefined");
        return;
      }

      const offset = {
        x: firstNodePosition.x - copiedNodes[0].position.x,
        y: firstNodePosition.y - copiedNodes[0].position.y
      };

      const newNodes = copiedNodes.map((node: any) => ({
        ...node,
        id: uuidv4(),
        selected: false,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y
        }
      }));

      const newEdges = copiedEdges.map((edge: Edge) => ({
        ...edge,
        id: uuidv4(),
        source: findNewNodeId(edge.source, copiedNodes, newNodes),
        target: findNewNodeId(edge.target, copiedNodes, newNodes)
      }));

      const validEdges = newEdges.filter(
        (edge: Edge) =>
          newNodes.some((node: any) => node.id === edge.source) &&
          newNodes.some((node: any) => node.id === edge.target)
      );

      setNodes([...nodes, ...newNodes]);
      setEdges([...edges, ...validEdges]);
    }
  };

  return { handleCopy, handlePaste };
};
