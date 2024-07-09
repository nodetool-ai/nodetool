from pydantic import BaseModel


from typing import Any, List


class Node(BaseModel):
    id: str
    parent_id: str | None = None
    type: str = "default"
    data: Any = {}
    ui_properties: Any = {}


class Edge(BaseModel):
    id: str | None = None
    source: str
    sourceHandle: str
    target: str
    targetHandle: str
    ui_properties: dict[str, str] | None = None


class Graph(BaseModel):
    nodes: List[Node]
    edges: List[Edge]


def remove_connected_slots(graph: Graph) -> Graph:
    """
    Clears specific slots in the data field of nodes based on connected target handles.

    Args:
        graph (Graph): The graph object containing nodes and edges.

    Returns:
        Graph: The updated graph object with cleared slots.

    """

    # Create a dictionary to store nodes and their connected target handles
    nodes_with_incoming_edges = {}

    # Populate the dictionary
    for edge in graph.edges:
        if edge.target not in nodes_with_incoming_edges:
            nodes_with_incoming_edges[edge.target] = set()
        nodes_with_incoming_edges[edge.target].add(edge.targetHandle)

    # Clear specific slots in the data field of nodes based on connected target handles
    for node in graph.nodes:
        if node.id in nodes_with_incoming_edges:
            connected_handles = nodes_with_incoming_edges[node.id]

            for slot in connected_handles:
                if slot in node.data:
                    del node.data[slot]

    return graph
