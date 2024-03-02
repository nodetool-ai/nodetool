from genflow.workflows.genflow_node import GenflowNode
from genflow.workflows.processing_context import ProcessingContext


from typing import Any


class LoopNode(GenflowNode):
    """
    A loop node will loop over a list of items and process the
    remaining nodes for each item.
    """

    items: list[Any] = []

    async def process(self, context: ProcessingContext) -> Any:
        return None


class LoopOutputNode(GenflowNode):
    """
    A loop output node will output the result of a loop.
    """

    input: Any = None

    async def process(self, context: ProcessingContext) -> Any:
        return self.input
