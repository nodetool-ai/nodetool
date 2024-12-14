from pydantic import Field
from nodetool.metadata.types import DataframeRef
from nodetool.workflows.base_node import GroupNode
from nodetool.workflows.processing_context import ProcessingContext

from typing import Any


class Loop(GroupNode):
    """
    Loops over a list of items and processes the remaining nodes for each item.
    loop, itereate, repeat, for, each, batch

    Use cases:
    - Loop over a list of items and process the nodes inside the group
    """

    input: Any = Field(default_factory=list, description="The input data to loop over.")

    async def process(self, context: ProcessingContext) -> Any:
        raise NotImplementedError()
