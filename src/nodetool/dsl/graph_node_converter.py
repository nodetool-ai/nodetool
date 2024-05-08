from nodetool.api.types.graph import Edge
from nodetool.dsl.graph import GraphNode
from nodetool.workflows.base_node import BaseNode, get_node_class


class GraphNodeConverter:
    """
    Converts GraphNode objects into node instances and manages the creation of edges between nodes.
    """

    edges: list[Edge]
    nodes: dict[str, BaseNode]
    next_node_id: str
    next_edge_id: str

    def __init__(self):
        self.edges = []
        self.nodes = {}
        self.next_node_id = "0"
        self.next_edge_id = "0"

    def get_next_node_id(self) -> str:
        """
        Returns the next available node ID.
        """
        self.next_node_id = str(int(self.next_node_id) + 1)
        return self.next_node_id

    def get_next_edge_id(self) -> str:
        """
        Returns the next available edge ID.
        """
        self.next_edge_id = str(int(self.next_edge_id) + 1)
        return self.next_edge_id

    def add(self, graph_node: GraphNode):
        """
        Adds a GraphNode to the converter and creates edges between nodes if necessary.

        Args:
          graph_node (GraphNode): The GraphNode to add.

        Returns:
          BaseNode: The created node instance.
        """
        # make sure all node types are imported
        import nodetool.nodes

        if graph_node.id in self.nodes:
            return self.nodes[graph_node.id]
        graph_node.id = self.get_next_node_id()
        node_data = {}
        for field_name in graph_node.model_fields.keys():
            value = getattr(graph_node, field_name)
            if value is None:
                continue
            if isinstance(value, tuple) and len(value) == 2:
                source_node, slot = value
                source_node_instance = self.add(source_node)
                self.edges.append(
                    Edge(
                        source=str(source_node_instance._id),
                        sourceHandle=slot,
                        target=str(graph_node.id),
                        targetHandle=field_name,
                    )
                )
            elif isinstance(value, GraphNode):
                source_node_instance = self.add(value)
                self.edges.append(
                    Edge(
                        source=str(source_node_instance._id),
                        sourceHandle="output",
                        target=str(graph_node.id),
                        targetHandle=field_name,
                    )
                )
            else:
                node_data[field_name] = value

        node_cls = get_node_class(graph_node.get_node_type())

        assert (
            node_cls is not None
        ), f"Node class {graph_node.get_node_type()} not found"

        node_instance = node_cls(**node_data)
        self.nodes[graph_node.id] = node_instance
        return node_instance
