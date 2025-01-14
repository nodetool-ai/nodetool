from typing import Any, List, Sequence
from collections import deque

from pydantic import BaseModel, Field
from nodetool.types.graph import Edge
from nodetool.workflows.base_node import (
    GroupNode,
    InputNode,
    BaseNode,
    OutputNode,
)


class Graph(BaseModel):
    """
    Represents a graph data structure for workflow management and analysis.

    This class encapsulates the functionality for creating, manipulating, and analyzing
    directed graphs, particularly in the context of workflow systems. It provides methods
    for managing nodes and edges, identifying input and output nodes, generating schemas,
    and performing topological sorting.

    Key features:
    - Node and edge management
    - Input and output node identification
    - JSON schema generation for inputs and outputs
    - Topological sorting of nodes

    The Graph class is designed to support various operations on workflow graphs,
    including dependency analysis, execution order determination, and subgraph handling.
    It is particularly useful for systems that need to represent and process complex,
    interconnected workflows or data pipelines.

    Attributes:
        nodes (list[BaseNode]): A list of nodes in the graph.
        edges (list[Edge]): A list of edges connecting the nodes.

    Methods:
        find_node: Locates a node by its ID.
        from_dict: Creates a Graph instance from a dictionary representation.
        inputs: Returns a list of input nodes.
        outputs: Returns a list of output nodes.
        get_input_schema: Generates a JSON schema for the graph's inputs.
        get_output_schema: Generates a JSON schema for the graph's outputs.
        topological_sort: Performs a topological sort on the graph's nodes.

    The class leverages Pydantic for data validation and serialization, making it
    robust for use in larger systems that require strict type checking and easy
    integration with APIs or databases.
    """

    nodes: Sequence[BaseNode] = Field(default_factory=list)
    edges: Sequence[Edge] = Field(default_factory=list)

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
            nodes=[
                BaseNode.from_dict(node, skip_errors=True) for node in graph["nodes"]
            ],
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

    def topological_sort(self, parent_id: str | None = None) -> List[List[str]]:
        """
        Perform a topological sort on the graph, grouping nodes by levels.

        This method implements a modified version of Kahn's algorithm for topological sorting.
        It sorts the nodes of the graph into levels, where each level contains nodes
        that can be processed in parallel.

        Args:
            parent_id (str | None, optional): The ID of the parent node to filter results. Defaults to None.

        Returns:
            List[List[str]]: A list of lists, where each inner list contains the node IDs at the same level
                             in the topological order. Nodes in the same list can be processed in parallel.

        Notes:
        - The method does not modify the original graph structure.
        - Nodes are only included in the output if their parent_id matches the given parent_id.
        - If a cycle exists, some nodes may be omitted from the result.
        """
        # child nodes of regular groups (no loops) can be executed like top level nodes
        if parent_id is None:
            group_nodes = {node.id for node in self.nodes if type(node) is GroupNode}
        else:
            group_nodes = set()

        # Filter nodes with given parent_id
        nodes = [
            node
            for node in self.nodes
            if node.parent_id == parent_id or node.parent_id in group_nodes
        ]
        node_ids = {node.id for node in nodes}

        # Filter edges to only include those connected to the filtered nodes
        edges = [
            edge
            for edge in self.edges
            if edge.source in node_ids and edge.target in node_ids
        ]

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
                for edge in edges[:]:  # Iterate over a copy of the list
                    if edge.source == n:
                        edges.remove(edge)
                        indegree[edge.target] -= 1
                        if indegree[edge.target] == 0:
                            queue.append(edge.target)

            if level_nodes:
                sorted_nodes.append(level_nodes)

        if any(indegree[node_id] != 0 for node_id in indegree.keys()):
            print("Graph contains at least one cycle")

        return sorted_nodes
