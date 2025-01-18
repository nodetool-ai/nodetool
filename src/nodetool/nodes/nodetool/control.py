from enum import Enum
from typing import Any, Optional, List
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class If(BaseNode):
    """
    Conditionally executes one of two branches based on a condition.
    control, flow, condition, logic, else, true, false, switch, toggle, flow-control

    Use cases:
    - Branch workflow based on conditions
    - Handle different cases in data processing
    - Implement decision logic
    """

    condition: bool = Field(default=False, description="The condition to evaluate")
    value: Any = Field(default=None, description="The value to pass to the next node")

    @classmethod
    def return_type(cls):
        return {"if_true": Any, "if_false": Any}

    async def process(self, context: ProcessingContext):
        return {
            "if_true": self.value if self.condition else None,
            "if_false": self.value if not self.condition else None,
        }
