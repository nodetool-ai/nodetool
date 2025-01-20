import pytest
import os
from nodetool.workflows.base_node import type_metadata
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.workflow_node import WorkflowNode


math_json = {
    "number1": {
        "inputs": {"name": "number1", "value": 1},
        "type": "nodetool.input.IntegerInput",
    },
    "number2": {
        "inputs": {"name": "number2", "value": 2},
        "type": "nodetool.input.IntegerInput",
    },
    "addition": {
        "inputs": {"a": ["number1", "output"], "b": ["number2", "output"]},
        "type": "nodetool.math.Add",
    },
    "output": {
        "inputs": {"name": "output", "value": ["addition", "output"]},
        "type": "nodetool.output.IntegerOutput",
    },
}


def test_read_workflow():
    workflow_json = WorkflowNode(workflow_json=math_json)
    graph = workflow_json.load_graph()
    assert graph


@pytest.mark.asyncio
async def test_process(context: ProcessingContext):
    workflow_node = WorkflowNode(
        workflow_json=math_json, dynamic_properties={"number1": 1, "number2": 2}  # type: ignore
    )

    output = await workflow_node.process(context)

    assert output == {"output": 3}
