import PIL.Image
import PIL.ImageChops
import pytest
from nodetool.api.types.graph import Node, Edge
from nodetool.nodes.nodetool.output import GroupOutput
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef
from nodetool.workflows.types import WorkflowUpdate
from nodetool.workflows.workflow_runner import WorkflowRunner
from nodetool.models.user import User
from nodetool.workflows.graph import Graph
from nodetool.api.types.graph import (
    Graph as APIGraph,
)
from nodetool.nodes.nodetool.constant import FloatNode, StringNode
from nodetool.nodes.nodetool.image import BlendNode
from nodetool.nodes.nodetool.input import (
    FloatInputNode,
    GroupInput,
    ImageInputNode,
    IntInputNode,
)
from nodetool.nodes.nodetool.group import LoopNode
from nodetool.nodes.nodetool.math import AddNode, MultiplyNode
from nodetool.nodes.nodetool.output import ImageOutputNode, IntOutputNode


@pytest.fixture
def workflow_runner(user: User):
    return WorkflowRunner()


@pytest.mark.asyncio
async def test_process_node(user: User, workflow_runner: WorkflowRunner):
    node = StringNode(id="1", value="test")
    context = ProcessingContext(user_id="", workflow_id="", edges=[], nodes=[node])
    await workflow_runner.process_node(context, node)
    assert context.get_result("1", "output") == "test"


@pytest.mark.asyncio
async def test_process_node_with_input_edges(
    user: User, workflow_runner: WorkflowRunner
):
    input_a = {"id": "1", "type": FloatNode.get_node_type(), "data": {"value": 1}}
    input_b = {"id": "2", "type": FloatNode.get_node_type(), "data": {"value": 2}}
    add_node = {"id": "3", "type": AddNode.get_node_type()}
    nodes = [input_a, input_b, add_node]
    edges = [
        {
            "id": "1",
            "source": "1",
            "target": "3",
            "sourceHandle": "output",
            "targetHandle": "a",
        },
        {
            "id": "2",
            "source": "2",
            "target": "3",
            "sourceHandle": "output",
            "targetHandle": "b",
        },
    ]

    graph = Graph.from_dict({"nodes": nodes, "edges": edges})

    context = ProcessingContext(
        user_id="", workflow_id="", edges=graph.edges, nodes=graph.nodes
    )

    await workflow_runner.process_graph(context)
    assert context.get_result("3", "output") == 3


async def get_workflow_updates(context: ProcessingContext):
    messages = []

    while context.has_messages():
        messages.append(await context.pop_message_async())

    return list(filter(lambda x: isinstance(x, WorkflowUpdate), messages))


@pytest.mark.asyncio
async def test_process_node_image_blend(
    user: User, context: ProcessingContext, workflow_runner: WorkflowRunner
):
    image_a = await context.image_from_pil(
        PIL.Image.new("RGB", (100, 100), color=(255, 0, 0))
    )
    image_b = await context.image_from_pil(
        PIL.Image.new("RGB", (100, 100), color=(0, 255, 0))
    )

    image_input_a = {
        "id": "1",
        "type": ImageInputNode.get_node_type(),
        "data": {
            "name": "image_a",
            "value": {
                "type": "image",
                "uri": image_a.uri,
            },
        },
    }
    image_input_b = {
        "id": "2",
        "type": ImageInputNode.get_node_type(),
        "data": {
            "name": "image_b",
            "value": {
                "type": "image",
                "uri": image_b.uri,
            },
        },
    }
    alpha_input = {
        "id": "3",
        "type": FloatInputNode.get_node_type(),
        "data": {"name": "alpha", "value": 0.5},
    }
    blend_node = {
        "id": "4",
        "type": BlendNode.get_node_type(),
    }
    image_output = {
        "id": "5",
        "type": ImageOutputNode.get_node_type(),
        "data": {
            "name": "output",
            "image": {"type": "image", "uri": "", "asset_id": None},
        },
    }

    nodes = [
        image_input_a,
        image_input_b,
        alpha_input,
        blend_node,
        image_output,
    ]

    edges = [
        {
            "id": "1",
            "source": "1",
            "target": "4",
            "sourceHandle": "output",
            "targetHandle": "image1",
            "ui_properties": {},
        },
        {
            "id": "2",
            "source": "2",
            "target": "4",
            "sourceHandle": "output",
            "targetHandle": "image2",
            "ui_properties": {},
        },
        {
            "id": "3",
            "source": "3",
            "target": "4",
            "sourceHandle": "output",
            "targetHandle": "alpha",
            "ui_properties": {},
        },
        {
            "id": "4",
            "source": "4",
            "target": "5",
            "sourceHandle": "output",
            "targetHandle": "value",
            "ui_properties": {},
        },
    ]

    graph = APIGraph(nodes=[Node(**n) for n in nodes], edges=[Edge(**e) for e in edges])

    context = ProcessingContext(user_id=user.id)
    params = {"image_a": image_a, "image_b": image_b, "alpha": 0.5}

    req = RunJobRequest(
        user_id=user.id,
        workflow_id="",
        job_type="",
        params=params,
        graph=graph,
    )

    out = await workflow_runner.run(req, context)

    workflow_updates = await get_workflow_updates(context)

    assert len(workflow_updates) == 1
    assert type(workflow_updates[0].result["output"]) == ImageRef


@pytest.mark.asyncio
async def test_process_graph(user: User, workflow_runner: WorkflowRunner):
    input_a = {
        "id": "1",
        "data": {"name": "input_1"},
        "type": IntInputNode.get_node_type(),
    }
    input_b = {
        "id": "2",
        "data": {"name": "input_2"},
        "type": IntInputNode.get_node_type(),
    }
    add_node = {"id": "3", "type": AddNode.get_node_type()}
    out_node = {
        "id": "4",
        "data": {"name": "output"},
        "type": IntOutputNode.get_node_type(),
    }

    nodes = [
        input_a,
        input_b,
        add_node,
        out_node,
    ]

    edges = [
        {
            "id": "1",
            "source": "1",
            "target": "3",
            "sourceHandle": "output",
            "targetHandle": "a",
            "ui_properties": {},
        },
        {
            "id": "2",
            "source": "2",
            "target": "3",
            "sourceHandle": "output",
            "targetHandle": "b",
            "ui_properties": {},
        },
        {
            "id": "3",
            "source": "3",
            "target": "4",
            "sourceHandle": "output",
            "targetHandle": "value",
            "ui_properties": {},
        },
    ]
    graph = APIGraph(nodes=[Node(**n) for n in nodes], edges=[Edge(**e) for e in edges])
    params = {"input_1": 1, "input_2": 2}

    req = RunJobRequest(
        user_id=user.id,
        workflow_id="",
        job_type="",
        params=params,
        graph=graph,
    )
    context = ProcessingContext(user_id=user.id)

    await workflow_runner.run(req, context)

    workflow_updates = await get_workflow_updates(context)

    assert len(workflow_updates) == 1
    assert workflow_updates[0].result["output"] == 3


@pytest.mark.asyncio
async def test_loop_node(user: User, workflow_runner: WorkflowRunner):
    loop_node = {
        "id": "loop",
        "type": LoopNode.get_node_type(),
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
        "type": MultiplyNode.get_node_type(),
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
    graph.build_sub_graphs()

    context = ProcessingContext(
        user_id="", workflow_id="", edges=graph.edges, nodes=graph.nodes
    )
    node = graph.find_node("loop")
    assert node is not None
    node.assign_property("input", [1, 2, 3])

    await workflow_runner.process_graph(context)

    assert context.get_result("loop", "output") == [1, 4, 9]
