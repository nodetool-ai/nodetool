import dagre from "dagre";
import { Edge, Node } from "../../stores/ApiTypes";

export const autoLayout = (edges: Edge[], nodes: Node[]): Node[] => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({ rankdir: "LR" });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: 200,
      height: 300
    });
  });

  edges.forEach((el) => {
    dagreGraph.setEdge(el.source, el.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node: Node) => {
    const dnode = dagreGraph.node(node.id);
    return {
      id: node.id,
      type: node.type,
      data: node.data,
      width: dnode.width,
      height: dnode.height,
      ui_properties: {
        position: {
          x: dnode.x,
          y: dnode.y
        }
      }
    };
  });
};
