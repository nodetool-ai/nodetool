from nodetool.common.environment import Environment
from datetime import datetime
from nodetool.common.replicate_node import convert_enum_value
from nodetool.common.replicate_node import convert_output_value
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from typing import Any, Type
from nodetool.workflows.types import NodeUpdate


class HuggingfaceNode(BaseNode):

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not HuggingfaceNode

    async def run_huggingface(
        self,
        model_id: str,
        context: ProcessingContext,
        params: dict[(str, Any)] | None = None,
        data: bytes | None = None,
    ) -> Any:
        if params and data:
            raise ValueError("Cannot provide both params and data to run_huggingface.")
        raw_inputs = {
            prop.name: convert_enum_value(getattr(self, prop.name))
            for prop in self.properties()
        }
        raw_inputs = {**raw_inputs, **(params or {})}

        input_params = {
            prop.name: await context.convert_value_for_prediction(
                prop,
                getattr(self, prop.name),
            )
            for prop in self.properties()
        }
        input_params = {
            key: value for (key, value) in input_params.items() if (value is not None)
        }
        input_params = {**input_params, **(params or {})}

        context.post_message(
            NodeUpdate(
                node_id=self.id,
                node_name=model_id,
                status="starting",
                started_at=datetime.now().isoformat(),
            )
        )

        return await context.run_prediction(
            provider="huggingface",
            node_id=self.id,
            model=model_id,
            params=input_params,
            data=data,
        )

    async def extra_params(self, context: ProcessingContext) -> dict:
        return {}

    async def convert_output(self, context: ProcessingContext, output: Any) -> Any:
        t = self.return_type()
        if isinstance(t, dict):
            return output
        if isinstance(t, Type):
            output = await convert_output_value(output, t)
        return {
            "output": output,
        }
