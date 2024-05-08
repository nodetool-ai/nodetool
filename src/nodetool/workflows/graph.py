from typing import Any, Optional
from collections import deque
from typing import List
import copy

from pydantic import BaseModel, Field
from nodetool.api.types.graph import Edge
from nodetool.workflows.base_node import GroupNode
from nodetool.workflows.base_node import (
    InputNode,
    BaseNode,
    OutputNode,
)
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
    """
    This class represents a graph data structure containing nodes and edges.
    It supports operations to manipulate and transform the graph, particularly
    in terms of handling subgraphs and their connections.
    """

    nodes: list[BaseNode] = Field(default_factory=list)  # type: ignore
    edges: list[Edge] = Field(default_factory=list)

    def build_sub_graphs(self):
        """
        This method organizes nodes into their respective subgraphs based on the
        group node they belong to and reconnects the edges accordingly. It also
        ensures that only nodes that are not part of any group remain in the
        main graph node list after the subgraphs are formed.

        Process:
        1. Identify Group Nodes: It first identifies all nodes that are
        instances of GroupNode .
        2. Assign Children to Groups: Each node is checked if it belongs
        to a group (i.e., if its parent_id is in the dictionary of group nodes).
        If so, it is added to the corresponding group node.
        3. Reconnect Edges: reassigns the edges to connect to the group nodes
        instead of the child nodes.
        """
        group_nodes: dict[str, GroupNode] = {
            node.id: node for node in self.nodes if isinstance(node, GroupNode)
        }
        for node in self.nodes:
            parent_id = node.parent_id
            if parent_id and parent_id in group_nodes:
                group_nodes[parent_id].append_node(node)

        edges = self.reconnect_edges(group_nodes)

        # Remove child nodes from groups
        nodes = [node for node in self.nodes if not node.has_parent()]

        return Graph(nodes=nodes, edges=edges)

    def reconnect_edges(self, group_nodes: dict[str, GroupNode]):
        """
        Revises the graph's edge connections after nodes have been structured
        into groups.

        Process:
        1. Create a new list of edges.
        2. For each edge in the original list, check if the source or target
        nodes are part of a group. If they are, the edge is updated to connect
        to the group node instead. They must be either Group Input or Group
        Output nodes.
        3. If both the source and target nodes are part of the same group, the
        edge is added to that group.
        4. If source and target nodes are part of different groups, the edge is
        """
        from nodetool.nodes.nodetool.input import GroupInput
        from nodetool.nodes.nodetool.output import GroupOutput

        edges = []
        for edge in self.edges:
            source = self.find_node(edge.source)
            target = self.find_node(edge.target)

            # Skip edges that are not connected to any node
            if not source or not target:
                continue

            if source.parent_id and source.parent_id == target.parent_id:
                group_nodes[source.parent_id].append_edge(edge)
            else:
                source_id = edge.source
                target_id = edge.target
                source_handle = edge.sourceHandle
                target_handle = edge.targetHandle

                if source.parent_id and isinstance(source, GroupOutput):
                    assert target.parent_id != source.parent_id, (
                        "Group output nodes cannot be connected to another node in the same group. "
                        f"Source: {source.parent_id}, Target: {target.parent_id}"
                    )
                    source_id = source.parent_id
                    source_handle = source.name

                if target.parent_id and isinstance(target, GroupInput):
                    assert source.parent_id != target.parent_id, (
                        "Group input nodes cannot be connected to another node in the same group. "
                        f"Source: {source.parent_id}, Target: {target.parent_id}"
                    )
                    target_id = target.parent_id
                    target_handle = target.name

                edges.append(
                    Edge(
                        source=source_id,
                        target=target_id,
                        sourceHandle=source_handle,
                        targetHandle=target_handle,
                    )
                )

        return edges

    def find_node(self, node_id: str) -> BaseNode | None:
        """
        Find a node by its id.
        """
        for node in self.nodes:
            if node._id == node_id:
                return node
        return None

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
