import PIL.Image
import pytest
from genflow.api.models.graph import Edge
from genflow.metadata.types import ImageRef
from genflow.workflows.genflow_node import InputNode, GenflowNode
from genflow.nodes.genflow.constant import ImageNode, NumberNode

from genflow.workflows.graph import Graph, topological_sort
from genflow.nodes.genflow.image.transform import ContrastNode
from genflow.nodes.genflow.output import ImageOutputNode


class TestInputNode(InputNode):
    value: str = "test"

    async def process(self) -> str:
        return self.value


@pytest.fixture(scope="function")
def graph():
    return Graph()


def test_add_node(graph: Graph):
    node = GenflowNode(id="1")
    graph.add_node(node)
    assert graph.nodes == [node]


def test_find_node(graph: Graph):
    node = GenflowNode(id="1")
    graph.add_node(node)
    assert graph.find_node("1") == node


class FooNode(GenflowNode):
    value: str = "test"

    async def process(self) -> str:
        return self.value


def test_add_edge(graph: Graph):
    node = FooNode(id="1")
    another_node = FooNode(id="2")
    graph.add_node(node)
    graph.add_node(another_node)
    edge = Edge(source="1", sourceHandle="output", target="2", targetHandle="value")
    graph.add_edge(edge.source, "output", edge.target, "value")
    assert graph.edges[0].source == edge.source
    assert graph.edges[0].sourceHandle == edge.sourceHandle
    assert graph.edges[0].target == edge.target
    assert graph.edges[0].targetHandle == edge.targetHandle


def test_add_edge_with_wrong_type(graph: Graph):
    node = NumberNode(id="1")
    another_node = FooNode(id="2")
    graph.add_node(node)
    graph.add_node(another_node)
    edge = Edge(source="1", sourceHandle="output", target="2", targetHandle="value")
    with pytest.raises(ValueError):
        graph.add_edge(edge.source, "output", edge.target, "value")


def test_find_input_edge(graph: Graph):
    node = FooNode(id="1")
    another_node = FooNode(id="2")
    graph.add_node(node)
    graph.add_node(another_node)
    edge = Edge(source="1", sourceHandle="output", target="2", targetHandle="value")
    graph.add_edge(edge.source, "output", edge.target, "value")
    found_edge = graph.find_input_edge("2", "value")
    assert found_edge is not None
    assert found_edge.source == edge.source
    assert found_edge.sourceHandle == edge.sourceHandle
    assert found_edge.target == edge.target
    assert found_edge.targetHandle == edge.targetHandle


def test_topological_sort_empty_graph(graph):
    sorted_nodes = topological_sort(graph.edges, graph.nodes)
    assert sorted_nodes == [], "Should return empty list for empty graph"


def test_topological_sort_single_node(graph):
    node = GenflowNode(id="1")
    graph.add_node(node)
    sorted_nodes = topological_sort(graph.edges, graph.nodes)
    assert sorted_nodes == [
        ["1"],
    ], "Should return single node for graph with one node"


# def test_topological_sort_cycle(graph):
#     node1 = FooNode(id="1")
#     node2 = FooNode(id="2")
#     node3 = FooNode(id="3")

#     graph.add_node(node1)
#     graph.add_node(node2)
#     graph.add_node(node3)

#     graph.add_edge(node1.id, "output", node2.id, "value")
#     graph.add_edge(node2.id, "output", node3.id, "value")
#     graph.add_edge(node3.id, "output", node1.id, "value")

#     with pytest.raises(ValueError, match="Graph contains at least one cycle"):
#         topological_sort(graph.edges, graph.nodes)


def test_topological_sort(graph: Graph):
    node1 = FooNode(id="1")
    node2 = FooNode(id="2")
    node3 = FooNode(id="3")

    graph.add_node(node1)
    graph.add_node(node2)
    graph.add_node(node3)

    graph.add_edge(node1.id, "output", node2.id, "value")
    graph.add_edge(node2.id, "output", node3.id, "value")

    sorted_nodes = topological_sort(graph.edges, graph.nodes)

    assert sorted_nodes == [
        ["1"],
        ["2"],
        ["3"],
    ], "Should return nodes in topological order"


def test_topological_sort_2(graph: Graph):
    image = PIL.Image.new("RGB", (100, 100))

    image_node = ImageNode(value=ImageRef(uri="http://example.com"), id="1")
    contrast = ContrastNode(id="2")
    output = ImageOutputNode(id="3", name="output")

    graph = Graph(
        nodes=[image_node, contrast, output],
        edges=[
            Edge(
                source=image_node.id,
                sourceHandle="output",
                target=contrast.id,
                targetHandle="image",
            ),
            Edge(
                source=contrast.id,
                sourceHandle="output",
                target=output.id,
                targetHandle="image",
            ),
        ],
    )
    sorted_nodes = topological_sort(graph.edges, graph.nodes)

    assert sorted_nodes == [
        ["1"],
        ["2"],
        ["3"],
    ], "Should return nodes in topological order"


def test_topological_sort_complex_graph(graph: Graph):
    node1 = FooNode(id="1")
    node2 = FooNode(id="2")
    node3 = FooNode(id="3")
    node4 = FooNode(id="4")
    node5 = FooNode(id="5")
    node6 = FooNode(id="6")
    node7 = FooNode(id="7")

    graph.add_node(node1)
    graph.add_node(node2)
    graph.add_node(node3)
    graph.add_node(node4)
    graph.add_node(node5)
    graph.add_node(node6)
    graph.add_node(node7)

    graph.add_edge(node1.id, "output", node2.id, "value")
    graph.add_edge(node1.id, "output", node3.id, "value")
    graph.add_edge(node2.id, "output", node4.id, "value")
    graph.add_edge(node2.id, "output", node5.id, "value")
    graph.add_edge(node3.id, "output", node6.id, "value")
    graph.add_edge(node3.id, "output", node7.id, "value")
    graph.add_edge(node4.id, "output", node5.id, "value")
    graph.add_edge(node6.id, "output", node7.id, "value")

    sorted_nodes = topological_sort(graph.edges, graph.nodes)

    assert sorted_nodes == [
        ["1"],
        ["2", "3"],
        ["4", "6"],
        ["5", "7"],
    ], "Should return nodes in topological order"


def test_json_schema(graph: Graph):
    a = TestInputNode(id="1", name="a")
    b = TestInputNode(id="2", name="b")

    graph.add_node(a)
    graph.add_node(b)

    json_schema = graph.get_json_schema()

    assert json_schema == {
        "type": "object",
        "properties": {
            "1": {
                "type": "string",
            },
            "2": {"type": "string"},
        },
    }, "Should return JSON schema for graph"
