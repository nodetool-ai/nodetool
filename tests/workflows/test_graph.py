import PIL.Image
import pytest
from nodetool.api.types.graph import Edge
from nodetool.metadata.types import ImageRef
from nodetool.nodes.nodetool.input import FloatInputNode
from nodetool.workflows.base_node import BaseNode
from nodetool.nodes.nodetool.constant import ImageNode

from nodetool.workflows.graph import Graph, topological_sort
from nodetool.nodes.nodetool.image.transform import ContrastNode
from nodetool.nodes.nodetool.output import ImageOutputNode


@pytest.fixture(scope="function")
def graph():
    return Graph()


class FooNode(BaseNode):
    value: str = "test"

    async def process(self) -> str:
        return self.value


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

    sorted_nodes = topological_sort(graph.edges, graph.nodes)

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
