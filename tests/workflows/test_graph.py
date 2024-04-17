import pytest
from nodetool.api.types.graph import Edge
from nodetool.workflows.base_node import GroupNode
from nodetool.nodes.nodetool.input import FloatInputNode, GroupInputNode
from nodetool.nodes.nodetool.output import GroupOutputNode
from nodetool.workflows.base_node import BaseNode

from nodetool.workflows.graph import Graph, topological_sort
import pytest
from nodetool.workflows.graph import Graph
from nodetool.workflows.base_node import (
    BaseNode,
)
from nodetool.api.types.graph import Edge


class FooNode(BaseNode):
    value: str = "test"

    async def process(self) -> str:
        return self.value


@pytest.fixture(scope="function")
def graph():
    return Graph()


@pytest.fixture(scope="function")
def complex_group_graph():
    # Create a graph instance
    g = Graph()

    # Add group nodes
    group1 = GroupNode(id="group1")

    # Add regular nodes
    node1 = FooNode(id="node1", parent_id="group1")  # inner node
    node2 = FooNode(id="node2")  # connected to input
    node3 = FooNode(id="node3")  # connected to output

    # Add group-specific nodes
    input_node = GroupInputNode(id="input1", parent_id="group1")
    output_node = GroupOutputNode(id="output1", parent_id="group1")

    # Add edges
    edge1 = Edge(
        source="node2", target="input1", sourceHandle="output", targetHandle="items"
    )
    edge2 = Edge(
        source="output1", target="node3", sourceHandle="output", targetHandle="value"
    )
    edge3 = Edge(
        source="node1", target="output1", sourceHandle="output", targetHandle="input"
    )
    edge4 = Edge(
        source="input1", target="node1", sourceHandle="output", targetHandle="value"
    )

    # Setup nodes and edges in graph
    g.nodes = [group1, node1, node2, node3, input_node, output_node]
    g.edges = [edge1, edge2, edge3, edge4]

    return g


@pytest.fixture(scope="function")
def complex_graph():
    graph.nodes = [
        FooNode(id="1"),
        FooNode(id="2"),
        FooNode(id="3"),
        FooNode(id="4"),
        FooNode(id="5"),
        FooNode(id="6"),
        FooNode(id="7"),
    ]
    graph.edges = [
        Edge(
            source="1",
            sourceHandle="output",
            target="2",
            targetHandle="value",
        ),
        Edge(
            source="1",
            sourceHandle="output",
            target="3",
            targetHandle="value",
        ),
        Edge(
            source="2",
            sourceHandle="output",
            target="4",
            targetHandle="value",
        ),
        Edge(
            source="2",
            sourceHandle="output",
            target="5",
            targetHandle="value",
        ),
        Edge(
            source="3",
            sourceHandle="output",
            target="6",
            targetHandle="value",
        ),
        Edge(
            source="3",
            sourceHandle="output",
            target="7",
            targetHandle="value",
        ),
        Edge(
            source="4",
            sourceHandle="output",
            target="5",
            targetHandle="value",
        ),
        Edge(
            source="6",
            sourceHandle="output",
            target="7",
            targetHandle="value",
        ),
    ]
    return graph


def test_topological_sort_empty_graph(graph):
    sorted_nodes = topological_sort(graph.edges, graph.nodes)
    assert sorted_nodes == [], "Should return empty list for empty graph"


def test_topological_sort_single_node(graph):
    node = BaseNode(id="1")
    graph.nodes = [node]
    sorted_nodes = topological_sort(graph.edges, graph.nodes)
    assert sorted_nodes == [
        ["1"],
    ], "Should return single node for graph with one node"


def test_topological_sort_three_layers(graph: Graph):
    node1 = FooNode(id="1")
    node2 = FooNode(id="2")
    node3 = FooNode(id="3")

    graph.nodes = [node1, node2, node3]
    graph.edges = [
        Edge(
            source=node1.id,
            sourceHandle="output",
            target=node2.id,
            targetHandle="value",
        ),
        Edge(
            source=node2.id,
            sourceHandle="output",
            target=node3.id,
            targetHandle="value",
        ),
    ]
    sorted_nodes = topological_sort(graph.edges, graph.nodes)

    assert sorted_nodes == [
        ["1"],
        ["2"],
        ["3"],
    ], "Should return nodes in topological order"


def test_topological_sort_complex_graph(complex_graph: Graph):
    sorted_nodes = topological_sort(complex_graph.edges, complex_graph.nodes)

    assert sorted_nodes == [
        ["1"],
        ["2", "3"],
        ["4", "6"],
        ["5", "7"],
    ], "Should return nodes in topological order"


def test_json_schema(graph: Graph):
    a = FloatInputNode(
        id="1", name="a", label="", description="Test input node", value=10.0
    )
    b = FloatInputNode(
        id="2", name="b", label="", description="Test input node", value=10.0
    )

    graph.nodes = [a, b]

    json_schema = graph.get_input_schema()

    assert json_schema["type"] == "object"
    assert json_schema["properties"]["a"]["type"] == "number"
    assert json_schema["properties"]["a"]["description"] == "Test input node"
    assert json_schema["properties"]["a"]["minimum"] == 0
    assert json_schema["properties"]["a"]["maximum"] == 100
    assert json_schema["properties"]["a"]["default"] == 10.0
    assert json_schema["properties"]["b"]["type"] == "number"
    assert json_schema["properties"]["b"]["description"] == "Test input node"
    assert json_schema["properties"]["b"]["minimum"] == 0
    assert json_schema["properties"]["b"]["maximum"] == 100
    assert json_schema["properties"]["b"]["default"] == 10.0


class StandardNode(BaseNode):
    value: str = ""


def test_topological_sort_with_group_nodes(graph: Graph):
    # Setup nodes including group nodes and standard nodes
    parent = GroupNode(id="1")  # Group node
    child1 = StandardNode(id="2", parent_id="1")  # Child of group node
    child2 = StandardNode(id="3", parent_id="1")  # Another child of group node
    independent = StandardNode(id="4")  # A node not belonging to any group

    # Edges within the group and outside the group
    graph.nodes = [parent, child1, child2, independent]
    graph.edges = [
        Edge(
            source=parent.id,
            sourceHandle="output",
            target=child1.id,
            targetHandle="value",
        ),
        Edge(
            source=child1.id,
            sourceHandle="output",
            target=child2.id,
            targetHandle="value",
        ),
        Edge(
            source=independent.id,
            sourceHandle="output",
            target=child1.id,
            targetHandle="value",
        ),
    ]

    # Perform topological sorting
    sorted_nodes = topological_sort(graph.edges, graph.nodes)

    # Assert group node and its children are sorted correctly with respect to group constraints
    assert sorted_nodes == [
        ["1", "4"],
        ["2"],
        ["3"],
    ], "Should place the group node directly before its first child and handle other nodes correctly"


def test_build_sub_graphs(complex_group_graph: Graph):
    # Build subgraphs
    complex_group_graph.build_sub_graphs()

    # Check nodes are correctly grouped and non-group children are removed
    assert (
        len(complex_group_graph.nodes) == 3
    ), "There should be three top-level nodes (2 groups, 1 standalone)"
    assert all(
        node.parent_id is None for node in complex_group_graph.nodes
    ), "No top-level node should have a parent_id"

    # Check group nodes have correct children
    group1 = next(node for node in complex_group_graph.nodes if node.id == "group1")
    assert isinstance(group1, GroupNode), "Group1 should be a GroupNode"
    assert len(group1.nodes) == 3, "Group1 should have two nodes"

    # Check for edge from node2 to group1
    edge1 = next(
        edge
        for edge in complex_group_graph.edges
        if edge.source == "node2" and edge.target == "group1"
    )
    assert edge1, "Edge from node1 to group1 should exist"

    # Check for edge from group1 to node3
    edge2 = next(
        edge
        for edge in complex_group_graph.edges
        if edge.source == "group1" and edge.target == "node3"
    )


def test_no_group_nodes(graph: Graph):
    # Test graph with no group nodes
    node1 = FooNode(id="node1")
    node2 = FooNode(id="node2")
    edge1 = Edge(
        source=node1.id, sourceHandle="output", target=node2.id, targetHandle="value"
    )
    graph.nodes = [node1, node2]
    graph.edges = [edge1]
    graph.build_sub_graphs()

    # Validate that no changes occur in the graph structure
    assert len(graph.nodes) == 2, "Graph should still contain two nodes"
    assert len(graph.edges) == 1, "Graph should have 1 edge"
