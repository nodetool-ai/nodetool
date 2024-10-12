import pytest
from nodetool.types.graph import Edge
from nodetool.nodes.nodetool.group import Loop
from nodetool.nodes.nodetool.math import Multiply
from nodetool.workflows.base_node import GroupNode
from nodetool.nodes.nodetool.input import FloatInput, GroupInput
from nodetool.nodes.nodetool.output import GroupOutput
from nodetool.workflows.base_node import BaseNode

from nodetool.workflows.graph import Graph
import pytest
from nodetool.workflows.graph import Graph
from nodetool.workflows.base_node import (
    BaseNode,
)
from nodetool.types.graph import Edge
from nodetool.workflows.graph import BaseNode, Edge


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
    input_node = GroupInput(id="input1", parent_id="group1")
    output_node = GroupOutput(id="output1", parent_id="group1")

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
    nodes = [
        FooNode("1"),
        FooNode("2"),
        FooNode("3"),
        FooNode("4"),
        FooNode("5"),
        FooNode("6"),
        FooNode("7"),
    ]
    edges = [
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
    return Graph(nodes=nodes, edges=edges)


def test_topological_sort_empty_graph(graph: Graph):
    sorted_nodes = graph.topological_sort()
    assert sorted_nodes == [], "Should return empty list for empty graph"


def test_topological_sort_single_node(graph: Graph):
    node = BaseNode(id="1")
    graph.nodes = [node]
    sorted_nodes = graph.topological_sort()
    assert sorted_nodes == [
        ["1"],
    ], "Should return single node for graph with one node"


def test_topological_sort_three_layers(graph: Graph):
    node1 = FooNode("1")
    node2 = FooNode("2")
    node3 = FooNode("3")

    graph.nodes = [node1, node2, node3]
    graph.edges = [
        Edge(
            source="1",
            sourceHandle="output",
            target="2",
            targetHandle="value",
        ),
        Edge(
            source="2",
            sourceHandle="output",
            target="3",
            targetHandle="value",
        ),
    ]
    sorted_nodes = graph.topological_sort()

    assert sorted_nodes == [
        ["1"],
        ["2"],
        ["3"],
    ], "Should return nodes in topological order"


def test_topological_sort_complex_graph(complex_graph: Graph):
    sorted_nodes = complex_graph.topological_sort()

    assert sorted_nodes == [
        ["1"],
        ["2", "3"],
        ["4", "6"],
        ["5", "7"],
    ], "Should return nodes in topological order"


class StandardNode(BaseNode):
    value: str = ""


def test_topological_sort_with_group_nodes(graph: Graph):
    # Setup nodes including group nodes and standard nodes
    parent = Loop(id="1")  # Group node
    child1 = StandardNode(id="2", parent_id="1")  # Child of group node
    child2 = StandardNode(id="3", parent_id="1")  # Another child of group node
    independent = StandardNode(id="4")  # A node not belonging to any group

    # Edges within the group and outside the group
    graph.nodes = [parent, child1, child2, independent]
    graph.edges = [
        Edge(
            source="1",
            sourceHandle="output",
            target="2",
            targetHandle="value",
        ),
        Edge(
            source="2",
            sourceHandle="output",
            target="3",
            targetHandle="value",
        ),
        Edge(
            source="4",
            sourceHandle="output",
            target="2",
            targetHandle="value",
        ),
    ]

    # Perform topological sorting
    sorted_nodes = graph.topological_sort()

    # Assert group node and its children are sorted correctly with respect to group constraints
    assert sorted_nodes == [
        ["1", "4"],
    ], "Should return nodes in topological order"


@pytest.fixture
def empty_graph():
    return Graph()


def test_empty_graph_initialization(empty_graph):
    assert len(empty_graph.nodes) == 0, "Graph should initialize with no nodes"
    assert len(empty_graph.edges) == 0, "Graph should initialize with no edges"


def test_add_node(empty_graph):
    node = BaseNode(id="node1")
    empty_graph.nodes.append(node)
    assert node in empty_graph.nodes, "Node should be added to the graph"


def test_topological_sort_with_parent_id(graph: Graph):
    # Setup nodes including group nodes and standard nodes
    parent = GroupNode(id="1")  # Group node
    child1 = StandardNode(id="2", parent_id="1")  # Child of group node
    child2 = StandardNode(id="3", parent_id="1")  # Another child of group node
    independent = StandardNode(id="4")  # A node not belonging to any group

    # Edges within the group and outside the group
    graph.nodes = [parent, child1, child2, independent]
    graph.edges = [
        Edge(
            source="2",
            sourceHandle="output",
            target="3",
            targetHandle="value",
        ),
        Edge(
            source="4",
            sourceHandle="output",
            target="2",
            targetHandle="value",
        ),
    ]

    # Perform topological sorting with parent_id="1"
    sorted_nodes = graph.topological_sort(parent_id="1")

    # Assert only nodes with parent_id="1" are included and properly sorted
    assert sorted_nodes == [
        ["2"],
        ["3"],
    ], "Should return only nodes with parent_id='1' in topological order"


def test_topological_sort_with_parent_id_complex(complex_group_graph: Graph):
    sorted_nodes = complex_group_graph.topological_sort(parent_id="group1")

    # Assert only nodes within group1 are included and properly sorted
    assert sorted_nodes == [
        ["input1"],
        ["node1"],
        ["output1"],
    ], "Should return only nodes within group1 in topological order"


def test_topological_sort_with_nonexistent_parent_id(graph: Graph):
    # Setup nodes
    node1 = StandardNode(id="1")
    node2 = StandardNode(id="2")

    graph.nodes = [node1, node2]
    graph.edges = [
        Edge(
            source="1",
            sourceHandle="output",
            target="2",
            targetHandle="value",
        ),
    ]

    # Perform topological sorting with a non-existent parent_id
    sorted_nodes = graph.topological_sort(parent_id="nonexistent")

    # Assert an empty list is returned when no nodes match the parent_id
    assert (
        sorted_nodes == []
    ), "Should return an empty list when no nodes match the parent_id"


def test_topological_sort_with_mixed_parent_ids(graph: Graph):
    # Setup nodes with mixed parent_ids
    parent1 = GroupNode(id="group1")
    parent2 = GroupNode(id="group2")
    child1 = StandardNode(id="1", parent_id="group1")
    child2 = StandardNode(id="2", parent_id="group1")
    child3 = StandardNode(id="3", parent_id="group2")
    independent = StandardNode(id="4")

    graph.nodes = [parent1, parent2, child1, child2, child3, independent]
    graph.edges = [
        Edge(
            source="1",
            sourceHandle="output",
            target="2",
            targetHandle="value",
        ),
        Edge(
            source="3",
            sourceHandle="output",
            target="4",
            targetHandle="value",
        ),
    ]

    # Perform topological sorting with parent_id="group1"
    sorted_nodes = graph.topological_sort(parent_id="group1")

    # Assert only nodes with parent_id="group1" are included and properly sorted
    assert sorted_nodes == [
        ["1"],
        ["2"],
    ], "Should return only nodes with parent_id='group1' in topological order"
