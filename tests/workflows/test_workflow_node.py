import pytest
import os
from genflow.workflows.genflow_node import type_metadata
from genflow.workflows.processing_context import ProcessingContext
from genflow.workflows.workflow_node import WorkflowNode
import genflow.nodes


current_dir = os.path.dirname(os.path.realpath(__file__))
math_json = os.path.join(current_dir, "math_workflow.json")


class MathWorkflowNode(WorkflowNode):
    @classmethod
    def get_workflow_file(cls) -> str:
        return math_json


def test_read_workflow():
    workflow_json = MathWorkflowNode.read_workflow()
    assert workflow_json


def test_properties():
    properties = MathWorkflowNode.properties()
    assert len(properties) == 2
    assert properties[0].name == "number1"
    assert properties[0].type == type_metadata(int)
    assert properties[1].name == "number2"
    assert properties[1].type == type_metadata(int)


@pytest.mark.asyncio
async def test_process(context: ProcessingContext):
    workflow_node = MathWorkflowNode()

    output = await workflow_node.process(context)

    assert output == {"output": 3}
