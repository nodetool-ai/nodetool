import { useNodeStore } from "../../stores/NodeStore";
import { getMousePosition } from "../../utils/MousePosition";
import { useReactFlow, Edge, Node } from "reactflow";
import { uuidv4 } from "../../stores/uuidv4";
import { devWarn } from "../../utils/DevLog";
import useSessionStateStore from "../../stores/SessionStateStore";
import { useClipboard } from "../browser/useClipboard";
import { NodeData } from "../../stores/NodeData";

export const useCopyPaste = () => {
  const reactFlow = useReactFlow();
  const { nodes, edges, setEdges, setNodes } = useNodeStore((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    setEdges: state.setEdges,
    setNodes: state.setNodes
  }));

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
    if (!mousePosition) {
      devWarn("Mouse position not available");
      return;
    }

    const elementUnderCursor = document.elementFromPoint(
      mousePosition.x,
      mousePosition.y
    );

    if (
      elementUnderCursor?.classList.contains("react-flow__pane") ||
      (elementUnderCursor?.classList.contains("action") &&
        !document.activeElement?.classList.contains("MuiInputBase-input"))
    ) {
      const { nodes: copiedNodes, edges: copiedEdges } = parsedData;
      const oldToNewIds = new Map<string, string>();
      const newNodes: Node<NodeData>[] = [];
      const newEdges: Edge[] = [];

      // create new IDs for all nodes
      copiedNodes.forEach((node: Node<NodeData>) => {
        oldToNewIds.set(node.id, uuidv4());
      });

      // calculate offset for pasting
      const firstNodePosition = reactFlow.screenToFlowPosition({
        x: mousePosition.x,
        y: mousePosition.y
      });

      if (!firstNodePosition) {
        devWarn("Failed to calculate paste position");
        return;
      }

      const offset = {
        x: firstNodePosition.x - copiedNodes[0].position.x,
        y: firstNodePosition.y - copiedNodes[0].position.y
      };

      // create new nodes with updated IDs and parent references
      for (const node of copiedNodes) {
        const newId = oldToNewIds.get(node.id)!;
        let newParentId: string | undefined;

        // check if parent exists in copied nodes
        if (node.parentId && oldToNewIds.has(node.parentId)) {
          newParentId = oldToNewIds.get(node.parentId);
        } else {
          newParentId = undefined;
        }

        const newNode: Node<NodeData> = {
          ...node,
          id: newId,
          parentId: newParentId,
          position: {
            x: node.position.x + (newParentId ? 0 : offset.x),
            y: node.position.y + (newParentId ? 0 : offset.y)
          },
          selected: false
        };

        if (newNode.positionAbsolute) {
          newNode.positionAbsolute = {
            x: newNode.positionAbsolute.x + offset.x,
            y: newNode.positionAbsolute.y + offset.y
          };
        }

        delete (newNode as any).parentNode;

        newNodes.push(newNode);
      }

      // Update edges
      copiedEdges.forEach((edge: Edge) => {
        const newSource = oldToNewIds.get(edge.source);
        const newTarget = oldToNewIds.get(edge.target);

        if (newSource && newTarget) {
          newEdges.push({
            ...edge,
            id: uuidv4(),
            source: newSource,
            target: newTarget
          });
        }
      });

      // Update state
      setNodes([...nodes, ...newNodes]);
      setEdges([...edges, ...newEdges]);
    }
  };

  return { handleCopy, handlePaste };
};
