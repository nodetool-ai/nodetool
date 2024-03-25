from typing import Any, Optional
from collections import deque
from typing import List
import copy
import uuid

from pydantic import BaseModel, Field
from nodetool.api.types.graph import Edge
from nodetool.workflows.base_node import InputNode, BaseNode, OutputNode
from nodetool.metadata.types import TypeMetadata
from nodetool.workflows.base_node import get_node_class


def any_type_in_union(union_type: TypeMetadata, other_type: TypeMetadata):
    """
    Matches a union type and another type.

    For example, if the union type is `Union[int, float]` and the other type is `int`, this function will return True.
    """
    return any(is_connectable(t, other_type) for t in union_type.type_args)


def is_connectable(source: TypeMetadata, target: TypeMetadata) -> bool:
    """
    Returns true if the type
    """
    if source.type == "any" or target.type == "any":
        return True
    if source.type == "union":
        return any(any_type_in_union(target, s) for s in source.type_args)
    if source.type == target.type:
        if source.type == "list" or source.type == "dict":
            return all(
                is_connectable(t, u) for t, u in zip(source.type_args, target.type_args)
            )
        if source.type == "enum":
            return (
                source.values is not None
                and target.values is not None
                and set(source.values) == set(target.values)
            )
        return True
    if target.type == "union":
        return any_type_in_union(target, source)
    return False


class Graph(BaseModel):
    nodes: list[BaseNode] = Field(default_factory=list)  # type: ignore
    edges: list[Edge] = Field(default_factory=list)

    @classmethod
    def from_dict(cls, graph: dict[str, Any]):
        """
        Create a Graph object from a dictionary representation.
        The format is the same as the one used in the frontend.

        Args:
            graph (dict[str, Any]): The dictionary representing the Graph.
        """
        return cls(
            nodes=[BaseNode.from_dict(node) for node in graph["nodes"]],
            edges=graph["edges"],
        )

    def inputs(self) -> List[InputNode]:
        """
        Returns a list of nodes that inherit from InputNode.
        """
        return [node for node in self.nodes if isinstance(node, InputNode)]

    def outputs(self) -> List[OutputNode]:
        """
        Returns a list of nodes that have no outgoing edges.
        """
        return [node for node in self.nodes if isinstance(node, OutputNode)]

    def get_input_schema(self):
        """
        Returns a JSON schema for input nodes of the graph.
        """
        return {
            "type": "object",
            "properties": {node.name: node.get_json_schema() for node in self.inputs()},
        }

    def get_output_schema(self):
        """
        Returns a JSON schema for the output nodes of the graph.
        """
        return {
            "type": "object",
            "properties": {
                node.name: node.get_json_schema() for node in self.outputs()
            },
        }


def topological_sort(edges: list[Edge], nodes: list[BaseNode]) -> List[List[str]]:
    """
    Sorts the graph topologically.

    This function is based on the Kahn's algorithm.

    It works like this:
    1. Find all nodes with no incoming edges and add them to a queue.
    2. While the queue is not empty:
        1. Remove a node from the queue and add it to the sorted list.
        2. Remove all outgoing edges from the node.
        3. If any of the nodes that the edges point to have no incoming edges, add them to the queue.

    Returns a list of lists, where each list contains the nodes that are on the same level.
    This is useful for parallelizing the execution of the graph.
    """
    edges = copy.deepcopy(edges)
    indegree: dict[str, int] = {node.id: 0 for node in nodes}

    for edge in edges:
        indegree[edge.target] += 1

    queue = deque(node_id for node_id, degree in indegree.items() if degree == 0)

    sorted_nodes = []
    while queue:
        level_nodes = []
        for _ in range(len(queue)):
            n = queue.popleft()
            level_nodes.append(n)
            for edge in edges.copy():
                if edge.source == n:
                    edges.remove(edge)
                    indegree[edge.target] -= 1
                    if indegree[edge.target] == 0:
                        queue.append(edge.target)

        sorted_nodes.append(level_nodes)

    # if any(indegree[node_id] != 0 for node_id in indegree.keys()):
    #     raise ValueError("Graph contains at least one cycle")

    return sorted_nodes


def subgraph(
    edges: list[Edge],
    nodes: list[BaseNode],
    start_node: BaseNode,
    stop_node: BaseNode | None = None,
) -> tuple[list[Edge], list[BaseNode]]:
    """
    Finds a subgraph within a given graph, starting from a specified start node and optionally stopping at a specified stop node.

    Args:
        edges (list[Edge]): A list of edges in the graph.
        nodes (list[Node]): A list of nodes in the graph.
        start_node (Node): The node to start the subgraph from.
        stop_node (Node | None, optional): The node at which to stop the subgraph. Defaults to None.

    Returns:
        tuple[list[Edge], list[Node]]: A tuple containing the edges and nodes that form the subgraph.

    Assumptions:
        - The graph is represented by a list of edges and a list of nodes.
        - The `start_node` and `stop_node` arguments are valid nodes in the graph.
        - The graph is a connected graph, meaning there is a path between any two nodes in the graph.
    """

    # Keep track of visited nodes
    visited = set()
    # Use a stack to perform a depth-first search
    stack = [start_node.id]
    result_edges: list[Edge] = []
    result_nodes: list[BaseNode] = []

    while stack:
        current_node_id = stack.pop()

        if current_node_id in visited:
            continue

        visited.add(current_node_id)

        if stop_node and current_node_id == stop_node.id:
            break

        # Find and collect connected nodes
        for edge in edges:
            if edge.source == current_node_id:
                if edge.target not in visited:
                    stack.append(edge.target)

    # Add nodes to result based on visited nodes
    for node in nodes:
        if node.id in visited:
            result_nodes.append(node)

    # Add edges to result based on visited nodes
    for edge in edges:
        if edge.source in visited and edge.target in visited:
            result_edges.append(edge)

    return result_edges, result_nodes
