import pytest
from nodetool.api.types.graph import Edge
from nodetool.nodes.nodetool.group import Loop
from nodetool.nodes.nodetool.math import Multiply
from nodetool.workflows.base_node import GroupNode
from nodetool.nodes.nodetool.input import FloatInput, GroupInput
from nodetool.nodes.nodetool.output import GroupOutput
from nodetool.workflows.base_node import BaseNode

from nodetool.workflows.graph import Graph, topological_sort
import pytest
from nodetool.workflows.graph import Graph
from nodetool.workflows.base_node import (
    BaseNode,
)
from nodetool.api.types.graph import Edge
from nodetool.workflows.graph import GroupNode, BaseNode, Edge


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
    graph.nodes = [
        FooNode("1"),
        FooNode("2"),
        FooNode("3"),
        FooNode("4"),
        FooNode("5"),
        FooNode("6"),
        FooNode("7"),
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
    a = FloatInput(
        id="1", name="a", label="", description="Test input node", value=10.0
    )
    b = FloatInput(
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
    sorted_nodes = topological_sort(graph.edges, graph.nodes)

    # Assert group node and its children are sorted correctly with respect to group constraints
    assert sorted_nodes == [
        ["1", "4"],
        ["2"],
        ["3"],
    ], "Should place the group node directly before its first child and handle other nodes correctly"


def test_build_sub_graphs(complex_group_graph: Graph):
    # Build subgraphs
    graph = complex_group_graph.build_sub_graphs()

    # Check nodes are correctly grouped and non-group children are removed
    assert (
        len(graph.nodes) == 3
    ), "There should be three top-level nodes (2 groups, 1 standalone)"

    assert all(
        not node.has_parent() for node in graph.nodes
    ), "No top-level node should have a parent_id"

    # Check group nodes have correct children
    group1 = next(node for node in graph.nodes if node.id == "group1")
    assert isinstance(group1, GroupNode), "Group1 should be a GroupNode"
    assert len(group1._nodes) == 3, "Group1 should have two nodes"

    # Check for edge from node2 to group1
    edge1 = next(
        edge
        for edge in graph.edges
        if edge.source == "node2" and edge.target == "group1"
    )
    assert edge1, "Edge from node1 to group1 should exist"

    # Check for edge from group1 to node3
    edge2 = next(
        edge
        for edge in graph.edges
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


def test_build_subgraphs():
    graph = Graph()
    group_node = GroupNode(id="group1")
    child_node = BaseNode(id="child1", parent_id="group1")
    unrelated_node = BaseNode(id="node2")
    graph.nodes.extend([group_node, child_node, unrelated_node])
    graph.build_sub_graphs()
    assert (
        child_node in group_node._nodes
    ), "Child nodes should be assigned to the correct group"
    assert (
        unrelated_node in graph.nodes
    ), "Unrelated nodes should remain in the main graph"
    assert (
        group_node in graph.nodes
    ), "Group nodes should appear as standalone nodes in the main graph"


def test_reconnect_edges_modified():
    graph = Graph()
    group_node = GroupNode(id="group1")  # type: ignore
    random_node = BaseNode(id="node2")
    another_node = BaseNode(id="node3")
    graph.nodes.extend([group_node, random_node, another_node])

    # Create GroupInputNode and GroupOutputNode
    input_node = GroupInput(id="input1", parent_id="group1")  # type: ignore
    output_node = GroupOutput(id="output1", parent_id="group1")  # type: ignore
    graph.nodes.extend([input_node, output_node])

    # Connect edges to GroupInputNode and GroupOutputNode
    edge_input = Edge(
        source="node2", sourceHandle="output", target="input1", targetHandle="input"
    )
    edge_output = Edge(
        source="output1", sourceHandle="output", target="node3", targetHandle="input"
    )
    graph.edges.extend([edge_input, edge_output])

    edges = graph.reconnect_edges({group_node._id: group_node})
    assert any(
        e.source == "group1" for e in edges
    ), "Edges should be reconnected to group nodes"


# Run the tests
if __name__ == "__main__":
    pytest.main()


def test_reconnect_edges(graph: Graph):
    # Create nodes
    node1 = BaseNode("1")
    node2 = BaseNode("2")
    node3 = BaseNode("3")
    node4 = BaseNode("4")
    node5 = BaseNode("5")

    # Create edges
    edge1 = Edge(source="1", sourceHandle="output", target="2", targetHandle="input")
    edge2 = Edge(source="2", sourceHandle="output", target="3", targetHandle="input")
    edge3 = Edge(source="3", sourceHandle="output", target="4", targetHandle="input")
    edge4 = Edge(source="4", sourceHandle="output", target="5", targetHandle="input")

    # Add nodes and edges to the graph
    graph.nodes = [node1, node2, node3, node4, node5]
    graph.edges = [edge1, edge2, edge3, edge4]

    # Reconnect the edges
    graph.reconnect_edges({})

    # Check the updated edges
    assert graph.edges == [
        Edge(source="1", sourceHandle="output", target="2", targetHandle="input"),
        Edge(source="2", sourceHandle="output", target="3", targetHandle="input"),
        Edge(source="3", sourceHandle="output", target="4", targetHandle="input"),
        Edge(source="4", sourceHandle="output", target="5", targetHandle="input"),
    ], "Edges should remain unchanged when there are no group nodes"


def test_reconnect_edges_with_group_nodes(graph: Graph):
    loop_node = {
        "id": "loop",
        "type": Loop.get_node_type(),
    }
    input_node = {
        "id": "in",
        "parent_id": "loop",
        "type": GroupInput.get_node_type(),
        "data": {
            "name": "input",
        },
    }
    output_node = {
        "id": "out",
        "parent_id": "loop",
        "type": GroupOutput.get_node_type(),
        "data": {"name": "output"},
    }
    multiply_node = {
        "id": "mul",
        "parent_id": "loop",
        "type": Multiply.get_node_type(),
        "data": {},
    }
    nodes = [loop_node, input_node, multiply_node, output_node]
    edges = [
        Edge(
            id="1",
            source="in",
            target="mul",
            sourceHandle="output",
            targetHandle="a",
        ),
        Edge(
            id="2",
            source="in",
            target="mul",
            sourceHandle="output",
            targetHandle="b",
        ),
        Edge(
            id="3",
            source="mul",
            target="out",
            sourceHandle="output",
            targetHandle="input",
        ),
    ]
    graph = Graph.from_dict({"nodes": nodes, "edges": edges})
    g = graph.build_sub_graphs()

    assert len(g.nodes) == 1, "Should return one node"
    assert len(g.edges) == 0, "Should return no edges"
